use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use axum::extract::ws::Message;
use sqlx::SqlitePool;
use tokio::sync::{mpsc, RwLock};

use crate::config::Config;

#[derive(Clone)]
pub struct RelayPeer {
    pub id: String,
    pub sender: mpsc::UnboundedSender<Message>,
    #[allow(dead_code)]
    pub connected_at: Instant,
}

#[derive(Clone)]
pub struct RelayHub {
    pub desktops: Arc<RwLock<HashMap<String, RelayPeer>>>,
    pub mobiles: Arc<RwLock<HashMap<String, RelayPeer>>>,
}

impl RelayHub {
    pub fn new() -> Self {
        Self {
            desktops: Arc::new(RwLock::new(HashMap::new())),
            mobiles: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub config: Config,
    pub relay: RelayHub,
}
