//! MCP Manager - 多 Server 管理
//!
//! 注意：Server 名称不应包含双下划线 `__`，因为它用于分隔 server 和 tool 名称。

use super::client::McpClient;
use super::config::load_mcp_config;
use super::types::*;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// 全局 MCP Manager 单例
static MCP_MANAGER: Lazy<Arc<RwLock<McpManager>>> =
    Lazy::new(|| Arc::new(RwLock::new(McpManager::new())));

/// MCP Client 包装，支持并发访问
type SharedClient = Arc<McpClient>;

pub struct McpManager {
    config: Option<McpConfig>,
    clients: HashMap<String, SharedClient>,
    workspace_path: Option<String>,
    /// 缓存的 autoApprove 配置，避免频繁加锁
    auto_approve_cache: HashMap<String, Vec<String>>,
}

impl McpManager {
    pub fn new() -> Self {
        Self {
            config: None,
            clients: HashMap::new(),
            workspace_path: None,
            auto_approve_cache: HashMap::new(),
        }
    }

    /// 获取全局实例
    pub fn global() -> Arc<RwLock<McpManager>> {
        MCP_MANAGER.clone()
    }

    /// 初始化（加载配置并启动 Servers）
    pub async fn init(&mut self, workspace_path: &str) -> Result<(), String> {
        println!("[MCP] Initializing with workspace: {}", workspace_path);
        self.workspace_path = Some(workspace_path.to_string());

        // 加载配置
        self.config = load_mcp_config(workspace_path).await.ok();

        if self.config.is_none() {
            println!("[MCP] No config found, skipping initialization");
            return Ok(());
        }

        // 构建 autoApprove 缓存
        self.rebuild_auto_approve_cache();

        // 启动所有已启用的 Servers
        if let Some(ref config) = self.config {
            let servers: Vec<_> = config
                .mcp_servers
                .iter()
                .filter(|(_, cfg)| !cfg.disabled)
                .map(|(name, cfg)| (name.clone(), cfg.clone()))
                .collect();

            for (name, server_config) in servers {
                if let Err(e) = self.start_server_internal(&name, &server_config).await {
                    eprintln!("[MCP] Failed to start server '{}': {}", name, e);
                }
            }
        }

        println!(
            "[MCP] Initialization complete, {} servers connected",
            self.clients.len()
        );
        Ok(())
    }

    /// 重建 autoApprove 缓存
    fn rebuild_auto_approve_cache(&mut self) {
        self.auto_approve_cache.clear();
        if let Some(ref config) = self.config {
            for (name, server_config) in &config.mcp_servers {
                self.auto_approve_cache
                    .insert(name.clone(), server_config.auto_approve.clone());
            }
        }
    }

    async fn start_server_internal(
        &mut self,
        name: &str,
        config: &McpServerConfig,
    ) -> Result<(), String> {
        let client = McpClient::connect(name, config).await?;
        println!(
            "[MCP] Server '{}' connected with {} tools",
            name,
            client.get_tools().len()
        );
        self.clients.insert(name.to_string(), Arc::new(client));
        Ok(())
    }

    /// 启动单个 Server
    pub async fn start_server(&mut self, name: &str) -> Result<(), String> {
        let config = self
            .config
            .as_ref()
            .and_then(|c| c.mcp_servers.get(name))
            .ok_or_else(|| format!("Server '{}' not found in config", name))?
            .clone();

        self.start_server_internal(name, &config).await
    }

    /// 停止单个 Server
    pub async fn stop_server(&mut self, name: &str) -> Result<(), String> {
        if let Some(client) = self.clients.remove(name) {
            client.shutdown().await?;
            println!("[MCP] Server '{}' stopped", name);
        }
        Ok(())
    }

    /// 获取所有 Server 状态
    pub fn list_servers(&self) -> Vec<McpServerStatus> {
        let mut statuses = vec![];

        if let Some(ref config) = self.config {
            for (name, server_config) in &config.mcp_servers {
                let status = if server_config.disabled {
                    McpServerStatus {
                        name: name.clone(),
                        status: ServerConnectionStatus::Disabled,
                        tools_count: 0,
                        error: None,
                    }
                } else if let Some(client) = self.clients.get(name) {
                    McpServerStatus {
                        name: name.clone(),
                        status: ServerConnectionStatus::Connected,
                        tools_count: client.get_tools().len(),
                        error: None,
                    }
                } else {
                    McpServerStatus {
                        name: name.clone(),
                        status: ServerConnectionStatus::Disconnected,
                        tools_count: 0,
                        error: None,
                    }
                };
                statuses.push(status);
            }
        }

        statuses
    }

    /// 获取所有可用工具（带 Server 名称）
    pub fn get_all_tools(&self) -> Vec<(String, McpTool)> {
        let mut all_tools = vec![];

        for (server_name, client) in &self.clients {
            for tool in client.get_tools() {
                all_tools.push((server_name.clone(), tool.clone()));
            }
        }

        all_tools
    }

    /// 获取指定 server 的 client（用于在释放锁后调用）
    /// 返回 Arc 克隆，调用者可以在释放 manager 锁后使用
    pub fn get_client(&self, server_name: &str) -> Option<SharedClient> {
        self.clients.get(server_name).cloned()
    }

    /// 调用工具（保持向后兼容）
    pub async fn call_tool(
        &self,
        server_name: &str,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<McpToolCallResponse, String> {
        let client = self
            .clients
            .get(server_name)
            .ok_or_else(|| format!("Server '{}' not connected", server_name))?;

        client.call_tool(tool_name, arguments).await
    }

    /// 检查工具是否自动批准（使用缓存，无需锁）
    pub fn is_auto_approved(&self, server_name: &str, tool_name: &str) -> bool {
        self.auto_approve_cache
            .get(server_name)
            .map(|list| list.contains(&tool_name.to_string()))
            .unwrap_or(false)
    }

    /// 重新加载配置
    pub async fn reload(&mut self) -> Result<(), String> {
        println!("[MCP] Reloading configuration...");

        // 关闭所有现有连接
        for (name, client) in self.clients.drain() {
            println!("[MCP] Stopping server '{}'", name);
            let _ = client.shutdown().await;
        }

        // 重新初始化
        if let Some(ref path) = self.workspace_path.clone() {
            self.init(path).await?;
        }

        Ok(())
    }

    /// 关闭所有连接
    pub async fn shutdown_all(&mut self) -> Result<(), String> {
        println!("[MCP] Shutting down all servers...");
        for (name, client) in self.clients.drain() {
            println!("[MCP] Stopping server '{}'", name);
            let _ = client.shutdown().await;
        }
        Ok(())
    }

    /// 检查是否已初始化
    pub fn is_initialized(&self) -> bool {
        self.workspace_path.is_some()
    }

    /// 获取工作区路径
    pub fn workspace_path(&self) -> Option<&str> {
        self.workspace_path.as_deref()
    }
}

impl Default for McpManager {
    fn default() -> Self {
        Self::new()
    }
}
