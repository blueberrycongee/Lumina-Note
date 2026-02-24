//! MCP Client 协议实现

use super::transport::StdioTransport;
use super::types::*;
use serde_json::{json, Value};

pub struct McpClient {
    transport: StdioTransport,
    server_name: String,
    tools: Vec<McpTool>,
}

impl McpClient {
    /// 连接并初始化 MCP Server
    pub async fn connect(name: &str, config: &McpServerConfig) -> Result<Self, String> {
        println!("[MCP] Connecting to server '{}'...", name);

        let transport = StdioTransport::spawn(&config.command, &config.args, &config.env).await?;

        // 初始化握手
        let init_params = json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {}
            },
            "clientInfo": {
                "name": "Lumina",
                "version": env!("CARGO_PKG_VERSION")
            }
        });

        let init_result = transport.request("initialize", Some(init_params)).await?;
        println!(
            "[MCP] Server '{}' initialized: {:?}",
            name,
            init_result.get("serverInfo")
        );

        // 发送 initialized 通知
        transport.notify("notifications/initialized", None).await?;

        let mut client = Self {
            transport,
            server_name: name.to_string(),
            tools: vec![],
        };

        // 获取工具列表
        client.refresh_tools().await?;

        Ok(client)
    }

    /// 刷新工具列表
    pub async fn refresh_tools(&mut self) -> Result<(), String> {
        let result = self.transport.request("tools/list", None).await?;

        let tools: Vec<McpTool> = result
            .get("tools")
            .and_then(|t| serde_json::from_value(t.clone()).ok())
            .unwrap_or_default();

        println!(
            "[MCP] Server '{}' has {} tools",
            self.server_name,
            tools.len()
        );
        self.tools = tools;
        Ok(())
    }

    /// 获取工具列表
    pub fn get_tools(&self) -> &[McpTool] {
        &self.tools
    }

    /// 获取 Server 名称
    pub fn server_name(&self) -> &str {
        &self.server_name
    }

    /// 调用工具
    pub async fn call_tool(
        &self,
        tool_name: &str,
        arguments: Value,
    ) -> Result<McpToolCallResponse, String> {
        let params = json!({
            "name": tool_name,
            "arguments": arguments
        });

        let result = self.transport.request("tools/call", Some(params)).await?;

        serde_json::from_value(result).map_err(|e| format!("Failed to parse tool result: {}", e))
    }

    /// 关闭连接
    pub async fn shutdown(&self) -> Result<(), String> {
        self.transport.close().await
    }

    /// 检查连接是否存活
    pub async fn is_alive(&self) -> bool {
        self.transport.is_alive().await
    }
}
