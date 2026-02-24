//! MCP 配置文件处理

use super::types::McpConfig;
use std::path::Path;

/// 配置文件相对路径
const MCP_CONFIG_PATH: &str = ".lumina/settings/mcp.json";

/// 加载 MCP 配置
pub async fn load_mcp_config(workspace_path: &str) -> Result<McpConfig, String> {
    let config_path = Path::new(workspace_path).join(MCP_CONFIG_PATH);

    if !config_path.exists() {
        return Ok(McpConfig::default());
    }

    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("Failed to read MCP config: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse MCP config: {}", e))
}

/// 保存 MCP 配置
pub async fn save_mcp_config(workspace_path: &str, config: &McpConfig) -> Result<(), String> {
    let config_path = Path::new(workspace_path).join(MCP_CONFIG_PATH);

    // 确保目录存在
    if let Some(parent) = config_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    tokio::fs::write(&config_path, content)
        .await
        .map_err(|e| format!("Failed to write config: {}", e))
}

/// 获取配置文件路径
pub fn get_config_path(workspace_path: &str) -> String {
    Path::new(workspace_path)
        .join(MCP_CONFIG_PATH)
        .to_string_lossy()
        .to_string()
}
