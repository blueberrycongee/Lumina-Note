//! MCP 模块单元测试
//!
//! 从用户角度测试 MCP 功能

#[cfg(test)]
mod tests {
    use crate::mcp::config::{load_mcp_config, save_mcp_config};
    use crate::mcp::types::*;
    use std::collections::HashMap;
    use tempfile::TempDir;

    // ============ 配置文件测试 ============

    /// 用户场景：首次使用，没有配置文件
    /// 期望：返回空配置，不报错
    #[tokio::test]
    async fn test_load_config_when_no_file_exists() {
        let temp_dir = TempDir::new().unwrap();
        let workspace_path = temp_dir.path().to_str().unwrap();

        let config = load_mcp_config(workspace_path).await;

        assert!(config.is_ok());
        let config = config.unwrap();
        assert!(config.mcp_servers.is_empty());
    }

    /// 用户场景：配置了一个 MCP 服务器
    /// 期望：正确解析配置
    #[tokio::test]
    async fn test_load_valid_config() {
        let temp_dir = TempDir::new().unwrap();
        let workspace_path = temp_dir.path().to_str().unwrap();

        // 创建配置目录和文件
        let config_dir = temp_dir.path().join(".lumina/settings");
        std::fs::create_dir_all(&config_dir).unwrap();

        let config_content = r#"{
            "mcpServers": {
                "filesystem": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
                    "env": {},
                    "disabled": false,
                    "autoApprove": ["read_file"]
                }
            }
        }"#;
        std::fs::write(config_dir.join("mcp.json"), config_content).unwrap();

        let config = load_mcp_config(workspace_path).await.unwrap();

        assert_eq!(config.mcp_servers.len(), 1);
        assert!(config.mcp_servers.contains_key("filesystem"));

        let server = &config.mcp_servers["filesystem"];
        assert_eq!(server.command, "npx");
        assert!(!server.disabled);
        assert!(server.auto_approve.contains(&"read_file".to_string()));
    }

    /// 用户场景：配置文件格式错误
    /// 期望：返回解析错误
    #[tokio::test]
    async fn test_load_invalid_config() {
        let temp_dir = TempDir::new().unwrap();
        let workspace_path = temp_dir.path().to_str().unwrap();

        let config_dir = temp_dir.path().join(".lumina/settings");
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(config_dir.join("mcp.json"), "{ invalid json }").unwrap();

        let result = load_mcp_config(workspace_path).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("parse"));
    }

    /// 用户场景：保存新的 MCP 配置
    /// 期望：配置文件被正确创建
    #[tokio::test]
    async fn test_save_config() {
        let temp_dir = TempDir::new().unwrap();
        let workspace_path = temp_dir.path().to_str().unwrap();

        let mut servers = HashMap::new();
        servers.insert(
            "test-server".to_string(),
            McpServerConfig {
                command: "test-cmd".to_string(),
                args: vec!["arg1".to_string()],
                env: HashMap::new(),
                disabled: false,
                auto_approve: vec!["tool1".to_string()],
            },
        );

        let config = McpConfig {
            mcp_servers: servers,
        };

        let result = save_mcp_config(workspace_path, &config).await;
        assert!(result.is_ok());

        // 验证文件已创建
        let config_path = temp_dir.path().join(".lumina/settings/mcp.json");
        assert!(config_path.exists());

        // 验证内容可以重新加载
        let loaded = load_mcp_config(workspace_path).await.unwrap();
        assert_eq!(loaded.mcp_servers.len(), 1);
        assert!(loaded.mcp_servers.contains_key("test-server"));
    }

    // ============ 类型测试 ============

    /// 用户场景：MCP 服务器返回文本内容
    /// 期望：正确解析文本块
    #[test]
    fn test_parse_text_content_block() {
        let json = r#"{"type": "text", "text": "Hello, World!"}"#;
        let block: McpContentBlock = serde_json::from_str(json).unwrap();

        match block {
            McpContentBlock::Text { text } => {
                assert_eq!(text, "Hello, World!");
            }
            _ => panic!("Expected Text block"),
        }
    }

    /// 用户场景：MCP 服务器返回资源内容
    /// 期望：正确解析资源块
    #[test]
    fn test_parse_resource_content_block() {
        let json = r#"{
            "type": "resource",
            "resource": {
                "uri": "file:///tmp/test.txt",
                "text": "File content here",
                "mimeType": "text/plain"
            }
        }"#;
        let block: McpContentBlock = serde_json::from_str(json).unwrap();

        match block {
            McpContentBlock::Resource { resource } => {
                assert_eq!(resource.uri, "file:///tmp/test.txt");
                assert_eq!(resource.text, Some("File content here".to_string()));
            }
            _ => panic!("Expected Resource block"),
        }
    }

    /// 用户场景：MCP 工具调用返回错误
    /// 期望：正确解析错误标志
    #[test]
    fn test_parse_tool_response_with_error() {
        let json = r#"{
            "content": [{"type": "text", "text": "File not found"}],
            "isError": true
        }"#;
        let response: McpToolCallResponse = serde_json::from_str(json).unwrap();

        assert!(response.is_error);
        assert_eq!(response.content.len(), 1);
    }

    /// 用户场景：MCP 工具调用成功
    /// 期望：isError 默认为 false
    #[test]
    fn test_parse_tool_response_success() {
        let json = r#"{
            "content": [{"type": "text", "text": "Success"}]
        }"#;
        let response: McpToolCallResponse = serde_json::from_str(json).unwrap();

        assert!(!response.is_error);
    }

    // ============ 服务器状态测试 ============

    /// 用户场景：查看服务器状态
    /// 期望：状态枚举正确序列化
    #[test]
    fn test_server_status_serialization() {
        let status = McpServerStatus {
            name: "test".to_string(),
            status: ServerConnectionStatus::Connected,
            tools_count: 5,
            error: None,
        };

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"status\":\"connected\""));
        assert!(json.contains("\"tools_count\":5"));
    }

    /// 用户场景：服务器连接失败
    /// 期望：错误信息被正确记录
    #[test]
    fn test_server_status_with_error() {
        let status = McpServerStatus {
            name: "failed-server".to_string(),
            status: ServerConnectionStatus::Error,
            tools_count: 0,
            error: Some("Connection refused".to_string()),
        };

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"status\":\"error\""));
        assert!(json.contains("Connection refused"));
    }

    // ============ 工具名称解析测试 ============

    /// 用户场景：Agent 调用 MCP 工具
    /// 期望：工具名称格式正确解析
    #[test]
    fn test_mcp_tool_name_format() {
        // 格式: mcp_{server_name}__{tool_name}
        let full_name = "mcp_filesystem__read_file";

        let name_without_prefix = full_name.strip_prefix("mcp_").unwrap();
        let parts: Vec<&str> = name_without_prefix.splitn(2, "__").collect();

        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0], "filesystem");
        assert_eq!(parts[1], "read_file");
    }

    /// 用户场景：服务器名称包含连字符
    /// 期望：正确解析
    #[test]
    fn test_mcp_tool_name_with_hyphen_server() {
        let full_name = "mcp_brave-search__web_search";

        let name_without_prefix = full_name.strip_prefix("mcp_").unwrap();
        let parts: Vec<&str> = name_without_prefix.splitn(2, "__").collect();

        assert_eq!(parts[0], "brave-search");
        assert_eq!(parts[1], "web_search");
    }

    /// 用户场景：工具名称包含下划线
    /// 期望：正确解析（双下划线分隔）
    #[test]
    fn test_mcp_tool_name_with_underscore_tool() {
        let full_name = "mcp_postgres__execute_query";

        let name_without_prefix = full_name.strip_prefix("mcp_").unwrap();
        let parts: Vec<&str> = name_without_prefix.splitn(2, "__").collect();

        assert_eq!(parts[0], "postgres");
        assert_eq!(parts[1], "execute_query");
    }

    // ============ autoApprove 测试 ============

    /// 用户场景：检查工具是否在自动批准列表
    /// 期望：正确判断
    #[test]
    fn test_auto_approve_check() {
        let config = McpServerConfig {
            command: "test".to_string(),
            args: vec![],
            env: HashMap::new(),
            disabled: false,
            auto_approve: vec!["read_file".to_string(), "list_directory".to_string()],
        };

        assert!(config.auto_approve.contains(&"read_file".to_string()));
        assert!(config.auto_approve.contains(&"list_directory".to_string()));
        assert!(!config.auto_approve.contains(&"write_file".to_string()));
    }

    // ============ 工具定义测试 ============

    /// 用户场景：MCP 工具有完整的 schema
    /// 期望：正确解析 inputSchema
    #[test]
    fn test_mcp_tool_definition() {
        let json = r#"{
            "name": "read_file",
            "description": "Read a file from the filesystem",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file"
                    }
                },
                "required": ["path"]
            }
        }"#;

        let tool: McpTool = serde_json::from_str(json).unwrap();

        assert_eq!(tool.name, "read_file");
        assert!(tool.description.is_some());
        assert!(tool.input_schema.is_object());
    }

    /// 用户场景：MCP 工具没有描述
    /// 期望：description 为 None
    #[test]
    fn test_mcp_tool_without_description() {
        let json = r#"{
            "name": "simple_tool",
            "inputSchema": {"type": "object"}
        }"#;

        let tool: McpTool = serde_json::from_str(json).unwrap();

        assert_eq!(tool.name, "simple_tool");
        assert!(tool.description.is_none());
    }
}
