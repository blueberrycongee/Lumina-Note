use crate::agent::commands::agent_start_task;
use crate::agent::types::{AgentConfig, AgentEvent, TaskContext};
use crate::agent::AgentState;
use crate::fs;
use futures_util::{SinkExt, StreamExt};
use if_addrs::{get_if_addrs, IfAddr};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs as std_fs;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc, oneshot, Mutex};
use tokio::time::{sleep, Instant};
use tokio_tungstenite::accept_async;

#[derive(Debug, Clone, Serialize)]
pub struct MobileGatewayStatus {
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    pub addresses: Vec<String>,
    pub ws_urls: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pairing_payload: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct MobileSessionSummary {
    pub id: String,
    pub title: String,
    pub session_type: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message_preview: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message_role: Option<String>,
    pub message_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data")]
#[serde(rename_all = "snake_case")]
pub enum MobileServerMessage {
    Paired {
        session_id: String,
    },
    CommandAck {
        command_id: String,
        status: String,
    },
    AgentEvent {
        session_id: Option<String>,
        event: Value,
    },
    SessionList {
        sessions: Vec<MobileSessionSummary>,
    },
    Options {
        workspaces: Vec<MobileWorkspaceOption>,
        agent_profiles: Vec<MobileAgentProfileOption>,
        selected_workspace_id: Option<String>,
        selected_profile_id: Option<String>,
    },
    Pong {
        timestamp: u64,
    },
    Error {
        message: String,
    },
    FileTree {
        entries: Vec<MobileFileEntry>,
        base_path: String,
    },
    FileContent {
        path: String,
        content: String,
        size: u64,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", content = "data")]
#[serde(rename_all = "snake_case")]
pub enum MobileClientMessage {
    Pair {
        token: String,
        device_name: Option<String>,
    },
    Command {
        task: String,
        session_id: Option<String>,
        context: Option<MobileTaskContext>,
    },
    Ping {
        timestamp: Option<u64>,
    },
    SessionCreate {
        title: Option<String>,
    },
    SelectWorkspace {
        workspace_id: String,
    },
    SelectAgentProfile {
        profile_id: String,
    },
    ListFiles {
        path: Option<String>,
    },
    ReadFile {
        path: String,
    },
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct MobileTaskContext {
    active_note_path: Option<String>,
    active_note_content: Option<String>,
    file_tree: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MobileWorkspaceOption {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MobileAgentProfileOption {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileFileEntry {
    pub name: String,
    pub relative_path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<MobileFileEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MobileOptions {
    pub workspaces: Vec<MobileWorkspaceOption>,
    pub agent_profiles: Vec<MobileAgentProfileOption>,
    pub selected_workspace_id: Option<String>,
    pub selected_profile_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct MobileSettings {
    workspace_path: Option<String>,
    agent_config: Option<AgentConfig>,
}

struct MobileServer {
    token: String,
    addr: SocketAddr,
    shutdown: Option<oneshot::Sender<()>>,
}

pub struct MobileGatewayState {
    server: Mutex<Option<MobileServer>>,
    agent_config: Mutex<Option<AgentConfig>>,
    workspace_path: Mutex<Option<String>>,
    options: Mutex<MobileOptions>,
    sessions: Mutex<Vec<MobileSessionSummary>>,
    current_session_id: Mutex<Option<String>>,
    events: broadcast::Sender<MobileBroadcast>,
    shutdown: broadcast::Sender<()>,
    starting: Mutex<bool>,
    metrics: Arc<MobileGatewayMetrics>,
}

const MOBILE_SYNC_WAIT_TIMEOUT: Duration = Duration::from_secs(3);
const MOBILE_SYNC_POLL_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone)]
pub enum MobileBroadcast {
    AgentEvent {
        session_id: Option<String>,
        event: Value,
    },
    SessionList {
        sessions: Vec<MobileSessionSummary>,
    },
    Options {
        options: MobileOptions,
    },
}

pub type MobileMessageSender = Arc<dyn Fn(MobileServerMessage) + Send + Sync>;

impl MobileGatewayState {
    pub fn new() -> Self {
        let (events, _rx) = broadcast::channel(512);
        let (shutdown, _shutdown_rx) = broadcast::channel(16);
        Self {
            server: Mutex::new(None),
            agent_config: Mutex::new(None),
            workspace_path: Mutex::new(None),
            options: Mutex::new(MobileOptions::default()),
            sessions: Mutex::new(Vec::new()),
            current_session_id: Mutex::new(None),
            events,
            shutdown,
            starting: Mutex::new(false),
            metrics: Arc::new(MobileGatewayMetrics::new()),
        }
    }

    fn build_status(&self, server: Option<&MobileServer>) -> MobileGatewayStatus {
        let addresses = match server {
            Some(server) => list_ipv4_addresses_for_bind(server.addr.ip()),
            None => list_ipv4_addresses(),
        };
        let (token, port) = match server {
            Some(server) => (Some(server.token.clone()), Some(server.addr.port())),
            None => (None, None),
        };
        let ws_urls = match port {
            Some(port) => addresses
                .iter()
                .map(|addr| format!("ws://{}:{}/ws", addr, port))
                .collect(),
            None => Vec::new(),
        };
        let pairing_payload = match (token.as_ref(), port) {
            (Some(token), Some(port)) => Some(
                json!({
                    "v": 1,
                    "token": token,
                    "port": port,
                    "addresses": addresses.clone(),
                    "ws_path": "/ws",
                })
                .to_string(),
            ),
            _ => None,
        };

        MobileGatewayStatus {
            running: server.is_some(),
            token,
            port,
            addresses,
            ws_urls,
            pairing_payload,
        }
    }

    pub async fn status(&self) -> MobileGatewayStatus {
        let guard = self.server.lock().await;
        self.build_status(guard.as_ref())
    }

    fn broadcast_agent_event(&self, session_id: Option<String>, payload: Value) {
        let _ = self.events.send(MobileBroadcast::AgentEvent {
            session_id,
            event: payload,
        });
    }

    fn broadcast_session_list(&self, sessions: Vec<MobileSessionSummary>) {
        let _ = self.events.send(MobileBroadcast::SessionList { sessions });
    }

    fn broadcast_options(&self, options: MobileOptions) {
        let _ = self.events.send(MobileBroadcast::Options { options });
    }

    async fn set_workspace(&self, workspace_path: Option<String>) {
        let mut guard = self.workspace_path.lock().await;
        *guard = workspace_path;
    }

    async fn set_agent_config(&self, config: Option<AgentConfig>) {
        let mut guard = self.agent_config.lock().await;
        *guard = config;
    }

    async fn get_workspace(&self) -> Option<String> {
        self.workspace_path.lock().await.clone()
    }

    async fn get_agent_config(&self) -> Option<AgentConfig> {
        self.agent_config.lock().await.clone()
    }

    async fn set_sessions(&self, sessions: Vec<MobileSessionSummary>) {
        let mut guard = self.sessions.lock().await;
        *guard = sessions;
    }

    pub async fn get_sessions(&self) -> Vec<MobileSessionSummary> {
        self.sessions.lock().await.clone()
    }

    pub async fn get_options(&self) -> MobileOptions {
        self.options.lock().await.clone()
    }

    pub async fn set_options(&self, options: MobileOptions) {
        let mut guard = self.options.lock().await;
        *guard = options;
    }

    pub fn subscribe_events(&self) -> broadcast::Receiver<MobileBroadcast> {
        self.events.subscribe()
    }

    pub async fn set_current_session_id(&self, session_id: Option<String>) {
        let mut guard = self.current_session_id.lock().await;
        *guard = session_id;
    }

    fn get_current_session_id_snapshot(&self) -> Option<String> {
        match self.current_session_id.try_lock() {
            Ok(guard) => guard.clone(),
            Err(_) => None,
        }
    }
}

impl Default for MobileGatewayState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug)]
struct MobileGatewayMetrics {
    connections: AtomicU64,
    active_connections: AtomicU64,
    failures: AtomicU64,
    bytes_in: AtomicU64,
    bytes_out: AtomicU64,
}

impl MobileGatewayMetrics {
    fn new() -> Self {
        Self {
            connections: AtomicU64::new(0),
            active_connections: AtomicU64::new(0),
            failures: AtomicU64::new(0),
            bytes_in: AtomicU64::new(0),
            bytes_out: AtomicU64::new(0),
        }
    }

    fn on_connect(&self) -> u64 {
        self.connections.fetch_add(1, Ordering::Relaxed) + 1
    }

    fn on_disconnect(&self) -> u64 {
        self.active_connections
            .fetch_sub(1, Ordering::Relaxed)
            .saturating_sub(1)
    }

    fn add_active(&self) -> u64 {
        self.active_connections.fetch_add(1, Ordering::Relaxed) + 1
    }

    fn record_failure(&self) -> u64 {
        self.failures.fetch_add(1, Ordering::Relaxed) + 1
    }

    fn record_incoming(&self, size: u64) -> u64 {
        self.bytes_in.fetch_add(size, Ordering::Relaxed) + size
    }

    fn record_outgoing(&self, size: u64) -> u64 {
        self.bytes_out.fetch_add(size, Ordering::Relaxed) + size
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::time::{timeout, Duration};

    #[tokio::test]
    async fn session_snapshot_returns_value_when_unlocked() {
        let state = MobileGatewayState::new();
        state
            .set_current_session_id(Some("session-1".to_string()))
            .await;
        assert_eq!(
            state.get_current_session_id_snapshot(),
            Some("session-1".to_string())
        );
    }

    #[tokio::test]
    async fn session_snapshot_never_blocks_when_locked() {
        let state = Arc::new(MobileGatewayState::new());
        state
            .set_current_session_id(Some("session-2".to_string()))
            .await;

        let _guard = state.current_session_id.lock().await;
        let state_clone = Arc::clone(&state);

        let result = timeout(
            Duration::from_millis(50),
            tokio::task::spawn_blocking(move || state_clone.get_current_session_id_snapshot()),
        )
        .await
        .expect("snapshot call blocked");

        assert!(result.unwrap().is_none());
    }
}

pub fn emit_agent_event(app: &AppHandle, event: AgentEvent) {
    let payload =
        serde_json::to_value(&event).unwrap_or_else(|_| json!({ "type": "unknown", "data": null }));
    emit_agent_event_payload(app, payload);
}

pub fn emit_agent_event_payload(app: &AppHandle, payload: Value) {
    let state = app.state::<MobileGatewayState>();
    let session_id = state.get_current_session_id_snapshot();
    let payload_for_app = match session_id.clone() {
        Some(id) => match payload.clone() {
            Value::Object(mut map) => {
                map.insert("session_id".to_string(), Value::String(id));
                Value::Object(map)
            }
            other => other,
        },
        None => payload.clone(),
    };
    let _ = app.emit("agent-event", payload_for_app);
    if state.events.receiver_count() == 0 {
        return;
    }
    state.broadcast_agent_event(session_id, payload);
}

fn emit_mobile_sync_request(app: &AppHandle, workspace: bool, agent_config: bool) {
    if !workspace && !agent_config {
        return;
    }
    let payload = json!({
        "workspace": workspace,
        "agent_config": agent_config,
        "timestamp": current_timestamp(),
    });
    let _ = app.emit("mobile-sync-request", payload);
}

fn emit_mobile_workspace_updated(app: &AppHandle, workspace_path: &str, source: &str) {
    let payload = json!({
        "path": workspace_path,
        "timestamp": current_timestamp(),
        "source": source,
    });
    let _ = app.emit("mobile-workspace-updated", payload);
}

fn validate_within_workspace(workspace: &str, relative_path: &str) -> Result<PathBuf, String> {
    let workspace_path = std::path::Path::new(workspace);
    let target = workspace_path.join(relative_path);
    let canonical_workspace = std_fs::canonicalize(workspace_path)
        .map_err(|e| format!("Failed to resolve workspace: {}", e))?;
    let canonical_target = std_fs::canonicalize(&target)
        .map_err(|e| format!("Failed to resolve path: {}", e))?;
    if !canonical_target.starts_with(&canonical_workspace) {
        return Err("Path is outside workspace".to_string());
    }
    Ok(canonical_target)
}

fn convert_entries(
    workspace: &std::path::Path,
    entries: Vec<fs::FileEntry>,
) -> Vec<MobileFileEntry> {
    entries
        .into_iter()
        .map(|entry| {
            let entry_path = std::path::Path::new(&entry.path);
            let relative_path = entry_path
                .strip_prefix(workspace)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| entry.path.clone());
            MobileFileEntry {
                name: entry.name,
                relative_path,
                is_dir: entry.is_dir,
                children: entry.children.map(|c| convert_entries(workspace, c)),
            }
        })
        .collect()
}

pub async fn handle_mobile_message(
    app: &AppHandle,
    state: &MobileGatewayState,
    paired: &mut bool,
    msg: MobileClientMessage,
    expected_token: Option<&str>,
    allow_any_pair: bool,
    sender: MobileMessageSender,
) {
    let send = |message: MobileServerMessage| {
        (sender)(message);
    };

    match msg {
        MobileClientMessage::Pair {
            token: incoming_token,
            ..
        } => {
            let token_ok = allow_any_pair
                || expected_token
                    .map(|token| token == incoming_token)
                    .unwrap_or(false);
            if token_ok {
                *paired = true;
                send(MobileServerMessage::Paired {
                    session_id: uuid::Uuid::new_v4().to_string(),
                });
                let sessions = state.get_sessions().await;
                send(MobileServerMessage::SessionList { sessions });
                let options = state.get_options().await;
                send(MobileServerMessage::Options {
                    workspaces: options.workspaces,
                    agent_profiles: options.agent_profiles,
                    selected_workspace_id: options.selected_workspace_id,
                    selected_profile_id: options.selected_profile_id,
                });
                emit_mobile_sync_request(app, true, true);
            } else {
                send(MobileServerMessage::Error {
                    message: "Invalid pairing token".to_string(),
                });
            }
        }
        MobileClientMessage::Ping { timestamp } => {
            send(MobileServerMessage::Pong {
                timestamp: timestamp.unwrap_or_else(current_timestamp),
            });
        }
        MobileClientMessage::SessionCreate { title } => {
            if !*paired {
                send(MobileServerMessage::Error {
                    message: "Not paired".to_string(),
                });
                return;
            }
            let payload = json!({
                "action": "create",
                "title": title,
            });
            let _ = app.emit("mobile-session-command", payload);
        }
        MobileClientMessage::Command {
            task,
            session_id,
            context,
        } => {
            if !*paired {
                send(MobileServerMessage::Error {
                    message: "Not paired".to_string(),
                });
                return;
            }
            let session_id = match session_id {
                Some(id) => id,
                None => {
                    send(MobileServerMessage::Error {
                        message: "Missing session_id".to_string(),
                    });
                    return;
                }
            };
            let task_for_event = task.clone();
            let _ = app.emit(
                "mobile-command",
                json!({
                    "session_id": session_id,
                    "task": task_for_event,
                    "timestamp": current_timestamp(),
                }),
            );

            let mut workspace_path = state.get_workspace().await;
            let mut agent_config = state.get_agent_config().await;

            if workspace_path.is_none() || agent_config.is_none() {
                if let Some(settings) = load_settings(app) {
                    if workspace_path.is_none() {
                        if let Some(path) = settings.workspace_path.clone() {
                            state.set_workspace(Some(path.clone())).await;
                            workspace_path = Some(path);
                        }
                    }
                    if agent_config.is_none() {
                        if let Some(config) = settings.agent_config.clone() {
                            state.set_agent_config(Some(config.clone())).await;
                            agent_config = Some(config);
                        }
                    }
                }
            }

            let missing_workspace = workspace_path.is_none();
            let missing_agent_config = agent_config.is_none();
            if missing_workspace || missing_agent_config {
                emit_mobile_sync_request(app, missing_workspace, missing_agent_config);
                let (synced_workspace, synced_agent_config) =
                    await_sync_requirements(app, state, missing_workspace, missing_agent_config)
                        .await;
                if missing_workspace {
                    workspace_path = synced_workspace;
                }
                if missing_agent_config {
                    agent_config = synced_agent_config;
                }
            }

            let workspace_path = match workspace_path {
                Some(path) => path,
                None => {
                    eprintln!("[MobileGateway] Workspace missing when handling command.");
                    emit_mobile_sync_request(app, true, agent_config.is_none());
                    send(MobileServerMessage::Error {
                        message: "Workspace path not set".to_string(),
                    });
                    return;
                }
            };
            let agent_config = match agent_config {
                Some(config) => config,
                None => {
                    eprintln!("[MobileGateway] Agent config missing when handling command.");
                    emit_mobile_sync_request(app, false, true);
                    send(MobileServerMessage::Error {
                        message: "Agent config not set".to_string(),
                    });
                    return;
                }
            };

            let command_id = uuid::Uuid::new_v4().to_string();
            send(MobileServerMessage::CommandAck {
                command_id: command_id.clone(),
                status: "accepted".to_string(),
            });

            let app_handle = app.clone();
            let sender_clone = sender.clone();
            tokio::spawn(async move {
                let context = build_task_context(workspace_path, context, Some(session_id));
                let agent_state = app_handle.state::<AgentState>();
                let result =
                    agent_start_task(app_handle.clone(), agent_state, agent_config, task, context)
                        .await;
                if let Err(err) = result {
                    (sender_clone)(MobileServerMessage::Error { message: err });
                }
            });
        }
        MobileClientMessage::SelectWorkspace { workspace_id } => {
            if !*paired {
                send(MobileServerMessage::Error {
                    message: "Not paired".to_string(),
                });
                return;
            }
            let mut options = state.get_options().await;
            options.selected_workspace_id = Some(workspace_id.clone());
            state.set_options(options.clone()).await;
            state.broadcast_options(options);
            let payload = json!({
                "workspace_id": workspace_id,
                "timestamp": current_timestamp(),
            });
            let _ = app.emit("mobile-select-workspace", payload);
        }
        MobileClientMessage::SelectAgentProfile { profile_id } => {
            if !*paired {
                send(MobileServerMessage::Error {
                    message: "Not paired".to_string(),
                });
                return;
            }
            let mut options = state.get_options().await;
            options.selected_profile_id = Some(profile_id.clone());
            state.set_options(options.clone()).await;
            state.broadcast_options(options);
            let payload = json!({
                "profile_id": profile_id,
                "timestamp": current_timestamp(),
            });
            let _ = app.emit("mobile-select-agent-profile", payload);
        }
        MobileClientMessage::ListFiles { path } => {
            if !*paired {
                send(MobileServerMessage::Error {
                    message: "Not paired".to_string(),
                });
                return;
            }
            let workspace_path = match state.get_workspace().await {
                Some(p) => p,
                None => {
                    send(MobileServerMessage::Error {
                        message: "Workspace path not set".to_string(),
                    });
                    return;
                }
            };
            let target_path = match &path {
                Some(relative) => {
                    match validate_within_workspace(&workspace_path, relative) {
                        Ok(p) => p.to_string_lossy().to_string(),
                        Err(e) => {
                            send(MobileServerMessage::Error { message: e });
                            return;
                        }
                    }
                }
                None => workspace_path.clone(),
            };
            match fs::list_dir_recursive(&target_path) {
                Ok(entries) => {
                    let workspace = std::path::Path::new(&workspace_path);
                    let mobile_entries = convert_entries(workspace, entries);
                    let base_path = path.unwrap_or_default();
                    send(MobileServerMessage::FileTree {
                        entries: mobile_entries,
                        base_path,
                    });
                }
                Err(e) => {
                    send(MobileServerMessage::Error {
                        message: format!("Failed to list files: {}", e),
                    });
                }
            }
        }
        MobileClientMessage::ReadFile { path } => {
            if !*paired {
                send(MobileServerMessage::Error {
                    message: "Not paired".to_string(),
                });
                return;
            }
            let workspace_path = match state.get_workspace().await {
                Some(p) => p,
                None => {
                    send(MobileServerMessage::Error {
                        message: "Workspace path not set".to_string(),
                    });
                    return;
                }
            };
            let absolute_path = match validate_within_workspace(&workspace_path, &path) {
                Ok(p) => p,
                Err(e) => {
                    send(MobileServerMessage::Error { message: e });
                    return;
                }
            };
            let file_meta = match std_fs::metadata(&absolute_path) {
                Ok(m) => m,
                Err(e) => {
                    send(MobileServerMessage::Error {
                        message: format!("Failed to read file metadata: {}", e),
                    });
                    return;
                }
            };
            const MAX_FILE_SIZE: u64 = 2 * 1024 * 1024;
            if file_meta.len() > MAX_FILE_SIZE {
                send(MobileServerMessage::Error {
                    message: format!(
                        "File too large ({} bytes, max {} bytes)",
                        file_meta.len(),
                        MAX_FILE_SIZE
                    ),
                });
                return;
            }
            let abs_str = absolute_path.to_string_lossy().to_string();
            match fs::read_file_content(&abs_str) {
                Ok(content) => {
                    send(MobileServerMessage::FileContent {
                        path,
                        content,
                        size: file_meta.len(),
                    });
                }
                Err(e) => {
                    send(MobileServerMessage::Error {
                        message: format!("Failed to read file: {}", e),
                    });
                }
            }
        }
    }
}

async fn await_sync_requirements(
    app: &AppHandle,
    state: &MobileGatewayState,
    wait_for_workspace: bool,
    wait_for_agent_config: bool,
) -> (Option<String>, Option<AgentConfig>) {
    let mut workspace_path = state.get_workspace().await;
    let mut agent_config = state.get_agent_config().await;

    if wait_for_workspace || wait_for_agent_config {
        let deadline = Instant::now() + MOBILE_SYNC_WAIT_TIMEOUT;
        loop {
            if wait_for_workspace && workspace_path.is_none() {
                workspace_path = state.get_workspace().await;
            }
            if wait_for_agent_config && agent_config.is_none() {
                agent_config = state.get_agent_config().await;
            }

            let workspace_ready = !wait_for_workspace || workspace_path.is_some();
            let agent_ready = !wait_for_agent_config || agent_config.is_some();
            if workspace_ready && agent_ready {
                break;
            }

            if Instant::now() >= deadline {
                break;
            }
            sleep(MOBILE_SYNC_POLL_INTERVAL).await;
        }
    }

    if (wait_for_workspace && workspace_path.is_none())
        || (wait_for_agent_config && agent_config.is_none())
    {
        if let Some(settings) = load_settings(app) {
            if wait_for_workspace && workspace_path.is_none() {
                if let Some(path) = settings.workspace_path.clone() {
                    state.set_workspace(Some(path.clone())).await;
                    workspace_path = Some(path);
                }
            }
            if wait_for_agent_config && agent_config.is_none() {
                if let Some(config) = settings.agent_config.clone() {
                    state.set_agent_config(Some(config.clone())).await;
                    agent_config = Some(config);
                }
            }
        }
    }

    (workspace_path, agent_config)
}

pub fn hydrate_state(app: &AppHandle) -> Result<(), String> {
    let settings = load_settings(app).unwrap_or_default();
    let state = app.state::<MobileGatewayState>();
    tauri::async_runtime::block_on(async {
        state.set_workspace(settings.workspace_path).await;
        state.set_agent_config(settings.agent_config).await;
    });
    Ok(())
}

#[tauri::command]
pub async fn mobile_get_status(
    state: State<'_, MobileGatewayState>,
) -> Result<MobileGatewayStatus, String> {
    Ok(state.status().await)
}

#[tauri::command]
pub async fn mobile_start_server(
    app: AppHandle,
    state: State<'_, MobileGatewayState>,
) -> Result<MobileGatewayStatus, String> {
    {
        let guard = state.server.lock().await;
        if guard.is_some() {
            return Ok(state.build_status(guard.as_ref()));
        }
    }
    {
        let mut starting = state.starting.lock().await;
        if *starting {
            return Ok(state.status().await);
        }
        *starting = true;
    }

    let start_result = async {
        let bind_addr =
            std::env::var("LUMINA_MOBILE_BIND").unwrap_or_else(|_| "0.0.0.0:0".to_string());
        let listener = TcpListener::bind(&bind_addr)
            .await
            .map_err(|e| format!("Failed to bind mobile gateway: {}", e))?;
        let addr = listener
            .local_addr()
            .map_err(|e| format!("Failed to get server address: {}", e))?;
        let token = generate_token(32);
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let events = state.events.clone();
        let shutdown = state.shutdown.clone();
        let app_handle = app.clone();
        let token_clone = token.clone();

        tokio::spawn(async move {
            run_server(
                app_handle,
                listener,
                token_clone,
                events,
                shutdown,
                shutdown_rx,
            )
            .await;
        });

        {
            let mut guard = state.server.lock().await;
            *guard = Some(MobileServer {
                token,
                addr,
                shutdown: Some(shutdown_tx),
            });
        }

        Ok(state.status().await)
    }
    .await;

    {
        let mut starting = state.starting.lock().await;
        *starting = false;
    }

    start_result
}

#[tauri::command]
pub async fn mobile_stop_server(state: State<'_, MobileGatewayState>) -> Result<(), String> {
    let _ = state.shutdown.send(());
    let mut guard = state.server.lock().await;
    if let Some(server) = guard.as_mut() {
        if let Some(shutdown) = server.shutdown.take() {
            let _ = shutdown.send(());
        }
    }
    *guard = None;
    Ok(())
}

#[tauri::command]
pub async fn mobile_set_workspace(
    app: AppHandle,
    state: State<'_, MobileGatewayState>,
    workspace_path: String,
) -> Result<(), String> {
    eprintln!("[MobileGateway] Update workspace path: {}", workspace_path);
    state.set_workspace(Some(workspace_path.clone())).await;
    persist_settings(&app, &state).await?;
    emit_mobile_workspace_updated(&app, &workspace_path, "mobile_set_workspace");
    Ok(())
}

#[tauri::command]
pub async fn mobile_set_agent_config(
    app: AppHandle,
    state: State<'_, MobileGatewayState>,
    config: AgentConfig,
) -> Result<(), String> {
    eprintln!(
        "[MobileGateway] Update agent config provider: {:?}",
        config.provider
    );
    state.set_agent_config(Some(config)).await;
    persist_settings(&app, &state).await?;
    Ok(())
}

#[tauri::command]
pub async fn mobile_sync_sessions(
    app: AppHandle,
    state: State<'_, MobileGatewayState>,
    sessions: Vec<MobileSessionSummary>,
    workspace_path: Option<String>,
    agent_config: Option<AgentConfig>,
) -> Result<(), String> {
    let workspace_snapshot = workspace_path.clone();
    eprintln!(
        "[MobileGateway] Sync sessions: count={}, workspace_present={}, agent_config_present={}",
        sessions.len(),
        workspace_path.is_some(),
        agent_config.is_some()
    );
    if let Some(path) = workspace_path.clone() {
        state.set_workspace(Some(path)).await;
    }
    if let Some(config) = agent_config.clone() {
        state.set_agent_config(Some(config)).await;
    }
    persist_settings(&app, &state).await?;
    if let Some(path) = workspace_snapshot.as_ref() {
        emit_mobile_workspace_updated(&app, path, "mobile_sync_sessions");
    }
    state.set_sessions(sessions.clone()).await;
    state.broadcast_session_list(sessions);
    Ok(())
}

#[tauri::command]
pub async fn mobile_sync_options(
    state: State<'_, MobileGatewayState>,
    workspaces: Vec<MobileWorkspaceOption>,
    agent_profiles: Vec<MobileAgentProfileOption>,
    selected_workspace_id: Option<String>,
    selected_profile_id: Option<String>,
) -> Result<(), String> {
    let options = MobileOptions {
        workspaces,
        agent_profiles,
        selected_workspace_id,
        selected_profile_id,
    };
    state.set_options(options.clone()).await;
    state.broadcast_options(options);
    Ok(())
}

async fn run_server(
    app: AppHandle,
    listener: TcpListener,
    token: String,
    events: broadcast::Sender<MobileBroadcast>,
    shutdown: broadcast::Sender<()>,
    mut shutdown_rx: oneshot::Receiver<()>,
) {
    let mut shutdown_listener = shutdown.subscribe();
    loop {
        tokio::select! {
            _ = shutdown_listener.recv() => {
                break;
            }
            _ = &mut shutdown_rx => {
                break;
            }
            accept = listener.accept() => {
                match accept {
                    Ok((stream, _)) => {
                        let app_handle = app.clone();
                        let token_clone = token.clone();
                        let events_clone = events.clone();
                        let shutdown_clone = shutdown.clone();
                        tokio::spawn(async move {
                            handle_connection(app_handle, stream, token_clone, events_clone, shutdown_clone).await;
                        });
                    }
                    Err(err) => {
                        eprintln!("[MobileGateway] Accept error: {}", err);
                        break;
                    }
                }
            }
        }
    }
}

async fn handle_connection(
    app: AppHandle,
    stream: tokio::net::TcpStream,
    token: String,
    events: broadcast::Sender<MobileBroadcast>,
    shutdown: broadcast::Sender<()>,
) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(err) => {
            let metrics = app.state::<MobileGatewayState>().metrics.clone();
            let failures = metrics.record_failure();
            eprintln!("[MobileGateway] WebSocket handshake failed: {}", err);
            eprintln!(
                "[MobileGateway][metrics] event=handshake_failed failures={}",
                failures
            );
            return;
        }
    };

    let metrics = app.state::<MobileGatewayState>().metrics.clone();
    let connection_in = Arc::new(AtomicU64::new(0));
    let connection_out = Arc::new(AtomicU64::new(0));
    let total_connections = metrics.on_connect();
    let active = metrics.add_active();
    eprintln!(
        "[MobileGateway][metrics] event=connected total_connections={} active_connections={}",
        total_connections, active
    );

    let (mut ws_sink, mut ws_stream) = ws_stream.split();
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<MobileServerMessage>();
    let mut event_rx = events.subscribe();
    let mut shutdown_rx = shutdown.subscribe();
    let mut paired = false;

    let metrics_writer = metrics.clone();
    let connection_out_writer = Arc::clone(&connection_out);
    let writer = tokio::spawn(async move {
        while let Some(message) = out_rx.recv().await {
            let payload = match serde_json::to_string(&message) {
                Ok(text) => text,
                Err(_) => continue,
            };
            metrics_writer.record_outgoing(payload.len() as u64);
            connection_out_writer.fetch_add(payload.len() as u64, Ordering::Relaxed);
            if ws_sink
                .send(tokio_tungstenite::tungstenite::Message::Text(payload))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    loop {
        tokio::select! {
            _ = shutdown_rx.recv() => {
                break;
            }
            incoming = ws_stream.next() => {
                let message = match incoming {
                    Some(Ok(msg)) => msg,
                    Some(Err(err)) => {
                        metrics.record_failure();
                        eprintln!("[MobileGateway] WebSocket error: {}", err);
                        break;
                    }
                    None => break,
                };

                if let tokio_tungstenite::tungstenite::Message::Text(text) = message {
                    metrics.record_incoming(text.len() as u64);
                    connection_in.fetch_add(text.len() as u64, Ordering::Relaxed);
                    let sender: MobileMessageSender = {
                        let out_tx = out_tx.clone();
                        Arc::new(move |message| {
                            let _ = out_tx.send(message);
                        })
                    };
                    let parsed = serde_json::from_str::<MobileClientMessage>(&text);
                    match parsed {
                        Ok(msg) => {
                            let state = app.state::<MobileGatewayState>();
                            handle_mobile_message(
                                &app,
                                &state,
                                &mut paired,
                                msg,
                                Some(&token),
                                false,
                                sender,
                            )
                            .await;
                        }
                        Err(_) => {
                            let _ = out_tx.send(MobileServerMessage::Error {
                                message: "Invalid message format".to_string(),
                            });
                        }
                    }
                }
            }
            event = event_rx.recv(), if paired => {
                if let Ok(payload) = event {
                    match payload {
                        MobileBroadcast::AgentEvent { session_id, event } => {
                            let _ = out_tx.send(MobileServerMessage::AgentEvent { session_id, event });
                        }
                        MobileBroadcast::SessionList { sessions } => {
                            let _ = out_tx.send(MobileServerMessage::SessionList { sessions });
                        }
                        MobileBroadcast::Options { options } => {
                            let _ = out_tx.send(MobileServerMessage::Options {
                                workspaces: options.workspaces,
                                agent_profiles: options.agent_profiles,
                                selected_workspace_id: options.selected_workspace_id,
                                selected_profile_id: options.selected_profile_id,
                            });
                        }
                    }
                }
            }
        }
    }

    writer.abort();
    let active = metrics.on_disconnect();
    let total_in = connection_in.load(Ordering::Relaxed);
    let total_out = connection_out.load(Ordering::Relaxed);
    eprintln!(
        "[MobileGateway][metrics] event=disconnected active_connections={} bytes_in={} bytes_out={}",
        active, total_in, total_out
    );
}

fn build_task_context(
    workspace_path: String,
    context: Option<MobileTaskContext>,
    mobile_session_id: Option<String>,
) -> TaskContext {
    let context = context.unwrap_or_default();
    TaskContext {
        workspace_path,
        active_note_path: context.active_note_path,
        active_note_content: context.active_note_content,
        file_tree: context.file_tree,
        rag_results: Vec::new(),
        resolved_links: Vec::new(),
        history: Vec::new(),
        skills: Vec::new(),
        mobile_session_id,
    }
}

fn list_ipv4_addresses() -> Vec<String> {
    let mut addresses = Vec::new();
    if let Ok(ifaces) = get_if_addrs() {
        for iface in ifaces {
            if let IfAddr::V4(addr) = iface.addr {
                if addr.ip.is_loopback() {
                    continue;
                }
                addresses.push(addr.ip.to_string());
            }
        }
    }
    if addresses.is_empty() {
        addresses.push("127.0.0.1".to_string());
    }
    addresses
}

fn list_ipv4_addresses_for_bind(ip: IpAddr) -> Vec<String> {
    if ip.is_loopback() {
        return vec!["127.0.0.1".to_string()];
    }
    if ip.is_unspecified() {
        return list_ipv4_addresses();
    }
    vec![ip.to_string()]
}

fn generate_token(length: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}

fn current_timestamp() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    Ok(app_dir.join("mobile").join("gateway.json"))
}

fn load_settings(app: &AppHandle) -> Option<MobileSettings> {
    let path = settings_path(app).ok()?;
    let content = std_fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

async fn persist_settings(app: &AppHandle, state: &MobileGatewayState) -> Result<(), String> {
    let workspace_path = state.workspace_path.lock().await.clone();
    let agent_config = state.agent_config.lock().await.clone();
    let settings = MobileSettings {
        workspace_path,
        agent_config,
    };
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        std_fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create mobile settings dir: {}", e))?;
    }
    let payload = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize mobile settings: {}", e))?;
    std_fs::write(path, payload).map_err(|e| format!("Failed to write mobile settings: {}", e))?;
    Ok(())
}
