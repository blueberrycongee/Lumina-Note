use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tokio::sync::{broadcast, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CloudRelayConfig {
    pub relay_url: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct CloudRelayStatus {
    pub running: bool,
    pub connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pairing_payload: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub struct CloudRelayState {
    config: Mutex<Option<CloudRelayConfig>>,
    status: Mutex<CloudRelayStatus>,
    shutdown: broadcast::Sender<()>,
    starting: Mutex<bool>,
}

impl CloudRelayState {
    pub fn new() -> Self {
        let (shutdown, _rx) = broadcast::channel(8);
        Self {
            config: Mutex::new(None),
            status: Mutex::new(CloudRelayStatus::default()),
            shutdown,
            starting: Mutex::new(false),
        }
    }
}

#[tauri::command]
pub async fn cloud_relay_set_config(
    app: AppHandle,
    state: State<'_, CloudRelayState>,
    config: CloudRelayConfig,
) -> Result<(), String> {
    {
        let mut guard = state.config.lock().await;
        *guard = Some(config.clone());
    }
    let config_to_store = redact_password_if_needed(&config);
    persist_config(&app, &config_to_store)?;
    Ok(())
}

#[tauri::command]
pub async fn cloud_relay_get_status(
    state: State<'_, CloudRelayState>,
) -> Result<CloudRelayStatus, String> {
    Ok(state.status.lock().await.clone())
}

#[tauri::command]
pub async fn cloud_relay_get_config(
    app: AppHandle,
    state: State<'_, CloudRelayState>,
) -> Result<CloudRelayConfig, String> {
    let config = {
        let guard = state.config.lock().await;
        guard.clone()
    };
    if let Some(config) = config {
        return Ok(config);
    }
    Ok(load_config(&app).unwrap_or_default())
}

#[tauri::command]
pub async fn cloud_relay_start(
    _app: AppHandle,
    _state: State<'_, CloudRelayState>,
    _proxy_state: State<'_, crate::proxy::ProxyState>,
) -> Result<CloudRelayStatus, String> {
    Err("Cloud relay is not available: mobile gateway has been removed".to_string())
}

#[tauri::command]
pub async fn cloud_relay_stop(state: State<'_, CloudRelayState>) -> Result<(), String> {
    let _ = state.shutdown.send(());
    let mut status = state.status.lock().await;
    status.running = false;
    status.connected = false;
    Ok(())
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    Ok(app_dir.join("cloud").join("relay.json"))
}

fn load_config(app: &AppHandle) -> Option<CloudRelayConfig> {
    let path = settings_path(app).ok()?;
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn persist_config(app: &AppHandle, config: &CloudRelayConfig) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create cloud settings dir: {}", e))?;
    }
    let payload = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize cloud relay config: {}", e))?;
    fs::write(path, payload).map_err(|e| format!("Failed to write cloud relay config: {}", e))?;
    Ok(())
}

fn redact_password_if_needed(config: &CloudRelayConfig) -> CloudRelayConfig {
    let persist_password = std::env::var("LUMINA_CLOUD_RELAY_STORE_PASSWORD")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false);
    if persist_password {
        return config.clone();
    }
    CloudRelayConfig {
        relay_url: config.relay_url.clone(),
        email: config.email.clone(),
        password: String::new(),
    }
}
