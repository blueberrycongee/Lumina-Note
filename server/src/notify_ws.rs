use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::Response;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

use crate::auth::decode_token;
use crate::db;
use crate::error::AppError;
use crate::state::AppState;

const MAX_CONNECTIONS_PER_USER: usize = 5;

struct NotifyConn {
    id: String,
    sender: mpsc::UnboundedSender<Message>,
}

#[derive(Clone)]
pub struct NotifyHub {
    connections: Arc<RwLock<HashMap<String, Vec<NotifyConn>>>>,
}

impl NotifyHub {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register(
        &self,
        user_id: &str,
        conn_id: String,
        sender: mpsc::UnboundedSender<Message>,
    ) {
        let mut conns = self.connections.write().await;
        let user_conns = conns.entry(user_id.to_string()).or_default();

        if user_conns.len() >= MAX_CONNECTIONS_PER_USER {
            let evicted = user_conns.remove(0);
            tracing::info!(
                user_id = %user_id,
                evicted_conn_id = %evicted.id,
                "evicting oldest notification connection (limit: {})",
                MAX_CONNECTIONS_PER_USER
            );
        }

        user_conns.push(NotifyConn {
            id: conn_id,
            sender,
        });
    }

    pub async fn unregister(&self, user_id: &str, conn_id: &str) {
        let mut conns = self.connections.write().await;
        if let Some(user_conns) = conns.get_mut(user_id) {
            user_conns.retain(|c| c.id != conn_id);
            if user_conns.is_empty() {
                conns.remove(user_id);
            }
        }
    }

    pub async fn send(&self, user_id: &str, payload: &str) {
        let mut conns = self.connections.write().await;
        if let Some(user_conns) = conns.get_mut(user_id) {
            user_conns.retain(|c| c.sender.send(Message::Text(payload.to_string())).is_ok());
            if user_conns.is_empty() {
                conns.remove(user_id);
            }
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct NotifyQuery {
    pub token: String,
}

pub async fn notify_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<NotifyQuery>,
) -> Result<Response, AppError> {
    let claims = decode_token(&query.token, &state.config)?;
    let user_id = claims.sub;
    Ok(ws.on_upgrade(move |socket| async move {
        handle_notify_socket(state, socket, user_id).await;
    }))
}

async fn handle_notify_socket(state: AppState, socket: WebSocket, user_id: String) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    let conn_id = Uuid::new_v4().to_string();
    state
        .notify
        .register(&user_id, conn_id.clone(), tx.clone())
        .await;

    // Send initial unread count
    match db::count_unread_notifications(&state.pool, &user_id).await {
        Ok(count) => {
            let _ = tx.send(Message::Text(
                json!({"type": "unread", "count": count}).to_string(),
            ));
        }
        Err(err) => {
            tracing::error!(user_id = %user_id, error = %err, "failed to fetch unread count");
        }
    }

    let last_recv = Arc::new(AtomicI64::new(chrono::Utc::now().timestamp()));
    let last_recv_clone = Arc::clone(&last_recv);

    let send_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Some(msg) => {
                            if ws_tx.send(msg).await.is_err() {
                                break;
                            }
                        }
                        None => break,
                    }
                }
                _ = interval.tick() => {
                    let now = chrono::Utc::now().timestamp();
                    let last = last_recv_clone.load(Ordering::Relaxed);
                    if now - last > 45 {
                        tracing::debug!("notify ws: client appears dead, closing");
                        break;
                    }
                    if ws_tx.send(Message::Ping(vec![])).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    while let Some(message) = ws_rx.next().await {
        let msg = match message {
            Ok(msg) => msg,
            Err(_) => break,
        };
        match msg {
            Message::Pong(_) => {
                last_recv.store(chrono::Utc::now().timestamp(), Ordering::Relaxed);
            }
            Message::Ping(payload) => {
                last_recv.store(chrono::Utc::now().timestamp(), Ordering::Relaxed);
                let _ = tx.send(Message::Pong(payload));
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    send_task.abort();
    state.notify.unregister(&user_id, &conn_id).await;
}
