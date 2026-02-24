use crate::mobile_gateway::{
    handle_mobile_message, MobileClientMessage, MobileGatewayState, MobileServerMessage,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tokio::sync::{broadcast, mpsc, Mutex};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::header::AUTHORIZATION;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

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
    app: AppHandle,
    state: State<'_, CloudRelayState>,
) -> Result<CloudRelayStatus, String> {
    {
        let mut starting = state.starting.lock().await;
        if *starting {
            return Ok(state.status.lock().await.clone());
        }
        *starting = true;
    }

    let config = {
        let guard = state.config.lock().await;
        guard.clone().or_else(|| load_config(&app))
    };
    let config = match config {
        Some(config) => config,
        None => {
            let mut starting = state.starting.lock().await;
            *starting = false;
            return Err("Cloud relay config missing".to_string());
        }
    };
    if config.password.trim().is_empty() {
        let mut starting = state.starting.lock().await;
        *starting = false;
        return Err("Cloud relay password missing; re-authenticate to connect".to_string());
    }

    {
        let mut status = state.status.lock().await;
        status.running = true;
        status.connected = false;
        status.relay_url = Some(config.relay_url.clone());
        status.error = None;
    }

    let mut shutdown_rx = state.shutdown.subscribe();
    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        let result = run_relay(app_clone.clone(), config, &mut shutdown_rx).await;
        let state = app_clone.state::<CloudRelayState>();
        if let Err(err) = result {
            let mut status = state.status.lock().await;
            status.connected = false;
            status.error = Some(err);
        }
        let mut status = state.status.lock().await;
        status.running = false;
    });

    {
        let mut starting = state.starting.lock().await;
        *starting = false;
    }

    Ok(state.status.lock().await.clone())
}

#[tauri::command]
pub async fn cloud_relay_stop(state: State<'_, CloudRelayState>) -> Result<(), String> {
    let _ = state.shutdown.send(());
    let mut status = state.status.lock().await;
    status.running = false;
    status.connected = false;
    Ok(())
}

async fn run_relay(
    app: AppHandle,
    config: CloudRelayConfig,
    shutdown_rx: &mut broadcast::Receiver<()>,
) -> Result<(), String> {
    let token = login_for_token(&config).await?;
    let relay_url = ensure_client_query(&config.relay_url, "desktop")?;

    let mut request = relay_url
        .into_client_request()
        .map_err(|e| format!("Failed to build relay request: {}", e))?;
    let auth_value = HeaderValue::from_str(&format!("Bearer {}", token))
        .map_err(|e| format!("Invalid authorization header: {}", e))?;
    request.headers_mut().insert(AUTHORIZATION, auth_value);

    let (ws_stream, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|e| format!("Failed to connect relay: {}", e))?;

    {
        let state = app.state::<CloudRelayState>();
        let mut status = state.status.lock().await;
        status.connected = true;
        status.pairing_payload = Some(build_pairing_payload(&config.relay_url, &token));
        status.error = None;
    }

    let (mut ws_sink, mut ws_stream) = ws_stream.split();
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<MobileServerMessage>();

    let writer = tokio::spawn(async move {
        while let Some(message) = out_rx.recv().await {
            let payload = match serde_json::to_string(&message) {
                Ok(text) => text,
                Err(_) => continue,
            };
            if ws_sink.send(Message::Text(payload)).await.is_err() {
                break;
            }
        }
    });

    let mobile_state = app.state::<MobileGatewayState>();
    let events_sender = {
        let out_tx = out_tx.clone();
        Arc::new(move |message: MobileServerMessage| {
            let _ = out_tx.send(message);
        })
    };

    let mut event_rx = mobile_state.subscribe_events();
    let event_forwarder = {
        let out_tx = out_tx.clone();
        tokio::spawn(async move {
            while let Ok(event) = event_rx.recv().await {
                match event {
                    crate::mobile_gateway::MobileBroadcast::AgentEvent { session_id, event } => {
                        let _ = out_tx.send(MobileServerMessage::AgentEvent { session_id, event });
                    }
                    crate::mobile_gateway::MobileBroadcast::SessionList { sessions } => {
                        let _ = out_tx.send(MobileServerMessage::SessionList { sessions });
                    }
                    crate::mobile_gateway::MobileBroadcast::Options { options } => {
                        let _ = out_tx.send(MobileServerMessage::Options {
                            workspaces: options.workspaces,
                            agent_profiles: options.agent_profiles,
                            selected_workspace_id: options.selected_workspace_id,
                            selected_profile_id: options.selected_profile_id,
                        });
                    }
                }
            }
        })
    };

    let initial_sessions = mobile_state.get_sessions().await;
    let _ = out_tx.send(MobileServerMessage::SessionList {
        sessions: initial_sessions,
    });
    let initial_options = mobile_state.get_options().await;
    let _ = out_tx.send(MobileServerMessage::Options {
        workspaces: initial_options.workspaces,
        agent_profiles: initial_options.agent_profiles,
        selected_workspace_id: initial_options.selected_workspace_id,
        selected_profile_id: initial_options.selected_profile_id,
    });

    let mut paired = false;
    loop {
        tokio::select! {
            _ = shutdown_rx.recv() => {
                break;
            }
            incoming = ws_stream.next() => {
                let message = match incoming {
                    Some(Ok(msg)) => msg,
                    Some(Err(err)) => {
                        return Err(format!("Relay WebSocket error: {}", err));
                    }
                    None => break,
                };
                if let Message::Text(text) = message {
                    let parsed = serde_json::from_str::<MobileClientMessage>(&text);
                    match parsed {
                        Ok(msg) => {
                            handle_mobile_message(
                                &app,
                                &mobile_state,
                                &mut paired,
                                msg,
                                None,
                                true,
                                events_sender.clone(),
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
        }
    }

    writer.abort();
    event_forwarder.abort();

    let state = app.state::<CloudRelayState>();
    let mut status = state.status.lock().await;
    status.connected = false;
    status.pairing_payload = None;

    Ok(())
}

fn build_pairing_payload(relay_url: &str, token: &str) -> String {
    json!({
        "v": 1,
        "token": token,
        "relay_url": ensure_client_query(relay_url, "mobile").unwrap_or_else(|_| relay_url.to_string()),
    })
    .to_string()
}

fn ensure_client_query(relay_url: &str, client: &str) -> Result<String, String> {
    let mut url =
        reqwest::Url::parse(relay_url).map_err(|e| format!("Invalid relay url: {}", e))?;
    let pairs: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(k, _)| k != "client")
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    url.set_query(None);
    {
        let mut query = url.query_pairs_mut();
        for (key, value) in pairs {
            query.append_pair(&key, &value);
        }
        query.append_pair("client", client);
    }
    Ok(url.to_string())
}

async fn login_for_token(config: &CloudRelayConfig) -> Result<String, String> {
    let api_base = relay_api_base(&config.relay_url)?;
    let url = format!("{}/auth/login", api_base);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build http client: {}", e))?;

    let response = client
        .post(url)
        .json(&json!({
            "email": config.email,
            "password": config.password,
        }))
        .send()
        .await
        .map_err(|e| format!("Login failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Login failed: {}", response.status()));
    }

    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Invalid login response: {}", e))?;
    let token = value
        .get("token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Login response missing token".to_string())?;
    Ok(token.to_string())
}

fn relay_api_base(relay_url: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(relay_url).map_err(|e| format!("Invalid relay url: {}", e))?;
    let scheme = match url.scheme() {
        "wss" => "https",
        "ws" => "http",
        other => other,
    };
    let host = url
        .host_str()
        .ok_or_else(|| "Relay url missing host".to_string())?;
    let mut base = format!("{}://{}", scheme, host);
    if let Some(port) = url.port() {
        base = format!("{}:{}", base, port);
    }
    Ok(base)
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
