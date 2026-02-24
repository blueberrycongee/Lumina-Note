//! MCP Tauri 命令

use super::manager::McpManager;
use super::types::*;

/// 初始化 MCP（应用启动时调用）
#[tauri::command]
pub async fn mcp_init(workspace_path: String) -> Result<(), String> {
    let global = McpManager::global();
    let mut manager = global.write().await;
    manager.init(&workspace_path).await
}

/// 获取所有 Server 状态
#[tauri::command]
pub async fn mcp_list_servers() -> Result<Vec<McpServerStatus>, String> {
    let global = McpManager::global();
    let manager = global.read().await;
    Ok(manager.list_servers())
}

/// 启动 Server
#[tauri::command]
pub async fn mcp_start_server(name: String) -> Result<(), String> {
    let global = McpManager::global();
    let mut manager = global.write().await;
    manager.start_server(&name).await
}

/// 停止 Server
#[tauri::command]
pub async fn mcp_stop_server(name: String) -> Result<(), String> {
    let global = McpManager::global();
    let mut manager = global.write().await;
    manager.stop_server(&name).await
}

/// 获取所有工具列表
#[tauri::command]
pub async fn mcp_list_tools(server_name: Option<String>) -> Result<Vec<McpToolInfo>, String> {
    let global = McpManager::global();
    let manager = global.read().await;
    let all_tools = manager.get_all_tools();

    let tools: Vec<McpToolInfo> = if let Some(name) = server_name {
        all_tools
            .into_iter()
            .filter(|(s, _)| s == &name)
            .map(|(server, tool)| McpToolInfo {
                server_name: server,
                name: tool.name,
                description: tool.description,
                input_schema: tool.input_schema,
            })
            .collect()
    } else {
        all_tools
            .into_iter()
            .map(|(server, tool)| McpToolInfo {
                server_name: server,
                name: tool.name,
                description: tool.description,
                input_schema: tool.input_schema,
            })
            .collect()
    };

    Ok(tools)
}

/// 重新加载配置
#[tauri::command]
pub async fn mcp_reload() -> Result<(), String> {
    let global = McpManager::global();
    let mut manager = global.write().await;
    manager.reload().await
}

/// 测试工具调用
#[tauri::command]
pub async fn mcp_test_tool(
    server_name: String,
    tool_name: String,
    args: serde_json::Value,
) -> Result<String, String> {
    let global = McpManager::global();
    let manager = global.read().await;
    let response = manager.call_tool(&server_name, &tool_name, args).await?;

    let content: String = response
        .content
        .iter()
        .filter_map(|block| match block {
            McpContentBlock::Text { text } => Some(text.clone()),
            McpContentBlock::Resource { resource } => resource.text.clone(),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n");

    Ok(content)
}

/// 关闭所有 MCP 连接
#[tauri::command]
pub async fn mcp_shutdown() -> Result<(), String> {
    let global = McpManager::global();
    let mut manager = global.write().await;
    manager.shutdown_all().await
}

// ============ 辅助类型 ============

/// 工具信息（用于前端展示）
#[derive(Debug, Clone, serde::Serialize)]
pub struct McpToolInfo {
    pub server_name: String,
    pub name: String,
    pub description: Option<String>,
    pub input_schema: serde_json::Value,
}
