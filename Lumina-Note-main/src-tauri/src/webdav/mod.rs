//! WebDAV 模块
//!
//! 提供 WebDAV 同步功能，包括：
//! - 客户端：HTTP 请求封装
//! - 同步：本地优先的双向同步逻辑
//! - 命令：Tauri 命令接口

pub mod client;
pub mod commands;
pub mod sync;
pub mod types;

// Re-exports for internal use
