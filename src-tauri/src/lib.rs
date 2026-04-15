#![allow(dead_code)]

pub mod agent;
pub mod cloud_relay;
mod commands;
mod doc_tools;
mod error;
pub mod forge_runtime;
mod fs;
mod llm;
pub mod mcp;
mod node_runtime;
pub mod proxy;
pub mod secure_store;
mod typesetting;
mod update_manager;

#[cfg(target_os = "macos")]
pub mod traffic_lights;

pub use commands::*;
pub use error::*;
pub use fs::*;
pub use llm::*;
pub use typesetting::*;

// Re-export agent commands
pub use agent::{
    agent_abort, agent_approve_tool, agent_continue_with_answer,
    agent_disable_debug, agent_enable_debug,
    agent_get_debug_log_path,
    agent_get_queue_status, agent_get_status,
    agent_is_debug_enabled,
    agent_start_task, vault_initialize, vault_load_index, vault_run_lint, AgentState,
};

// Re-export MCP commands
pub use mcp::{
    mcp_init, mcp_list_servers, mcp_list_tools, mcp_reload, mcp_shutdown, mcp_start_server,
    mcp_stop_server, mcp_test_tool,
};
