use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::response::Response;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;
use yrs::updates::decoder::Decode;
use yrs::{Doc, ReadTxn, Transact, Update};

use crate::error::AppError;
use crate::state::AppState;

/// Message type constants (byte 0 prefix for WebSocket frames).
const MSG_SYNC: u8 = 0;
const MSG_AWARENESS: u8 = 1;

/// A single collaborative document room.
///
/// The `Doc` is behind a `std::sync::Mutex` (not tokio) because yrs types
/// (`Update`, `TransactionMut`) are not `Send`. All yrs operations are
/// synchronous and fast, so a blocking mutex is appropriate.
pub struct CollabRoom {
    doc: std::sync::Mutex<Doc>,
    pub peers: Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Message>>>>,
    /// Raw awareness bytes per peer. Server stores but never decodes these.
    awareness: RwLock<HashMap<String, Vec<u8>>>,
}

impl CollabRoom {
    /// Encode the full document state as a v1 update (for initial sync).
    fn encode_state(&self) -> Vec<u8> {
        let doc = self.doc.lock().unwrap();
        let txn = doc.transact();
        txn.encode_state_as_update_v1(&yrs::StateVector::default())
    }

    /// Decode a v1 update from raw bytes and apply it to the document.
    /// Returns `true` on success, `false` if the data is not a valid update.
    fn apply_update_v1(&self, data: &[u8]) -> bool {
        let update = match Update::decode_v1(data) {
            Ok(u) => u,
            Err(_) => return false,
        };
        let doc = self.doc.lock().unwrap();
        let mut txn = doc.transact_mut();
        if txn.apply_update(update).is_err() {
            return false;
        }
        true
    }
}

/// Hub managing all active collaborative document rooms.
#[derive(Clone)]
pub struct CollabHub {
    rooms: Arc<RwLock<HashMap<String, Arc<CollabRoom>>>>,
}

impl CollabHub {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get an existing room or create a new one for the given document ID.
    pub async fn get_or_create_room(&self, doc_id: &str) -> Arc<CollabRoom> {
        // Fast path: read lock
        {
            let rooms = self.rooms.read().await;
            if let Some(room) = rooms.get(doc_id) {
                return room.clone();
            }
        }

        // Slow path: write lock with double-check
        let mut rooms = self.rooms.write().await;
        if let Some(room) = rooms.get(doc_id) {
            return room.clone();
        }

        let room = Arc::new(CollabRoom {
            doc: std::sync::Mutex::new(Doc::new()),
            peers: Arc::new(RwLock::new(HashMap::new())),
            awareness: RwLock::new(HashMap::new()),
        });
        rooms.insert(doc_id.to_string(), room.clone());
        room
    }

    /// Remove a room from the hub (called when last peer disconnects).
    pub async fn remove_room(&self, doc_id: &str) {
        self.rooms.write().await.remove(doc_id);
    }
}

#[derive(serde::Deserialize)]
pub struct CollabQuery {
    pub token: String,
}

/// WebSocket upgrade handler for collaborative editing.
pub async fn collab_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
    Query(query): Query<CollabQuery>,
) -> Result<Response, AppError> {
    // Validate JWT token
    let _claims = crate::auth::decode_token(&query.token, &state.config)?;

    let hub = state.collab.clone();
    let room = hub.get_or_create_room(&doc_id).await;

    Ok(ws.on_upgrade(move |socket| async move {
        handle_collab_socket(socket, room, hub, doc_id).await;
    }))
}

/// Core WebSocket loop for a single collaborative peer.
async fn handle_collab_socket(
    socket: WebSocket,
    room: Arc<CollabRoom>,
    hub: CollabHub,
    doc_id: String,
) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    let peer_id = Uuid::new_v4().to_string();

    // --- Initial sync: send state BEFORE registering peer for broadcasts ---
    // This prevents the race where a broadcast arrives before the initial state.

    // 1. Encode and send current document state (with sync type prefix)
    let state_update = room.encode_state();
    let mut sync_msg = Vec::with_capacity(1 + state_update.len());
    sync_msg.push(MSG_SYNC);
    sync_msg.extend_from_slice(&state_update);
    let _ = ws_tx.send(Message::Binary(sync_msg)).await;

    // 2. Send existing awareness states from all current peers
    {
        let awareness_states = room.awareness.read().await;
        for (_pid, raw) in awareness_states.iter() {
            let mut msg = Vec::with_capacity(1 + raw.len());
            msg.push(MSG_AWARENESS);
            msg.extend_from_slice(raw);
            let _ = ws_tx.send(Message::Binary(msg)).await;
        }
    }

    // 3. NOW register peer for future broadcasts
    room.peers.write().await.insert(peer_id.clone(), tx.clone());

    // Spawn task to forward outbound messages to the WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Receive loop
    while let Some(Ok(msg)) = ws_rx.next().await {
        match msg {
            Message::Binary(data) => {
                if data.is_empty() {
                    continue;
                }

                match data[0] {
                    MSG_SYNC => {
                        let payload = &data[1..];
                        let applied = room.apply_update_v1(payload);

                        if applied {
                            // Broadcast the full message (with type prefix) to other peers
                            let peers = room.peers.read().await;
                            for (id, sender) in peers.iter() {
                                if *id != peer_id {
                                    let _ = sender.send(Message::Binary(data.clone()));
                                }
                            }
                        }
                    }
                    MSG_AWARENESS => {
                        // Store raw awareness bytes for this peer
                        room.awareness
                            .write()
                            .await
                            .insert(peer_id.clone(), data[1..].to_vec());

                        // Relay to all other peers (forward as-is with type prefix)
                        let peers = room.peers.read().await;
                        for (id, sender) in peers.iter() {
                            if *id != peer_id {
                                let _ = sender.send(Message::Binary(data.clone()));
                            }
                        }
                    }
                    other => {
                        tracing::warn!(
                            doc_id = %doc_id,
                            msg_type = other,
                            "unknown collab message type"
                        );
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

    // Unregister peer and clean up awareness
    room.peers.write().await.remove(&peer_id);
    room.awareness.write().await.remove(&peer_id);

    // If this was the last peer, evict the room from memory
    let peers_empty = room.peers.read().await.is_empty();
    if peers_empty {
        hub.remove_room(&doc_id).await;
        tracing::info!(
            doc_id = %doc_id,
            "collab room evicted after last peer left"
        );
    } else {
        tracing::info!(
            doc_id = %doc_id,
            peer_id = %peer_id,
            "collab peer disconnected"
        );
    }
}
