use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use axum::extract::ws::Message;
use serde::Serialize;
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
    pub metrics: Arc<ServerMetrics>,
}

#[derive(Debug, Default)]
pub struct ServerMetrics {
    pub dav_requests: AtomicU64,
    pub dav_failures: AtomicU64,
    pub dav_bytes_in: AtomicU64,
    pub dav_bytes_out: AtomicU64,
    pub relay_connections: AtomicU64,
    pub relay_active: AtomicU64,
    pub relay_failures: AtomicU64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerMetricsSnapshot {
    pub dav_requests: u64,
    pub dav_failures: u64,
    pub dav_bytes_in: u64,
    pub dav_bytes_out: u64,
    pub relay_connections: u64,
    pub relay_active: u64,
    pub relay_failures: u64,
}

impl ServerMetrics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn snapshot(&self) -> ServerMetricsSnapshot {
        ServerMetricsSnapshot {
            dav_requests: self.dav_requests.load(Ordering::Relaxed),
            dav_failures: self.dav_failures.load(Ordering::Relaxed),
            dav_bytes_in: self.dav_bytes_in.load(Ordering::Relaxed),
            dav_bytes_out: self.dav_bytes_out.load(Ordering::Relaxed),
            relay_connections: self.relay_connections.load(Ordering::Relaxed),
            relay_active: self.relay_active.load(Ordering::Relaxed),
            relay_failures: self.relay_failures.load(Ordering::Relaxed),
        }
    }

    pub fn inc_dav_requests(&self) -> u64 {
        self.dav_requests.fetch_add(1, Ordering::Relaxed) + 1
    }

    pub fn inc_dav_failures(&self) -> u64 {
        self.dav_failures.fetch_add(1, Ordering::Relaxed) + 1
    }

    pub fn add_dav_bytes_in(&self, bytes: u64) -> u64 {
        self.dav_bytes_in.fetch_add(bytes, Ordering::Relaxed) + bytes
    }

    pub fn add_dav_bytes_out(&self, bytes: u64) -> u64 {
        self.dav_bytes_out.fetch_add(bytes, Ordering::Relaxed) + bytes
    }

    pub fn inc_relay_connections(&self) -> u64 {
        self.relay_connections.fetch_add(1, Ordering::Relaxed) + 1
    }

    pub fn inc_relay_failures(&self) -> u64 {
        self.relay_failures.fetch_add(1, Ordering::Relaxed) + 1
    }

    pub fn inc_relay_active(&self) -> u64 {
        self.relay_active.fetch_add(1, Ordering::Relaxed) + 1
    }

    pub fn dec_relay_active(&self) -> u64 {
        self.relay_active
            .fetch_sub(1, Ordering::Relaxed)
            .saturating_sub(1)
    }
}
