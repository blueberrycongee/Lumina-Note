use crate::agent::commands::agent_start_task;
use crate::agent::types::{AgentConfig, AgentEvent, TaskContext};
use crate::agent::AgentState;
use futures_util::{SinkExt, StreamExt};
use if_addrs::{get_if_addrs, IfAddr};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::net::SocketAddr;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc, oneshot, Mutex};
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

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data")]
#[serde(rename_all = "snake_case")]
enum MobileServerMessage {
    Paired { session_id: String },
    CommandAck { command_id: String, status: String },
    AgentEvent { event: Value },
    Pong { timestamp: u64 },
    Error { message: String },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", content = "data")]
#[serde(rename_all = "snake_case")]
enum MobileClientMessage {
    Pair { token: String, device_name: Option<String> },
    Command { task: String, context: Option<MobileTaskContext> },
    Ping { timestamp: Option<u64> },
}

#[derive(Debug, Clone, Deserialize, Default)]
struct MobileTaskContext {
    active_note_path: Option<String>,
    active_note_content: Option<String>,
    file_tree: Option<String>,
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
    events: broadcast::Sender<Value>,
    shutdown: broadcast::Sender<()>,
    starting: Mutex<bool>,
}

impl MobileGatewayState {
    pub fn new() -> Self {
        let (events, _rx) = broadcast::channel(512);
        let (shutdown, _shutdown_rx) = broadcast::channel(16);
        Self {
            server: Mutex::new(None),
            agent_config: Mutex::new(None),
            workspace_path: Mutex::new(None),
            events,
            shutdown,
            starting: Mutex::new(false),
        }
    }

    fn build_status(&self, server: Option<&MobileServer>) -> MobileGatewayStatus {
        let addresses = list_ipv4_addresses();
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

    fn broadcast(&self, payload: Value) {
        let _ = self.events.send(payload);
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
}

impl Default for MobileGatewayState {
    fn default() -> Self {
        Self::new()
    }
}

pub fn emit_agent_event(app: &AppHandle, event: AgentEvent) {
    let payload = serde_json::to_value(&event)
        .unwrap_or_else(|_| json!({ "type": "unknown", "data": null }));
    emit_agent_event_payload(app, payload);
}

pub fn emit_agent_event_payload(app: &AppHandle, payload: Value) {
    let _ = app.emit("agent-event", payload.clone());
    let state = app.state::<MobileGatewayState>();
    state.broadcast(payload);
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
pub async fn mobile_get_status(state: State<'_, MobileGatewayState>) -> Result<MobileGatewayStatus, String> {
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
        let listener = TcpListener::bind("0.0.0.0:0")
            .await
            .map_err(|e| format!("Failed to bind mobile gateway: {}", e))?;
        let addr = listener
            .local_addr()
            .map_err(|e| format!("Failed to get server address: {}", e))?;
        let token = generate_token(8);
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let events = state.events.clone();
        let shutdown = state.shutdown.clone();
        let app_handle = app.clone();
        let token_clone = token.clone();

        tokio::spawn(async move {
            run_server(app_handle, listener, token_clone, events, shutdown, shutdown_rx).await;
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
    state.set_workspace(Some(workspace_path)).await;
    persist_settings(&app, &state).await?;
    Ok(())
}

#[tauri::command]
pub async fn mobile_set_agent_config(
    app: AppHandle,
    state: State<'_, MobileGatewayState>,
    config: AgentConfig,
) -> Result<(), String> {
    state.set_agent_config(Some(config)).await;
    persist_settings(&app, &state).await?;
    Ok(())
}

async fn run_server(
    app: AppHandle,
    listener: TcpListener,
    token: String,
    events: broadcast::Sender<Value>,
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
    events: broadcast::Sender<Value>,
    shutdown: broadcast::Sender<()>,
) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(err) => {
            eprintln!("[MobileGateway] WebSocket handshake failed: {}", err);
            return;
        }
    };

    let (mut ws_sink, mut ws_stream) = ws_stream.split();
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<MobileServerMessage>();
    let mut event_rx = events.subscribe();
    let mut shutdown_rx = shutdown.subscribe();
    let mut paired = false;

    let writer = tokio::spawn(async move {
        while let Some(message) = out_rx.recv().await {
            let payload = match serde_json::to_string(&message) {
                Ok(text) => text,
                Err(_) => continue,
            };
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
                        eprintln!("[MobileGateway] WebSocket error: {}", err);
                        break;
                    }
                    None => break,
                };

                if let tokio_tungstenite::tungstenite::Message::Text(text) = message {
                    let parsed = serde_json::from_str::<MobileClientMessage>(&text);
                    match parsed {
                        Ok(MobileClientMessage::Pair { token: incoming_token, .. }) => {
                            if incoming_token == token {
                                paired = true;
                                let _ = out_tx.send(MobileServerMessage::Paired {
                                    session_id: uuid::Uuid::new_v4().to_string(),
                                });
                            } else {
                                let _ = out_tx.send(MobileServerMessage::Error {
                                    message: "Invalid pairing token".to_string(),
                                });
                            }
                        }
                        Ok(MobileClientMessage::Ping { timestamp }) => {
                            let _ = out_tx.send(MobileServerMessage::Pong {
                                timestamp: timestamp.unwrap_or_else(current_timestamp),
                            });
                        }
                        Ok(MobileClientMessage::Command { task, context }) => {
                            if !paired {
                                let _ = out_tx.send(MobileServerMessage::Error {
                                    message: "Not paired".to_string(),
                                });
                                continue;
                            }

                            let workspace_path = app.state::<MobileGatewayState>().get_workspace().await;
                            let agent_config = app.state::<MobileGatewayState>().get_agent_config().await;

                            let workspace_path = match workspace_path {
                                Some(path) => path,
                                None => {
                                    let _ = out_tx.send(MobileServerMessage::Error {
                                        message: "Workspace path not set".to_string(),
                                    });
                                    continue;
                                }
                            };
                            let agent_config = match agent_config {
                                Some(config) => config,
                                None => {
                                    let _ = out_tx.send(MobileServerMessage::Error {
                                        message: "Agent config not set".to_string(),
                                    });
                                    continue;
                                }
                            };

                            let command_id = uuid::Uuid::new_v4().to_string();
                            let _ = out_tx.send(MobileServerMessage::CommandAck {
                                command_id: command_id.clone(),
                                status: "accepted".to_string(),
                            });

                            let app_handle = app.clone();
                            let out_tx_clone = out_tx.clone();
                            tokio::spawn(async move {
                                let context = build_task_context(workspace_path, context);
                                let agent_state = app_handle.state::<AgentState>();
                                let result = agent_start_task(
                                    app_handle.clone(),
                                    agent_state,
                                    agent_config,
                                    task,
                                    context,
                                )
                                .await;
                                if let Err(err) = result {
                                    let _ = out_tx_clone.send(MobileServerMessage::Error {
                                        message: err,
                                    });
                                }
                            });
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
                    let _ = out_tx.send(MobileServerMessage::AgentEvent { event: payload });
                }
            }
        }
    }

    writer.abort();
}

fn build_task_context(workspace_path: String, context: Option<MobileTaskContext>) -> TaskContext {
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
    let content = fs::read_to_string(path).ok()?;
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
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create mobile settings dir: {}", e))?;
    }
    let payload = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize mobile settings: {}", e))?;
    fs::write(path, payload).map_err(|e| format!("Failed to write mobile settings: {}", e))?;
    Ok(())
}
