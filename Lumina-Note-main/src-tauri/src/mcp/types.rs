//! MCP 类型定义
//!
//! # 命名约定
//!
//! MCP 工具在 Agent 中使用时，名称格式为 `mcp_{server_name}__{tool_name}`。
//!
//! **重要**：`server_name` 不应包含双下划线 `__`，因为它用作分隔符。
//! 如果需要在 server 名称中使用分隔符，请使用单下划线 `_` 或连字符 `-`。
//!
//! 示例：
//! - ✅ `filesystem` → `mcp_filesystem__read_file`
//! - ✅ `brave-search` → `mcp_brave-search__web_search`
//! - ✅ `my_server` → `mcp_my_server__my_tool`
//! - ❌ `my__server` → 解析错误

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// MCP 配置文件结构 (.lumina/settings/mcp.json)
///
/// 配置文件位于工作区的 `.lumina/settings/mcp.json`
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct McpConfig {
    #[serde(rename = "mcpServers", default)]
    pub mcp_servers: HashMap<String, McpServerConfig>,
}

/// MCP Server 配置
///
/// 注意：server 名称（HashMap 的 key）不应包含 `__`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub command: String,
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub disabled: bool,
    #[serde(default, rename = "autoApprove")]
    pub auto_approve: Vec<String>,
}

/// MCP 工具定义（从 tools/list 返回）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "inputSchema")]
    pub input_schema: serde_json::Value,
}

/// MCP Server 状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerStatus {
    pub name: String,
    pub status: ServerConnectionStatus,
    pub tools_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ServerConnectionStatus {
    Connected,
    Disconnected,
    Error,
    Disabled,
}

/// MCP 工具调用结果
#[derive(Debug, Clone, Deserialize)]
pub struct McpToolCallResponse {
    pub content: Vec<McpContentBlock>,
    #[serde(default, rename = "isError")]
    pub is_error: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum McpContentBlock {
    Text {
        text: String,
    },
    Image {
        data: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
    },
    Resource {
        resource: McpResource,
    },
}

#[derive(Debug, Clone, Deserialize)]
pub struct McpResource {
    pub uri: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default, rename = "mimeType")]
    pub mime_type: Option<String>,
}
