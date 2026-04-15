//! Agent event emission helpers
//!
//! Emits agent events to the Tauri frontend via the "agent-event" channel.

use crate::agent::types::AgentEvent;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

/// Emit a typed `AgentEvent` to the frontend.
pub fn emit_agent_event(app: &AppHandle, event: AgentEvent) {
    if let Err(err) = app.emit("agent-event", &event) {
        eprintln!("[Agent] Failed to emit agent event: {}", err);
    }
}

/// Emit a raw JSON payload to the frontend on the "agent-event" channel.
pub fn emit_agent_event_payload(app: &AppHandle, payload: Value) {
    if let Err(err) = app.emit("agent-event", &payload) {
        eprintln!("[Agent] Failed to emit agent event payload: {}", err);
    }
}
