#![allow(dead_code)]

pub mod cloud_relay;
mod commands;
mod doc_tools;
mod error;
mod fs;
mod llm;
pub mod mcp;
mod node_runtime;
pub mod proxy;
pub mod secure_store;
mod update_manager;

#[cfg(target_os = "macos")]
pub mod traffic_lights;

pub use commands::*;
pub use error::*;
pub use fs::*;
pub use llm::*;

// Re-export MCP commands
pub use mcp::{
    mcp_init, mcp_list_servers, mcp_list_tools, mcp_reload, mcp_shutdown, mcp_start_server,
    mcp_stop_server, mcp_test_tool,
};
