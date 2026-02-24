//! MCP (Model Context Protocol) 模块
//!
//! 提供与外部 MCP Server 的集成能力

pub mod client;
pub mod commands;
pub mod config;
pub mod manager;
pub mod transport;
pub mod types;

#[cfg(test)]
mod tests;

#[allow(unused_imports)]
pub use commands::*;
#[allow(unused_imports)]
pub use manager::McpManager;
#[allow(unused_imports)]
pub use types::*;
