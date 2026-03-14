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

/// A single collaborative document room.
///
/// The `Doc` is behind a `std::sync::Mutex` (not tokio) because yrs types
/// (`Update`, `TransactionMut`) are not `Send`. All yrs operations are
/// synchronous and fast, so a blocking mutex is appropriate.
pub struct CollabRoom {
    doc: std::sync::Mutex<Doc>,
    pub peers: Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Message>>>>,
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
        });
        rooms.insert(doc_id.to_string(), room.clone());
        room
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

    let room = state.collab.get_or_create_room(&doc_id).await;

    Ok(ws.on_upgrade(move |socket| async move {
        handle_collab_socket(socket, room, doc_id).await;
    }))
}

/// Core WebSocket loop for a single collaborative peer.
async fn handle_collab_socket(socket: WebSocket, room: Arc<CollabRoom>, doc_id: String) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    let peer_id = Uuid::new_v4().to_string();

    // Register peer
    room.peers.write().await.insert(peer_id.clone(), tx.clone());

    // Send current document state as initial sync.
    // All yrs work is done synchronously inside encode_state().
    let state_update = room.encode_state();
    let _ = tx.send(Message::Binary(state_update));

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
                // Apply update synchronously (no await while holding yrs types)
                let applied = room.apply_update_v1(&data);

                if applied {
                    // Broadcast to all other peers
                    let peers = room.peers.read().await;
                    for (id, sender) in peers.iter() {
                        if *id != peer_id {
                            let _ = sender.send(Message::Binary(data.clone()));
                        }
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

    // Unregister peer
    room.peers.write().await.remove(&peer_id);

    tracing::info!(
        doc_id = %doc_id,
        peer_id = %peer_id,
        "collab peer disconnected"
    );
}
