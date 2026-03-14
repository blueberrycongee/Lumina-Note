use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::ws::Message;
use tokio::sync::{mpsc, RwLock};

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

        user_conns.push(NotifyConn { id: conn_id, sender });
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
