//! MCP 集成测试
//!
//! 从用户角度测试完整的 MCP 工作流程

use lumina_note_lib as lumina_lib;
use std::collections::HashMap;
use tempfile::TempDir;

/// 创建测试用的 MCP 配置
fn create_test_config(temp_dir: &TempDir) -> String {
    let config_dir = temp_dir.path().join(".lumina/settings");
    std::fs::create_dir_all(&config_dir).unwrap();

    let config = r#"{
        "mcpServers": {
            "echo-server": {
                "command": "echo",
                "args": ["test"],
                "env": {},
                "disabled": false,
                "autoApprove": ["echo"]
            }
        }
    }"#;

    std::fs::write(config_dir.join("mcp.json"), config).unwrap();
    temp_dir.path().to_str().unwrap().to_string()
}

// ============ 用户场景测试 ============

/// 场景：用户首次打开应用，没有 MCP 配置
/// 期望：应用正常启动，MCP 功能不可用但不报错
#[tokio::test]
async fn test_user_scenario_no_mcp_config() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_path = temp_dir.path().to_str().unwrap();

    // 模拟 mcp_init 调用
    // 由于没有配置文件，应该返回成功但没有服务器
    // 这里我们直接测试配置加载
    let config = lumina_lib::mcp::config::load_mcp_config(workspace_path).await;

    assert!(config.is_ok());
    assert!(config.unwrap().mcp_servers.is_empty());
}

/// 场景：用户配置了 MCP 服务器但设置为 disabled
/// 期望：服务器不会被启动
#[tokio::test]
async fn test_user_scenario_disabled_server() {
    let temp_dir = TempDir::new().unwrap();
    let config_dir = temp_dir.path().join(".lumina/settings");
    std::fs::create_dir_all(&config_dir).unwrap();

    let config = r#"{
        "mcpServers": {
            "disabled-server": {
                "command": "nonexistent",
                "args": [],
                "disabled": true,
                "autoApprove": []
            }
        }
    }"#;
    std::fs::write(config_dir.join("mcp.json"), config).unwrap();

    let workspace_path = temp_dir.path().to_str().unwrap();
    let loaded = lumina_lib::mcp::config::load_mcp_config(workspace_path)
        .await
        .unwrap();

    assert_eq!(loaded.mcp_servers.len(), 1);
    assert!(loaded.mcp_servers["disabled-server"].disabled);
}

/// 场景：用户想知道哪些工具需要审批
/// 期望：不在 autoApprove 列表中的工具需要审批
#[tokio::test]
async fn test_user_scenario_approval_required() {
    let temp_dir = TempDir::new().unwrap();
    let config_dir = temp_dir.path().join(".lumina/settings");
    std::fs::create_dir_all(&config_dir).unwrap();

    let config = r#"{
        "mcpServers": {
            "filesystem": {
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem"],
                "disabled": false,
                "autoApprove": ["read_file", "list_directory"]
            }
        }
    }"#;
    std::fs::write(config_dir.join("mcp.json"), config).unwrap();

    let workspace_path = temp_dir.path().to_str().unwrap();
    let loaded = lumina_lib::mcp::config::load_mcp_config(workspace_path)
        .await
        .unwrap();

    let server = &loaded.mcp_servers["filesystem"];

    // read_file 在 autoApprove 中，不需要审批
    assert!(server.auto_approve.contains(&"read_file".to_string()));

    // write_file 不在 autoApprove 中，需要审批
    assert!(!server.auto_approve.contains(&"write_file".to_string()));

    // delete_file 不在 autoApprove 中，需要审批
    assert!(!server.auto_approve.contains(&"delete_file".to_string()));
}

/// 场景：用户配置了多个 MCP 服务器
/// 期望：所有服务器都被正确加载
#[tokio::test]
async fn test_user_scenario_multiple_servers() {
    let temp_dir = TempDir::new().unwrap();
    let config_dir = temp_dir.path().join(".lumina/settings");
    std::fs::create_dir_all(&config_dir).unwrap();

    let config = r#"{
        "mcpServers": {
            "filesystem": {
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem"],
                "disabled": false,
                "autoApprove": []
            },
            "brave-search": {
                "command": "uvx",
                "args": ["mcp-server-brave-search"],
                "env": {"BRAVE_API_KEY": "test-key"},
                "disabled": false,
                "autoApprove": []
            },
            "memory": {
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-memory"],
                "disabled": true,
                "autoApprove": []
            }
        }
    }"#;
    std::fs::write(config_dir.join("mcp.json"), config).unwrap();

    let workspace_path = temp_dir.path().to_str().unwrap();
    let loaded = lumina_lib::mcp::config::load_mcp_config(workspace_path)
        .await
        .unwrap();

    assert_eq!(loaded.mcp_servers.len(), 3);
    assert!(loaded.mcp_servers.contains_key("filesystem"));
    assert!(loaded.mcp_servers.contains_key("brave-search"));
    assert!(loaded.mcp_servers.contains_key("memory"));

    // 验证环境变量
    assert_eq!(
        loaded.mcp_servers["brave-search"].env.get("BRAVE_API_KEY"),
        Some(&"test-key".to_string())
    );
}

/// 场景：用户修改配置后保存
/// 期望：配置被正确保存，可以重新加载
#[tokio::test]
async fn test_user_scenario_save_and_reload_config() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_path = temp_dir.path().to_str().unwrap();

    // 创建新配置
    let mut servers = HashMap::new();
    servers.insert(
        "new-server".to_string(),
        lumina_lib::mcp::McpServerConfig {
            command: "test-command".to_string(),
            args: vec!["--arg1".to_string(), "--arg2".to_string()],
            env: {
                let mut env = HashMap::new();
                env.insert("API_KEY".to_string(), "secret".to_string());
                env
            },
            disabled: false,
            auto_approve: vec!["safe_tool".to_string()],
        },
    );

    let config = lumina_lib::mcp::McpConfig {
        mcp_servers: servers,
    };

    // 保存配置
    lumina_lib::mcp::config::save_mcp_config(workspace_path, &config)
        .await
        .unwrap();

    // 重新加载
    let loaded = lumina_lib::mcp::config::load_mcp_config(workspace_path)
        .await
        .unwrap();

    assert_eq!(loaded.mcp_servers.len(), 1);
    let server = &loaded.mcp_servers["new-server"];
    assert_eq!(server.command, "test-command");
    assert_eq!(server.args, vec!["--arg1", "--arg2"]);
    assert_eq!(server.env.get("API_KEY"), Some(&"secret".to_string()));
    assert!(!server.disabled);
    assert!(server.auto_approve.contains(&"safe_tool".to_string()));
}

// ============ 工具名称格式测试 ============

/// 场景：Agent 需要调用 MCP 工具
/// 期望：工具名称格式正确
#[test]
fn test_mcp_tool_naming_convention() {
    // 标准格式: mcp_{server_name}__{tool_name}
    let examples = vec![
        ("mcp_filesystem__read_file", "filesystem", "read_file"),
        ("mcp_brave-search__web_search", "brave-search", "web_search"),
        ("mcp_postgres__execute_query", "postgres", "execute_query"),
        ("mcp_my_server__my_tool_name", "my_server", "my_tool_name"),
    ];

    for (full_name, expected_server, expected_tool) in examples {
        let name_without_prefix = full_name.strip_prefix("mcp_").unwrap();
        let parts: Vec<&str> = name_without_prefix.splitn(2, "__").collect();

        assert_eq!(parts.len(), 2, "Failed for: {}", full_name);
        assert_eq!(
            parts[0], expected_server,
            "Server mismatch for: {}",
            full_name
        );
        assert_eq!(parts[1], expected_tool, "Tool mismatch for: {}", full_name);
    }
}

/// 场景：区分本地工具和 MCP 工具
/// 期望：通过前缀正确区分
#[test]
fn test_distinguish_local_and_mcp_tools() {
    let local_tools = vec![
        "read_note",
        "edit_note",
        "create_note",
        "search_notes",
        "list_notes",
    ];

    let mcp_tools = vec![
        "mcp_filesystem__read_file",
        "mcp_filesystem__write_file",
        "mcp_brave-search__search",
    ];

    for tool in local_tools {
        assert!(
            !tool.starts_with("mcp_"),
            "Local tool should not have mcp_ prefix: {}",
            tool
        );
    }

    for tool in mcp_tools {
        assert!(
            tool.starts_with("mcp_"),
            "MCP tool should have mcp_ prefix: {}",
            tool
        );
    }
}
