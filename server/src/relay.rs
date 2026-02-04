use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;
use uuid::Uuid;
use base64::Engine;

use crate::auth::{decode_token, verify_password};
use crate::db;
use crate::error::AppError;
use crate::state::{AppState, RelayPeer};

#[derive(Debug, Deserialize)]
pub struct RelayQuery {
    pub client: String,
}

pub async fn relay_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<RelayQuery>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let client = query.client.to_lowercase();
    if client != "mobile" && client != "desktop" {
        return Err(AppError::BadRequest("client must be mobile or desktop".to_string()));
    }

    let user_id = authorize_request(&state, &headers).await?;

    Ok(ws.on_upgrade(move |socket| async move {
        handle_socket(state, socket, user_id, client).await;
    }))
}

async fn handle_socket(state: AppState, socket: WebSocket, user_id: String, client: String) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    let peer_id = Uuid::new_v4().to_string();
    let peer = RelayPeer {
        id: peer_id.clone(),
        sender: tx.clone(),
        connected_at: std::time::Instant::now(),
    };

    if client == "desktop" {
        state.relay.desktops.write().await.insert(user_id.clone(), peer);
        if let Some(mobile) = state.relay.mobiles.read().await.get(&user_id) {
            let _ = mobile.sender.send(Message::Text(
                json!({ "type": "paired", "data": { "session_id": "" } }).to_string(),
            ));
        }
    } else {
        state.relay.mobiles.write().await.insert(user_id.clone(), peer);
        if state.relay.desktops.read().await.get(&user_id).is_some() {
            let _ = tx.send(Message::Text(
                json!({ "type": "paired", "data": { "session_id": "" } }).to_string(),
            ));
        }
    }

    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = ws_rx.next().await {
        match msg {
            Message::Text(text) => {
                if client == "mobile" {
                    if let Some(peer) = state.relay.desktops.read().await.get(&user_id) {
                        let _ = peer.sender.send(Message::Text(text));
                    } else {
                        let _ = tx.send(Message::Text(
                            json!({ "type": "error", "data": { "message": "Desktop offline" } })
                                .to_string(),
                        ));
                    }
                } else {
                    if let Some(peer) = state.relay.mobiles.read().await.get(&user_id) {
                        let _ = peer.sender.send(Message::Text(text));
                    }
                }
            }
            Message::Close(_) => break,
            Message::Ping(payload) => {
                let _ = tx.send(Message::Pong(payload));
            }
            _ => {}
        }
    }

    send_task.abort();

    if client == "desktop" {
        let mut desktops = state.relay.desktops.write().await;
        if desktops.get(&user_id).map(|p| p.id == peer_id).unwrap_or(false) {
            desktops.remove(&user_id);
        }
    } else {
        let mut mobiles = state.relay.mobiles.write().await;
        if mobiles.get(&user_id).map(|p| p.id == peer_id).unwrap_or(false) {
            mobiles.remove(&user_id);
        }
    }
}

async fn authorize_request(state: &AppState, headers: &HeaderMap) -> Result<String, AppError> {
    let header = headers
        .get(axum::http::header::AUTHORIZATION)
        .ok_or(AppError::Unauthorized)?;
    let value = header.to_str().map_err(|_| AppError::Unauthorized)?;

    if let Some(token) = value.strip_prefix("Bearer ") {
        let claims = decode_token(token.trim(), &state.config)?;
        return Ok(claims.sub);
    }

    if let Some(encoded) = value.strip_prefix("Basic ") {
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(encoded.trim().as_bytes())
            .map_err(|_| AppError::Unauthorized)?;
        let decoded = String::from_utf8(decoded).map_err(|_| AppError::Unauthorized)?;
        let mut parts = decoded.splitn(2, ':');
        let email = parts.next().unwrap_or("").trim().to_lowercase();
        let password = parts.next().unwrap_or("").to_string();
        if email.is_empty() || password.is_empty() {
            return Err(AppError::Unauthorized);
        }
        let user = db::find_user_by_email(&state.pool, &email).await?;
        let (user_id, password_hash) = user.ok_or(AppError::Unauthorized)?;
        if !verify_password(&password, &password_hash)? {
            return Err(AppError::Unauthorized);
        }
        return Ok(user_id);
    }

    Err(AppError::Unauthorized)
}
