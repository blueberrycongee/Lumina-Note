use crate::error::AppError;
use base64::Engine as _;
use futures_util::StreamExt;
use minisign_verify::{PublicKey, Signature};
use reqwest::header::{
    HeaderValue, ACCEPT, ACCEPT_ENCODING, CONTENT_LENGTH, CONTENT_RANGE, ETAG, IF_RANGE,
    IF_UNMODIFIED_SINCE, LAST_MODIFIED, RANGE,
};
use reqwest::StatusCode;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use uuid::Uuid;

const RESUMABLE_EVENT_NAME: &str = "update:resumable-event";
const STATE_FILE_NAME: &str = "state.json";
const PART_FILE_NAME: &str = "package.part";
const MAX_DOWNLOAD_ATTEMPTS: u32 = 3;
const BASE_RETRY_DELAY_MS: u64 = 1_500;
const MAX_RETRY_DELAY_MS: u64 = 12_000;
const DOWNLOAD_TIMEOUT_MS: u64 = 120_000;
const SAVE_STATE_INTERVAL_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UpdateStage {
    Downloading,
    Verifying,
    Installing,
    Ready,
    Error,
    Cancelled,
}

impl UpdateStage {
    fn is_terminal(self) -> bool {
        matches!(self, Self::Ready | Self::Error | Self::Cancelled)
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
enum ResumableEventType {
    Started,
    Resumed,
    Progress,
    Retrying,
    Verifying,
    Installing,
    Ready,
    Error,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumableUpdateStatus {
    pub task_id: String,
    pub version: String,
    pub attempt: u32,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub resumable: bool,
    pub stage: UpdateStage,
    pub status: UpdateStage,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub timestamp: i64,
    pub retry_delay_ms: Option<u64>,
    pub last_http_status: Option<u16>,
    pub can_resume_after_restart: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedUpdateState {
    status: ResumableUpdateStatus,
    download_url: String,
    signature: String,
    etag: Option<String>,
    last_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResumableEventPayload {
    #[serde(rename = "type")]
    event_type: ResumableEventType,
    #[serde(flatten)]
    status: ResumableUpdateStatus,
}

#[derive(Default)]
struct UpdateManagerRuntime {
    active_task_id: Option<String>,
    statuses: HashMap<String, ResumableUpdateStatus>,
    cancelled_tasks: HashSet<String>,
}

pub struct UpdateManagerState {
    inner: Arc<Mutex<UpdateManagerRuntime>>,
}

impl Default for UpdateManagerState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(UpdateManagerRuntime::default())),
        }
    }
}

#[tauri::command]
pub async fn update_start_resumable_install(
    app: AppHandle,
    manager_state: State<'_, UpdateManagerState>,
    proxy_state: State<'_, crate::proxy::ProxyState>,
    expected_version: Option<String>,
) -> Result<String, AppError> {
    let updater = app
        .updater()
        .map_err(|err| AppError::Update(format!("build updater failed: {err}")))?;
    let update = updater
        .check()
        .await
        .map_err(|err| AppError::Update(format!("check update failed: {err}")))?
        .ok_or_else(|| AppError::Update("no update available".to_string()))?;

    if let Some(expected_version) = expected_version {
        if update.version != expected_version {
            return Err(AppError::Update(format!(
                "expected version {expected_version}, but latest is {}",
                update.version
            )));
        }
    }

    {
        let runtime = manager_state.inner.lock().await;
        if let Some(active_task_id) = runtime.active_task_id.as_ref() {
            if let Some(active_status) = runtime.statuses.get(active_task_id) {
                if active_status.version == update.version && !active_status.stage.is_terminal() {
                    return Ok(active_task_id.clone());
                }
            }
        }
    }

    let version_dir = version_dir(&app, &update.version)?;
    tokio::fs::create_dir_all(&version_dir)
        .await
        .map_err(|err| AppError::UpdateState(format!("create update dir failed: {err}")))?;

    let mut persisted_state = load_state_file(&version_dir)
        .await?
        .unwrap_or_else(|| new_persisted_state(&update, None));

    if persisted_state.status.stage.is_terminal()
        || persisted_state.download_url != update.download_url.as_str()
        || persisted_state.signature != update.signature
    {
        clear_version_cache(&version_dir).await?;
        persisted_state = new_persisted_state(&update, None);
    }

    if persisted_state.status.task_id.is_empty() {
        persisted_state.status.task_id = Uuid::new_v4().to_string();
    }
    if persisted_state.status.timestamp <= 0 {
        persisted_state.status.timestamp = now_millis();
    }

    let task_id = persisted_state.status.task_id.clone();
    let is_resumed = persisted_state.status.downloaded_bytes > 0;

    {
        let mut runtime = manager_state.inner.lock().await;
        runtime.active_task_id = Some(task_id.clone());
        runtime.cancelled_tasks.remove(&task_id);
        runtime
            .statuses
            .insert(task_id.clone(), persisted_state.status.clone());
    }

    save_state_file(&version_dir, &persisted_state).await?;

    let app_handle = app.clone();
    let runtime_state = manager_state.inner.clone();
    let task_id_for_task = task_id.clone();
    let http_client = proxy_state.client().await;
    tauri::async_runtime::spawn(async move {
        let result = run_update_task(
            app_handle.clone(),
            runtime_state.clone(),
            version_dir,
            persisted_state,
            update,
            is_resumed,
            http_client,
        )
        .await;

        if let Err(err) = result {
            let _ = emit_terminal_error(app_handle, runtime_state, &task_id_for_task, err).await;
        }
    });

    Ok(task_id)
}

#[tauri::command]
pub async fn update_get_resumable_status(
    app: AppHandle,
    manager_state: State<'_, UpdateManagerState>,
    task_id: Option<String>,
) -> Result<Option<ResumableUpdateStatus>, AppError> {
    let current_version = app.package_info().version.to_string();
    if task_id.is_none() {
        prune_stale_persisted_terminal_states(&app, &current_version).await?;
    }

    {
        let runtime = manager_state.inner.lock().await;
        if let Some(task_id) = task_id.as_ref() {
            if let Some(status) = runtime.statuses.get(task_id) {
                return Ok(
                    is_status_actionable_for_current_version(status, &current_version)
                        .then_some(status.clone()),
                );
            }
        } else if let Some(active_task_id) = runtime.active_task_id.as_ref() {
            if let Some(status) = runtime.statuses.get(active_task_id) {
                if is_status_actionable_for_current_version(status, &current_version) {
                    return Ok(Some(status.clone()));
                }
            }
        }

        if task_id.is_none() {
            if let Some(status) = runtime
                .statuses
                .values()
                .filter(|status| is_status_actionable_for_current_version(status, &current_version))
                .max_by_key(|status| status.timestamp)
            {
                return Ok(Some(status.clone()));
            }
        }
    }

    if let Some(task_id) = task_id {
        return load_status_by_task_id(&app, &task_id, &current_version).await;
    }

    load_latest_persisted_status(&app, &current_version).await
}

#[tauri::command]
pub async fn update_cancel_resumable_install(
    app: AppHandle,
    manager_state: State<'_, UpdateManagerState>,
    task_id: Option<String>,
) -> Result<(), AppError> {
    let mut status_to_emit: Option<ResumableUpdateStatus> = None;
    let target_task_id = {
        let mut runtime = manager_state.inner.lock().await;
        let target_task_id = task_id
            .or_else(|| runtime.active_task_id.clone())
            .ok_or_else(|| AppError::Update("no active update task".to_string()))?;
        let current_stage = runtime
            .statuses
            .get(&target_task_id)
            .map(|status| status.stage);
        if let Some(stage) = current_stage {
            if !can_cancel_from_stage(stage) {
                return Err(cancel_not_allowed_error(stage));
            }
            runtime.cancelled_tasks.insert(target_task_id.clone());
            let status = runtime
                .statuses
                .get_mut(&target_task_id)
                .ok_or_else(|| AppError::Update("update status disappeared".to_string()))?;
            status.stage = UpdateStage::Cancelled;
            status.status = UpdateStage::Cancelled;
            status.error_code = Some("cancelled".to_string());
            status.error_message = Some("Update cancelled by user".to_string());
            status.timestamp = now_millis();
            status_to_emit = Some(status.clone());
        } else {
            runtime.cancelled_tasks.insert(target_task_id.clone());
        }
        if runtime.active_task_id.as_deref() == Some(target_task_id.as_str()) {
            runtime.active_task_id = None;
        }
        target_task_id
    };

    if let Some(status) = status_to_emit {
        let _ = app.emit(
            RESUMABLE_EVENT_NAME,
            ResumableEventPayload {
                event_type: ResumableEventType::Cancelled,
                status: status.clone(),
            },
        );
        let version_dir = version_dir(&app, &status.version)?;
        if let Some(mut persisted) = load_state_file(&version_dir).await? {
            persisted.status = status;
            save_state_file(&version_dir, &persisted).await?;
        }
    } else {
        let _ = target_task_id;
    }

    Ok(())
}

#[tauri::command]
pub async fn update_clear_resumable_cache(
    app: AppHandle,
    manager_state: State<'_, UpdateManagerState>,
    version: Option<String>,
) -> Result<(), AppError> {
    let root = updates_root(&app)?;
    if let Some(version) = version {
        let dir = root.join(sanitize_path_segment(&version));
        if dir.exists() {
            tokio::fs::remove_dir_all(&dir)
                .await
                .map_err(|err| AppError::UpdateState(format!("remove cache dir failed: {err}")))?;
        }
        let mut runtime = manager_state.inner.lock().await;
        runtime
            .statuses
            .retain(|_, status| status.version != version);
        if let Some(active_task_id) = runtime.active_task_id.clone() {
            if runtime
                .statuses
                .get(&active_task_id)
                .map(|status| status.version == version)
                .unwrap_or(false)
            {
                runtime.active_task_id = None;
            }
        }
        return Ok(());
    }

    if root.exists() {
        tokio::fs::remove_dir_all(&root)
            .await
            .map_err(|err| AppError::UpdateState(format!("clear cache failed: {err}")))?;
    }
    tokio::fs::create_dir_all(&root)
        .await
        .map_err(|err| AppError::UpdateState(format!("recreate cache root failed: {err}")))?;

    let mut runtime = manager_state.inner.lock().await;
    runtime.active_task_id = None;
    runtime.statuses.clear();
    runtime.cancelled_tasks.clear();

    Ok(())
}

async fn run_update_task(
    app: AppHandle,
    runtime_state: Arc<Mutex<UpdateManagerRuntime>>,
    version_dir: PathBuf,
    mut persisted: PersistedUpdateState,
    update: Update,
    is_resumed: bool,
    http_client: reqwest::Client,
) -> Result<(), AppError> {
    persisted.status.stage = UpdateStage::Downloading;
    persisted.status.status = UpdateStage::Downloading;
    persisted.status.error_code = None;
    persisted.status.error_message = None;
    persisted.status.timestamp = now_millis();
    save_and_emit_status(
        &app,
        runtime_state.clone(),
        &version_dir,
        &persisted,
        if is_resumed {
            ResumableEventType::Resumed
        } else {
            ResumableEventType::Started
        },
    )
    .await?;

    let package_bytes = download_with_retries(
        &app,
        runtime_state.clone(),
        &version_dir,
        &mut persisted,
        &http_client,
    )
    .await?;

    ensure_task_not_cancelled(runtime_state.clone(), &persisted.status.task_id).await?;

    persisted.status.stage = UpdateStage::Verifying;
    persisted.status.status = UpdateStage::Verifying;
    persisted.status.timestamp = now_millis();
    save_and_emit_status(
        &app,
        runtime_state.clone(),
        &version_dir,
        &persisted,
        ResumableEventType::Verifying,
    )
    .await?;

    if let Some(total_bytes) = persisted.status.total_bytes {
        if package_bytes.len() as u64 != total_bytes {
            return Err(AppError::UpdateIntegrity(format!(
                "size mismatch after download: got {}, expected {total_bytes}",
                package_bytes.len()
            )));
        }
    }

    let pub_key = updater_pubkey()?;
    verify_signature(&package_bytes, &persisted.signature, &pub_key)?;

    ensure_task_not_cancelled(runtime_state.clone(), &persisted.status.task_id).await?;

    persisted.status.stage = UpdateStage::Installing;
    persisted.status.status = UpdateStage::Installing;
    persisted.status.timestamp = now_millis();
    save_and_emit_status(
        &app,
        runtime_state.clone(),
        &version_dir,
        &persisted,
        ResumableEventType::Installing,
    )
    .await?;

    ensure_task_not_cancelled(runtime_state.clone(), &persisted.status.task_id).await?;

    update
        .install(&package_bytes)
        .map_err(|err| AppError::UpdateInstall(format!("install failed: {err}")))?;

    ensure_task_not_cancelled(runtime_state.clone(), &persisted.status.task_id).await?;

    persisted.status.stage = UpdateStage::Ready;
    persisted.status.status = UpdateStage::Ready;
    persisted.status.timestamp = now_millis();
    save_and_emit_status(
        &app,
        runtime_state.clone(),
        &version_dir,
        &persisted,
        ResumableEventType::Ready,
    )
    .await?;

    clear_active_task_if_needed(runtime_state, &persisted.status.task_id).await;
    Ok(())
}

async fn download_with_retries(
    app: &AppHandle,
    runtime_state: Arc<Mutex<UpdateManagerRuntime>>,
    version_dir: &Path,
    persisted: &mut PersistedUpdateState,
    http_client: &reqwest::Client,
) -> Result<Vec<u8>, AppError> {
    let part_path = version_dir.join(PART_FILE_NAME);
    let mut next_attempt = persisted.status.attempt.max(1);

    while next_attempt <= MAX_DOWNLOAD_ATTEMPTS {
        if is_task_cancelled(runtime_state.clone(), &persisted.status.task_id).await {
            return Err(AppError::Update("update cancelled".to_string()));
        }

        persisted.status.attempt = next_attempt;
        persisted.status.retry_delay_ms = None;
        persisted.status.stage = UpdateStage::Downloading;
        persisted.status.status = UpdateStage::Downloading;
        persisted.status.timestamp = now_millis();
        save_state_file(version_dir, persisted).await?;
        store_runtime_status(runtime_state.clone(), persisted.status.clone()).await;

        if next_attempt > 1 {
            let retry_delay_ms = compute_retry_delay(next_attempt - 1);
            persisted.status.retry_delay_ms = Some(retry_delay_ms);
            emit_status_event(app, ResumableEventType::Retrying, persisted.status.clone());
        }

        let result = download_once(
            app,
            runtime_state.clone(),
            persisted,
            &part_path,
            version_dir,
            http_client,
        )
        .await;
        match result {
            Ok(()) => {
                let bytes = tokio::fs::read(&part_path).await.map_err(|err| {
                    AppError::UpdateState(format!("read downloaded package failed: {err}"))
                })?;
                return Ok(bytes);
            }
            Err(err) => {
                if is_task_cancelled(runtime_state.clone(), &persisted.status.task_id).await {
                    return Err(AppError::Update("update cancelled".to_string()));
                }
                if next_attempt >= MAX_DOWNLOAD_ATTEMPTS {
                    return Err(err);
                }
                let delay_ms = compute_retry_delay(next_attempt);
                persisted.status.retry_delay_ms = Some(delay_ms);
                persisted.status.timestamp = now_millis();
                save_state_file(version_dir, persisted).await?;
                emit_status_event(app, ResumableEventType::Retrying, persisted.status.clone());
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                next_attempt += 1;
            }
        }
    }

    Err(AppError::UpdateNetwork(
        "download retry exhausted".to_string(),
    ))
}

async fn download_once(
    app: &AppHandle,
    runtime_state: Arc<Mutex<UpdateManagerRuntime>>,
    persisted: &mut PersistedUpdateState,
    part_path: &Path,
    version_dir: &Path,
    http_client: &reqwest::Client,
) -> Result<(), AppError> {
    let client = http_client;

    let existing_len = tokio::fs::metadata(part_path)
        .await
        .map(|meta| meta.len())
        .unwrap_or(0);
    if existing_len != persisted.status.downloaded_bytes {
        persisted.status.downloaded_bytes = existing_len;
    }

    let mut range_requested = existing_len > 0;
    let mut request = client
        .get(&persisted.download_url)
        .header(ACCEPT, HeaderValue::from_static("application/octet-stream"))
        .header(ACCEPT_ENCODING, HeaderValue::from_static("identity"));

    if range_requested {
        request = request.header(RANGE, format!("bytes={existing_len}-"));
        if let Some(etag) = persisted.etag.as_ref() {
            request = request.header(IF_RANGE, etag);
        } else if let Some(last_modified) = persisted.last_modified.as_ref() {
            request = request.header(IF_UNMODIFIED_SINCE, last_modified);
        }
    }

    let response = request
        .send()
        .await
        .map_err(|err| AppError::UpdateNetwork(format!("download request failed: {err}")))?;
    let status = response.status();
    persisted.status.last_http_status = Some(status.as_u16());

    if should_restart_full_download(range_requested, status) {
        if status == StatusCode::OK {
            range_requested = false;
            persisted.status.resumable = false;
            persisted.status.downloaded_bytes = 0;
            tokio::fs::write(part_path, &[] as &[u8])
                .await
                .map_err(|err| {
                    AppError::UpdateState(format!("reset partial package failed: {err}"))
                })?;
        } else {
            persisted.status.downloaded_bytes = 0;
            persisted.status.resumable = false;
            tokio::fs::write(part_path, &[] as &[u8])
                .await
                .map_err(|err| {
                    AppError::UpdateState(format!("truncate partial package failed: {err}"))
                })?;
            save_state_file(version_dir, persisted).await?;
            return Err(AppError::UpdateNetwork(format!(
                "resume rejected by server: http {}",
                status.as_u16()
            )));
        }
    }

    if !status.is_success() {
        return Err(AppError::UpdateNetwork(format!(
            "download request failed with status {}",
            status.as_u16()
        )));
    }

    let response_headers = response.headers().clone();
    let current_etag = response_headers
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let current_last_modified = response_headers
        .get(LAST_MODIFIED)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    if range_requested {
        if let (Some(old), Some(new_value)) = (persisted.etag.as_ref(), current_etag.as_ref()) {
            if old != new_value {
                persisted.status.downloaded_bytes = 0;
                persisted.status.resumable = false;
                tokio::fs::write(part_path, &[] as &[u8])
                    .await
                    .map_err(|err| {
                        AppError::UpdateState(format!(
                            "truncate package for etag reset failed: {err}"
                        ))
                    })?;
                save_state_file(version_dir, persisted).await?;
                return Err(AppError::UpdateNetwork(
                    "updater resource changed (etag)".to_string(),
                ));
            }
        }
    }

    if current_etag.is_some() {
        persisted.etag = current_etag;
    }
    if current_last_modified.is_some() {
        persisted.last_modified = current_last_modified;
    }

    let mut total_bytes = persisted.status.total_bytes;
    if status == StatusCode::PARTIAL_CONTENT {
        persisted.status.resumable = true;
        total_bytes = response_headers
            .get(CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .and_then(parse_content_range_total)
            .or(total_bytes);
    } else {
        let content_length = response_headers
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        total_bytes = content_length;
        if range_requested {
            persisted.status.resumable = false;
        }
    }
    persisted.status.total_bytes = total_bytes;

    let mut downloaded = if status == StatusCode::PARTIAL_CONTENT {
        existing_len
    } else {
        0
    };

    let mut file = if status == StatusCode::PARTIAL_CONTENT {
        tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(part_path)
            .await
            .map_err(|err| AppError::UpdateState(format!("open part file failed: {err}")))?
    } else {
        tokio::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(part_path)
            .await
            .map_err(|err| AppError::UpdateState(format!("open package file failed: {err}")))?
    };

    let mut bytes_since_last_save = 0u64;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if is_task_cancelled(runtime_state.clone(), &persisted.status.task_id).await {
            return Err(AppError::Update("update cancelled".to_string()));
        }

        let chunk = chunk.map_err(|err| {
            AppError::UpdateNetwork(format!("error decoding response body: {err}"))
        })?;
        file.write_all(&chunk)
            .await
            .map_err(|err| AppError::UpdateState(format!("write update chunk failed: {err}")))?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        bytes_since_last_save = bytes_since_last_save.saturating_add(chunk.len() as u64);
        persisted.status.downloaded_bytes = downloaded;
        persisted.status.timestamp = now_millis();
        persisted.status.error_code = None;
        persisted.status.error_message = None;

        store_runtime_status(runtime_state.clone(), persisted.status.clone()).await;
        emit_status_event(app, ResumableEventType::Progress, persisted.status.clone());

        if bytes_since_last_save >= SAVE_STATE_INTERVAL_BYTES {
            save_state_file(version_dir, persisted).await?;
            bytes_since_last_save = 0;
        }
    }

    file.flush()
        .await
        .map_err(|err| AppError::UpdateState(format!("flush update package failed: {err}")))?;
    save_state_file(version_dir, persisted).await?;

    if let Some(total) = persisted.status.total_bytes {
        if persisted.status.downloaded_bytes < total {
            return Err(AppError::UpdateNetwork(format!(
                "download incomplete: got {}, expected {total}",
                persisted.status.downloaded_bytes
            )));
        }
    }

    Ok(())
}

async fn save_and_emit_status(
    app: &AppHandle,
    runtime_state: Arc<Mutex<UpdateManagerRuntime>>,
    version_dir: &Path,
    persisted: &PersistedUpdateState,
    event_type: ResumableEventType,
) -> Result<(), AppError> {
    if persisted.status.stage != UpdateStage::Cancelled {
        ensure_task_not_cancelled(runtime_state.clone(), &persisted.status.task_id).await?;
    }
    save_state_file(version_dir, persisted).await?;
    store_runtime_status(runtime_state, persisted.status.clone()).await;
    emit_status_event(app, event_type, persisted.status.clone());
    Ok(())
}

async fn emit_terminal_error(
    app: AppHandle,
    runtime_state: Arc<Mutex<UpdateManagerRuntime>>,
    task_id: &str,
    error: AppError,
) -> Result<(), AppError> {
    let mut status: Option<ResumableUpdateStatus> = None;
    {
        let mut runtime = runtime_state.lock().await;
        if let Some(existing_status) = runtime.statuses.get_mut(task_id) {
            existing_status.stage = if existing_status.error_code.as_deref() == Some("cancelled") {
                UpdateStage::Cancelled
            } else {
                UpdateStage::Error
            };
            existing_status.status = existing_status.stage;
            existing_status.timestamp = now_millis();
            if existing_status.stage == UpdateStage::Cancelled {
                existing_status.error_code = Some("cancelled".to_string());
                existing_status.error_message = Some("Update cancelled by user".to_string());
            } else {
                existing_status.error_code = Some(error_code_for_error(&error).to_string());
                existing_status.error_message = Some(error.to_string());
            }
            status = Some(existing_status.clone());
        }
        if runtime.active_task_id.as_deref() == Some(task_id) {
            runtime.active_task_id = None;
        }
    }

    if let Some(status) = status {
        let version_dir = version_dir(&app, &status.version)?;
        if let Some(mut persisted) = load_state_file(&version_dir).await? {
            persisted.status = status.clone();
            save_state_file(&version_dir, &persisted).await?;
        }
        emit_status_event(
            &app,
            if status.stage == UpdateStage::Cancelled {
                ResumableEventType::Cancelled
            } else {
                ResumableEventType::Error
            },
            status,
        );
    }

    Ok(())
}

async fn clear_active_task_if_needed(
    runtime_state: Arc<Mutex<UpdateManagerRuntime>>,
    task_id: &str,
) {
    let mut runtime = runtime_state.lock().await;
    if runtime.active_task_id.as_deref() == Some(task_id) {
        runtime.active_task_id = None;
    }
}

async fn store_runtime_status(
    runtime_state: Arc<Mutex<UpdateManagerRuntime>>,
    status: ResumableUpdateStatus,
) {
    let mut runtime = runtime_state.lock().await;
    runtime.statuses.insert(status.task_id.clone(), status);
}

async fn ensure_task_not_cancelled(
    runtime_state: Arc<Mutex<UpdateManagerRuntime>>,
    task_id: &str,
) -> Result<(), AppError> {
    if is_task_cancelled(runtime_state, task_id).await {
        return Err(AppError::Update("update cancelled".to_string()));
    }
    Ok(())
}

async fn is_task_cancelled(runtime_state: Arc<Mutex<UpdateManagerRuntime>>, task_id: &str) -> bool {
    let runtime = runtime_state.lock().await;
    runtime.cancelled_tasks.contains(task_id)
}

fn emit_status_event(
    app: &AppHandle,
    event_type: ResumableEventType,
    status: ResumableUpdateStatus,
) {
    let payload = ResumableEventPayload { event_type, status };
    let _ = app.emit(RESUMABLE_EVENT_NAME, payload);
}

fn new_persisted_state(update: &Update, task_id: Option<String>) -> PersistedUpdateState {
    let task_id = task_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let status = ResumableUpdateStatus {
        task_id,
        version: update.version.clone(),
        attempt: 1,
        downloaded_bytes: 0,
        total_bytes: None,
        resumable: true,
        stage: UpdateStage::Downloading,
        status: UpdateStage::Downloading,
        error_code: None,
        error_message: None,
        timestamp: now_millis(),
        retry_delay_ms: None,
        last_http_status: None,
        can_resume_after_restart: true,
    };

    PersistedUpdateState {
        status,
        download_url: update.download_url.to_string(),
        signature: update.signature.clone(),
        etag: None,
        last_modified: None,
    }
}

fn updates_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| AppError::UpdateState(format!("get app_data_dir failed: {err}")))?;
    Ok(app_data.join("updates"))
}

fn sanitize_path_segment(segment: &str) -> String {
    segment
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn version_dir(app: &AppHandle, version: &str) -> Result<PathBuf, AppError> {
    Ok(updates_root(app)?.join(sanitize_path_segment(version)))
}

async fn load_state_file(version_dir: &Path) -> Result<Option<PersistedUpdateState>, AppError> {
    let path = version_dir.join(STATE_FILE_NAME);
    if !path.exists() {
        return Ok(None);
    }
    let raw = tokio::fs::read_to_string(&path)
        .await
        .map_err(|err| AppError::UpdateState(format!("read state file failed: {err}")))?;
    let state = serde_json::from_str::<PersistedUpdateState>(&raw)
        .map_err(|err| AppError::UpdateState(format!("parse state file failed: {err}")))?;
    Ok(Some(state))
}

async fn save_state_file(version_dir: &Path, state: &PersistedUpdateState) -> Result<(), AppError> {
    let path = version_dir.join(STATE_FILE_NAME);
    let body = serde_json::to_string_pretty(state)
        .map_err(|err| AppError::UpdateState(format!("serialize state failed: {err}")))?;
    tokio::fs::write(path, body)
        .await
        .map_err(|err| AppError::UpdateState(format!("write state file failed: {err}")))?;
    Ok(())
}

async fn clear_version_cache(version_dir: &Path) -> Result<(), AppError> {
    if !version_dir.exists() {
        return Ok(());
    }
    if version_dir.join(PART_FILE_NAME).exists() {
        tokio::fs::remove_file(version_dir.join(PART_FILE_NAME))
            .await
            .map_err(|err| AppError::UpdateState(format!("remove part file failed: {err}")))?;
    }
    if version_dir.join(STATE_FILE_NAME).exists() {
        tokio::fs::remove_file(version_dir.join(STATE_FILE_NAME))
            .await
            .map_err(|err| AppError::UpdateState(format!("remove state file failed: {err}")))?;
    }
    Ok(())
}

async fn load_status_by_task_id(
    app: &AppHandle,
    task_id: &str,
    current_version: &str,
) -> Result<Option<ResumableUpdateStatus>, AppError> {
    let root = updates_root(app)?;
    if !root.exists() {
        return Ok(None);
    }
    let mut entries = tokio::fs::read_dir(root)
        .await
        .map_err(|err| AppError::UpdateState(format!("read updates directory failed: {err}")))?;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|err| AppError::UpdateState(format!("scan updates directory failed: {err}")))?
    {
        let file_type = entry.file_type().await.map_err(|err| {
            AppError::UpdateState(format!("read directory entry type failed: {err}"))
        })?;
        if !file_type.is_dir() {
            continue;
        }
        if let Some(state) = load_state_file(&entry.path()).await? {
            if state.status.task_id == task_id {
                return Ok(is_status_actionable_for_current_version(
                    &state.status,
                    current_version,
                )
                .then_some(state.status));
            }
        }
    }
    Ok(None)
}

async fn load_latest_persisted_status(
    app: &AppHandle,
    current_version: &str,
) -> Result<Option<ResumableUpdateStatus>, AppError> {
    let root = updates_root(app)?;
    if !root.exists() {
        return Ok(None);
    }
    let mut latest: Option<ResumableUpdateStatus> = None;
    let mut entries = tokio::fs::read_dir(root)
        .await
        .map_err(|err| AppError::UpdateState(format!("read updates directory failed: {err}")))?;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|err| AppError::UpdateState(format!("scan updates directory failed: {err}")))?
    {
        let file_type = entry.file_type().await.map_err(|err| {
            AppError::UpdateState(format!("read directory entry type failed: {err}"))
        })?;
        if !file_type.is_dir() {
            continue;
        }
        if let Some(state) = load_state_file(&entry.path()).await? {
            if !is_status_actionable_for_current_version(&state.status, current_version) {
                continue;
            }
            match latest.as_ref() {
                Some(existing) if existing.timestamp >= state.status.timestamp => {}
                _ => latest = Some(state.status),
            }
        }
    }
    Ok(latest)
}

async fn prune_stale_persisted_terminal_states(
    app: &AppHandle,
    current_version: &str,
) -> Result<(), AppError> {
    let root = updates_root(app)?;
    if !root.exists() {
        return Ok(());
    }

    let mut entries = tokio::fs::read_dir(&root)
        .await
        .map_err(|err| AppError::UpdateState(format!("read updates directory failed: {err}")))?;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|err| AppError::UpdateState(format!("scan updates directory failed: {err}")))?
    {
        let path = entry.path();
        let file_type = entry.file_type().await.map_err(|err| {
            AppError::UpdateState(format!("read directory entry type failed: {err}"))
        })?;
        if !file_type.is_dir() {
            continue;
        }
        let Some(state) = load_state_file(&path).await? else {
            continue;
        };
        if !is_status_actionable_for_current_version(&state.status, current_version) {
            tokio::fs::remove_dir_all(&path).await.map_err(|err| {
                AppError::UpdateState(format!("remove stale cache dir failed: {err}"))
            })?;
        }
    }

    Ok(())
}

fn is_status_actionable_for_current_version(
    status: &ResumableUpdateStatus,
    current_version: &str,
) -> bool {
    if !status.stage.is_terminal() {
        return true;
    }
    !is_current_version_caught_up(current_version, &status.version)
}

fn is_current_version_caught_up(current_version: &str, target_version: &str) -> bool {
    match compare_versions(current_version, target_version) {
        Some(Ordering::Greater | Ordering::Equal) => true,
        Some(Ordering::Less) => false,
        None => current_version.trim() == target_version.trim(),
    }
}

fn compare_versions(left: &str, right: &str) -> Option<Ordering> {
    let left = Version::parse(left.trim().trim_start_matches('v')).ok()?;
    let right = Version::parse(right.trim().trim_start_matches('v')).ok()?;
    Some(left.cmp(&right))
}

fn parse_content_range_total(content_range: &str) -> Option<u64> {
    let (_, total_part) = content_range.split_once('/')?;
    if total_part == "*" {
        return None;
    }
    total_part.parse::<u64>().ok()
}

fn should_restart_full_download(range_requested: bool, status: StatusCode) -> bool {
    range_requested
        && matches!(
            status,
            StatusCode::OK | StatusCode::PRECONDITION_FAILED | StatusCode::RANGE_NOT_SATISFIABLE
        )
}

fn compute_retry_delay(attempt: u32) -> u64 {
    let exp = BASE_RETRY_DELAY_MS.saturating_mul(2u64.saturating_pow(attempt.saturating_sub(1)));
    exp.min(MAX_RETRY_DELAY_MS)
}

fn can_cancel_from_stage(stage: UpdateStage) -> bool {
    matches!(stage, UpdateStage::Downloading | UpdateStage::Verifying)
}

fn stage_label(stage: UpdateStage) -> &'static str {
    match stage {
        UpdateStage::Downloading => "downloading",
        UpdateStage::Verifying => "verifying",
        UpdateStage::Installing => "installing",
        UpdateStage::Ready => "ready",
        UpdateStage::Error => "error",
        UpdateStage::Cancelled => "cancelled",
    }
}

fn cancel_not_allowed_error(stage: UpdateStage) -> AppError {
    AppError::Update(format!(
        "UPDATE_CANCEL_NOT_ALLOWED: stage={}",
        stage_label(stage)
    ))
}

fn updater_pubkey() -> Result<String, AppError> {
    let config_json: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .map_err(|err| {
        AppError::UpdateIntegrity(format!("parse tauri config failed: {err}"))
    })?;
    let pub_key = config_json
        .get("plugins")
        .and_then(|plugins| plugins.get("updater"))
        .and_then(|updater| updater.get("pubkey"))
        .and_then(|value| value.as_str())
        .ok_or_else(|| {
            AppError::UpdateIntegrity("updater pubkey missing in tauri config".to_string())
        })?;
    Ok(pub_key.to_string())
}

fn verify_signature(data: &[u8], release_signature: &str, pub_key: &str) -> Result<(), AppError> {
    let pub_key_decoded = base64_to_string(pub_key)?;
    let public_key = PublicKey::decode(&pub_key_decoded)
        .map_err(|err| AppError::UpdateIntegrity(format!("decode public key failed: {err}")))?;
    let signature_base64_decoded = base64_to_string(release_signature)?;
    let signature = Signature::decode(&signature_base64_decoded).map_err(|err| {
        AppError::UpdateIntegrity(format!("decode release signature failed: {err}"))
    })?;
    public_key.verify(data, &signature, true).map_err(|err| {
        AppError::UpdateIntegrity(format!("signature verification failed: {err}"))
    })?;
    Ok(())
}

fn base64_to_string(base64_string: &str) -> Result<String, AppError> {
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(base64_string)
        .map_err(|err| AppError::UpdateIntegrity(format!("base64 decode failed: {err}")))?;
    std::str::from_utf8(&decoded)
        .map(|value| value.to_string())
        .map_err(|_| AppError::UpdateIntegrity("invalid utf8 payload in signature".to_string()))
}

fn error_code_for_error(error: &AppError) -> &'static str {
    match error {
        AppError::UpdateNetwork(_) | AppError::Network(_) => "network",
        AppError::UpdateIntegrity(_) => "integrity",
        AppError::UpdateInstall(_) => "install",
        AppError::UpdateState(_) => "state",
        AppError::Update(_) => "update",
        _ => "unknown",
    }
}

fn now_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample_state() -> PersistedUpdateState {
        PersistedUpdateState {
            status: ResumableUpdateStatus {
                task_id: "task-1".to_string(),
                version: "1.2.3".to_string(),
                attempt: 2,
                downloaded_bytes: 512,
                total_bytes: Some(1024),
                resumable: true,
                stage: UpdateStage::Downloading,
                status: UpdateStage::Downloading,
                error_code: None,
                error_message: None,
                timestamp: 123_456,
                retry_delay_ms: Some(1_500),
                last_http_status: Some(206),
                can_resume_after_restart: true,
            },
            download_url: "https://example.com/pkg.zip".to_string(),
            signature: "sig".to_string(),
            etag: Some("\"etag-1\"".to_string()),
            last_modified: Some("Wed, 21 Oct 2015 07:28:00 GMT".to_string()),
        }
    }

    #[tokio::test]
    async fn persisted_state_roundtrip() {
        let temp = tempdir().expect("tempdir");
        let state = sample_state();
        save_state_file(temp.path(), &state)
            .await
            .expect("save state");
        let loaded = load_state_file(temp.path()).await.expect("load state");
        assert!(loaded.is_some());
        let loaded = loaded.expect("state exists");
        assert_eq!(loaded.status.task_id, "task-1");
        assert_eq!(loaded.status.downloaded_bytes, 512);
        assert_eq!(loaded.download_url, "https://example.com/pkg.zip");
        assert_eq!(loaded.etag.as_deref(), Some("\"etag-1\""));
    }

    #[test]
    fn parses_content_range_total() {
        assert_eq!(parse_content_range_total("bytes 100-199/2048"), Some(2048));
        assert_eq!(parse_content_range_total("bytes 0-0/*"), None);
        assert_eq!(parse_content_range_total("invalid"), None);
    }

    #[test]
    fn restart_decision_for_resume_fallback() {
        assert!(should_restart_full_download(true, StatusCode::OK));
        assert!(should_restart_full_download(
            true,
            StatusCode::RANGE_NOT_SATISFIABLE
        ));
        assert!(should_restart_full_download(
            true,
            StatusCode::PRECONDITION_FAILED
        ));
        assert!(!should_restart_full_download(
            true,
            StatusCode::PARTIAL_CONTENT
        ));
        assert!(!should_restart_full_download(false, StatusCode::OK));
    }

    #[test]
    fn cancel_policy_disallows_installing_and_terminal_stages() {
        assert!(can_cancel_from_stage(UpdateStage::Downloading));
        assert!(can_cancel_from_stage(UpdateStage::Verifying));
        assert!(!can_cancel_from_stage(UpdateStage::Installing));
        assert!(!can_cancel_from_stage(UpdateStage::Ready));
        assert!(!can_cancel_from_stage(UpdateStage::Error));
        assert!(!can_cancel_from_stage(UpdateStage::Cancelled));
    }

    #[tokio::test]
    async fn ensure_task_not_cancelled_returns_error_when_marked() {
        let runtime = Arc::new(Mutex::new(UpdateManagerRuntime::default()));
        {
            let mut guard = runtime.lock().await;
            guard.cancelled_tasks.insert("task-1".to_string());
        }

        let err = ensure_task_not_cancelled(runtime, "task-1")
            .await
            .expect_err("expected cancellation error");
        let message = err.to_string();
        assert!(
            message.contains("cancelled"),
            "expected cancellation in error message, got: {message}"
        );
    }

    #[test]
    fn cancel_not_allowed_error_contains_machine_code_and_stage() {
        let err = cancel_not_allowed_error(UpdateStage::Installing);
        let message = err.to_string();
        assert!(
            message.contains("UPDATE_CANCEL_NOT_ALLOWED"),
            "expected machine code in error message, got: {message}"
        );
        assert!(
            message.contains("stage=installing"),
            "expected stage in error message, got: {message}"
        );
    }

    #[test]
    fn compares_versions_for_caught_up_status() {
        assert!(is_current_version_caught_up("1.0.10", "1.0.2"));
        assert!(is_current_version_caught_up("1.0.10", "1.0.10"));
        assert!(!is_current_version_caught_up("1.0.2", "1.0.10"));
    }

    #[test]
    fn ignores_stale_terminal_status_once_app_version_is_newer() {
        let mut status = sample_state().status;
        status.stage = UpdateStage::Ready;
        status.status = UpdateStage::Ready;
        status.version = "1.0.2".to_string();

        assert!(!is_status_actionable_for_current_version(&status, "1.0.10"));
        assert!(is_status_actionable_for_current_version(&status, "1.0.1"));
    }
}
