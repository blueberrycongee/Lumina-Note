//! MCP stdio 传输层

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

pub struct StdioTransport {
    child: Mutex<Child>,
    stdin: Mutex<tokio::process::ChildStdin>,
    stdout: Mutex<BufReader<tokio::process::ChildStdout>>,
    request_id: AtomicU64,
}

impl StdioTransport {
    /// 启动 MCP Server 进程
    pub async fn spawn(
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> Result<Self, String> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .envs(env)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());

        // Windows: 隐藏控制台窗口
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt as _;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn MCP server '{}': {}", command, e))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to get stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to get stdout".to_string())?;

        Ok(Self {
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            stdout: Mutex::new(BufReader::new(stdout)),
            request_id: AtomicU64::new(1),
        })
    }

    /// 发送 JSON-RPC 请求并等待响应
    pub async fn request(&self, method: &str, params: Option<Value>) -> Result<Value, String> {
        let id = self.request_id.fetch_add(1, Ordering::SeqCst);

        let request = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params.unwrap_or(json!({}))
        });

        // 发送请求
        let request_str = serde_json::to_string(&request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;

        {
            let mut stdin = self.stdin.lock().await;
            stdin
                .write_all(request_str.as_bytes())
                .await
                .map_err(|e| format!("Failed to write to stdin: {}", e))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| format!("Failed to write newline: {}", e))?;
            stdin
                .flush()
                .await
                .map_err(|e| format!("Failed to flush stdin: {}", e))?;
        }

        // 读取响应（可能需要跳过通知）
        let mut stdout = self.stdout.lock().await;
        loop {
            let mut line = String::new();
            let bytes_read = stdout
                .read_line(&mut line)
                .await
                .map_err(|e| format!("Failed to read response: {}", e))?;

            if bytes_read == 0 {
                return Err("MCP server closed connection".to_string());
            }

            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let response: Value = serde_json::from_str(line)
                .map_err(|e| format!("Failed to parse response '{}': {}", line, e))?;

            // 检查是否是我们的响应（有 id 字段）
            if response.get("id").is_some() {
                // 检查错误
                if let Some(error) = response.get("error") {
                    let message = error
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("Unknown error");
                    return Err(format!("MCP error: {}", message));
                }

                return response
                    .get("result")
                    .cloned()
                    .ok_or_else(|| "Missing result in response".to_string());
            }
            // 否则是通知，继续读取
        }
    }

    /// 发送通知（不等待响应）
    pub async fn notify(&self, method: &str, params: Option<Value>) -> Result<(), String> {
        let notification = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params.unwrap_or(json!({}))
        });

        let notification_str = serde_json::to_string(&notification)
            .map_err(|e| format!("Failed to serialize notification: {}", e))?;

        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(notification_str.as_bytes())
            .await
            .map_err(|e| format!("Failed to write notification: {}", e))?;
        stdin
            .write_all(b"\n")
            .await
            .map_err(|e| format!("Failed to write newline: {}", e))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to flush: {}", e))?;

        Ok(())
    }

    /// 关闭连接
    pub async fn close(&self) -> Result<(), String> {
        let mut child = self.child.lock().await;
        let _ = child.kill().await;
        Ok(())
    }

    /// 检查进程是否还在运行
    pub async fn is_alive(&self) -> bool {
        let mut child = self.child.lock().await;
        match child.try_wait() {
            Ok(None) => true, // 还在运行
            _ => false,       // 已退出或出错
        }
    }
}
