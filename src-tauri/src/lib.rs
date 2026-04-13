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
pub mod mobile_gateway;
mod node_runtime;
pub mod proxy;
pub mod secure_store;
mod typesetting;
mod update_manager;
mod vector_db;

#[cfg(target_os = "macos")]
pub mod traffic_lights;

pub use commands::*;
pub use error::*;
pub use fs::*;
pub use llm::*;
pub use typesetting::*;

// Re-export vector_db items explicitly to avoid shadowing
pub use vector_db::{
    check_file_needs_reindex, clear_vector_index, delete_file_vectors, delete_vectors,
    get_vector_index_status, init_vector_db, search_vector_chunks, upsert_vector_chunks,
    IndexStatus, SearchResult, VectorChunk,
};

// Re-export agent commands
pub use agent::{
    agent_abort, agent_approve_tool, agent_continue_with_answer, agent_disable_debug,
    agent_enable_debug, agent_get_debug_log_path, agent_get_queue_status,
    agent_get_session_memory_snapshot, agent_get_status, agent_is_debug_enabled,
    agent_reset_session_memory, agent_start_task, agent_update_session_memory, AgentState,
};

// Re-export MCP commands
pub use mcp::{
    mcp_init, mcp_list_servers, mcp_list_tools, mcp_reload, mcp_shutdown, mcp_start_server,
    mcp_stop_server, mcp_test_tool,
};
