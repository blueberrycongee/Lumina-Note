//! LLM 客户端封装
//! 
//! 封装 LLM API 调用，支持多种提供商

use crate::agent::types::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use futures_util::StreamExt;

/// OpenAI 格式的请求
#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<usize>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<ToolDefinition>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct ToolDefinition {
    r#type: String,
    function: FunctionDefinition,
}

#[derive(Debug, Serialize)]
struct FunctionDefinition {
    name: String,
    description: String,
    parameters: Value,
}

/// LLM 响应（包含 token 使用量）
#[derive(Debug, Clone)]
pub struct LlmResponse {
    pub content: String,
    pub prompt_tokens: usize,
    pub completion_tokens: usize,
    pub total_tokens: usize,
}

/// LLM 客户端
pub struct LlmClient {
    config: AgentConfig,
    client: reqwest::Client,
}

impl LlmClient {
    pub fn new(config: AgentConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");
        
        Self { config, client }
    }

    /// 获取 API URL
    fn get_api_url(&self) -> String {
        let base = self.config.base_url.clone()
            .unwrap_or_else(|| self.get_default_base_url());
        
        // 移除尾部斜杠
        let base = base.trim_end_matches('/');
        
        match self.config.provider.as_str() {
            "anthropic" => format!("{}/messages", base),
            _ => format!("{}/chat/completions", base),
        }
    }

    fn get_default_base_url(&self) -> String {
        match self.config.provider.as_str() {
            "anthropic" => "https://api.anthropic.com/v1".to_string(),
            "openai" => "https://api.openai.com/v1".to_string(),
            "deepseek" => "https://api.deepseek.com/v1".to_string(),
            "moonshot" => "https://api.moonshot.cn/v1".to_string(),
            "groq" => "https://api.groq.com/openai/v1".to_string(),
            _ => "https://api.openai.com/v1".to_string(),
        }
    }

    /// 构建请求头
    fn build_headers(&self) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        match self.config.provider.as_str() {
            "anthropic" => {
                headers.insert("x-api-key".to_string(), self.config.api_key.clone());
                headers.insert("anthropic-version".to_string(), "2023-06-01".to_string());
            }
            _ => {
                headers.insert(
                    "Authorization".to_string(), 
                    format!("Bearer {}", self.config.api_key)
                );
            }
        }
        
        headers
    }

    /// 转换消息格式
    fn convert_messages(&self, messages: &[Message]) -> Vec<ChatMessage> {
        messages.iter().map(|m| ChatMessage {
            role: match m.role {
                MessageRole::System => "system".to_string(),
                MessageRole::User => "user".to_string(),
                MessageRole::Assistant => "assistant".to_string(),
                MessageRole::Tool => "tool".to_string(),
            },
            content: m.content.clone(),
            name: m.name.clone(),
            tool_call_id: m.tool_call_id.clone(),
        }).collect()
    }

    /// 非流式调用
    pub async fn call(
        &self,
        messages: &[Message],
        tools: Option<&[Value]>,
    ) -> Result<LlmResponse, String> {
        let url = self.get_api_url();
        let headers = self.build_headers();
        
        let chat_messages = self.convert_messages(messages);
        
        let mut body = json!({
            "model": self.config.model,
            "messages": chat_messages,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "stream": false,
        });
        
        if let Some(tools) = tools {
            body["tools"] = json!(tools);
        }
        
        let mut req = self.client.post(&url);
        for (key, value) in headers {
            req = req.header(&key, &value);
        }
        req = req.json(&body);
        
        let response = req.send().await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("HTTP {}: {}", status, text));
        }
        
        let json: Value = response.json().await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        // 提取 token 使用量
        let usage = &json["usage"];
        let prompt_tokens = usage["prompt_tokens"].as_u64().unwrap_or(0) as usize;
        let completion_tokens = usage["completion_tokens"].as_u64().unwrap_or(0) as usize;
        let total_tokens = usage["total_tokens"].as_u64().map(|t| t as usize).unwrap_or(prompt_tokens + completion_tokens);
        
        let message = &json["choices"][0]["message"];
        
        // 检查是否有 tool_calls（Function Call）
        if let Some(tool_calls) = message.get("tool_calls").and_then(|v| v.as_array()) {
            // 将 tool_calls 转换为 XML 格式，保持与现有解析逻辑兼容
            let mut xml_output = String::new();
            for tc in tool_calls {
                let name = tc["function"]["name"].as_str().unwrap_or("");
                let args_str = tc["function"]["arguments"].as_str().unwrap_or("{}");
                
                // 解析参数 JSON
                if let Ok(args) = serde_json::from_str::<Value>(args_str) {
                    xml_output.push_str(&format!("<{}>\n", name));
                    if let Some(obj) = args.as_object() {
                        for (key, value) in obj {
                            let val_str = match value {
                                Value::String(s) => s.clone(),
                                _ => value.to_string(),
                            };
                            xml_output.push_str(&format!("<{}>{}</{}>\n", key, val_str, key));
                        }
                    }
                    xml_output.push_str(&format!("</{}>\n", name));
                }
            }
            return Ok(LlmResponse {
                content: xml_output,
                prompt_tokens,
                completion_tokens,
                total_tokens,
            });
        }
        
        // 提取文本内容
        let content = message["content"]
            .as_str()
            .unwrap_or("")
            .to_string();
        
        Ok(LlmResponse {
            content,
            prompt_tokens,
            completion_tokens,
            total_tokens,
        })
    }

    /// 流式调用
    pub async fn call_stream(
        &self,
        app: &AppHandle,
        _request_id: &str,
        messages: &[Message],
        tools: Option<&[Value]>,
        current_agent: AgentType,
    ) -> Result<String, String> {
        let url = self.get_api_url();
        let headers = self.build_headers();
        
        let chat_messages = self.convert_messages(messages);
        
        let mut body = json!({
            "model": self.config.model,
            "messages": chat_messages,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "stream": true,
        });
        
        if let Some(tools) = tools {
            body["tools"] = json!(tools);
        }
        
        let mut req = self.client.post(&url);
        for (key, value) in headers {
            req = req.header(&key, &value);
        }
        req = req.json(&body);
        
        let response = req.send().await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("HTTP {}: {}", status, text));
        }
        
        // 流式读取
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut full_content = String::new();
        
        // 用于累积 tool_calls
        let mut tool_calls: Vec<(String, String)> = Vec::new(); // (name, arguments)
        
        while let Some(chunk_result) = stream.next().await {
            let bytes = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
            let text = String::from_utf8_lossy(&bytes);
            buffer.push_str(&text);
            
            // 按行处理 SSE
            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim().to_string();
                buffer = buffer[newline_pos + 1..].to_string();
                
                if line.is_empty() || line.starts_with(": ") {
                    continue;
                }
                
                if line.starts_with("data: ") {
                    let data = &line[6..];
                    
                    if data == "[DONE]" {
                        break;
                    }
                    
                    if let Ok(json) = serde_json::from_str::<Value>(data) {
                        let delta = &json["choices"][0]["delta"];
                        
                        // 处理 tool_calls（Function Call 流式响应）
                        if let Some(tc_array) = delta.get("tool_calls").and_then(|v| v.as_array()) {
                            for tc in tc_array {
                                let idx = tc["index"].as_u64().unwrap_or(0) as usize;
                                
                                // 确保 tool_calls 数组足够大
                                while tool_calls.len() <= idx {
                                    tool_calls.push((String::new(), String::new()));
                                }
                                
                                // 累积函数名
                                if let Some(name) = tc["function"]["name"].as_str() {
                                    tool_calls[idx].0.push_str(name);
                                }
                                
                                // 累积参数
                                if let Some(args) = tc["function"]["arguments"].as_str() {
                                    tool_calls[idx].1.push_str(args);
                                }
                            }
                        }
                        
                        // 处理普通文本内容
                        if let Some(content) = delta["content"].as_str() {
                            // 跳过空内容
                            if content.is_empty() {
                                continue;
                            }
                            
                            full_content.push_str(content);
                            
                            // 调试日志 - 检查是否有换行符
                            #[cfg(debug_assertions)]
                            {
                                let has_newline = content.contains('\n');
                                if has_newline {
                                    println!("[LLM Stream] chunk with newline: {:?}", content);
                                }
                            }
                            
                            // 发送事件到前端
                            let _ = app.emit("agent-event", AgentEvent::MessageChunk {
                                content: content.to_string(),
                                agent: current_agent.clone(),
                            });
                        }
                    }
                }
            }
        }
        
        // 如果有 tool_calls，转换为 XML 格式
        if !tool_calls.is_empty() {
            let mut xml_output = String::new();
            for (name, args_str) in &tool_calls {
                if name.is_empty() {
                    continue;
                }
                
                // 解析参数 JSON
                if let Ok(args) = serde_json::from_str::<Value>(args_str) {
                    xml_output.push_str(&format!("<{}>\n", name));
                    if let Some(obj) = args.as_object() {
                        for (key, value) in obj {
                            let val_str = match value {
                                Value::String(s) => s.clone(),
                                _ => value.to_string(),
                            };
                            xml_output.push_str(&format!("<{}>{}</{}>\n", key, val_str, key));
                        }
                    }
                    xml_output.push_str(&format!("</{}>\n", name));
                }
            }
            return Ok(xml_output);
        }
        
        // 调试日志 - 检查最终内容
        #[cfg(debug_assertions)]
        {
            let newline_count = full_content.matches('\n').count();
            println!("[LLM Stream] final content length: {}, newlines: {}", full_content.len(), newline_count);
            if newline_count == 0 && full_content.len() > 100 {
                println!("[LLM Stream] WARNING: No newlines in long content!");
            }
        }
        
        Ok(full_content)
    }

    // ============ 简化接口（用于 Deep Research 等场景）============

    /// 简单的非流式调用（只传入 prompt）
    pub async fn call_simple(&self, prompt: &str) -> Result<String, String> {
        let response = self.call_simple_with_usage(prompt).await?;
        Ok(response.content)
    }

    /// 简单的非流式调用（返回完整响应，包含 token 统计）
    pub async fn call_simple_with_usage(&self, prompt: &str) -> Result<LlmResponse, String> {
        let messages = vec![Message {
            role: MessageRole::User,
            content: prompt.to_string(),
            name: None,
            tool_call_id: None,
        }];
        
        self.call(&messages, None).await
    }

    /// 简单的流式调用（只传入 prompt，通过 channel 返回）
    /// 
    /// 包含超时处理和错误日志
    pub async fn call_stream_simple(
        &self,
        prompt: &str,
    ) -> Result<tokio::sync::mpsc::Receiver<String>, String> {
        let url = self.get_api_url();
        let headers = self.build_headers();
        
        // 限制 prompt 长度，避免超过模型限制
        let prompt_chars: String = prompt.chars().take(50000).collect();
        
        #[cfg(debug_assertions)]
        println!("[LLM] 流式调用开始，prompt 长度: {} 字符", prompt_chars.chars().count());
        
        let body = json!({
            "model": self.config.model,
            "messages": [{
                "role": "user",
                "content": prompt_chars
            }],
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "stream": true,
        });
        
        let mut req = self.client.post(&url);
        for (key, value) in headers {
            req = req.header(&key, &value);
        }
        req = req.json(&body);
        
        // 添加请求超时
        let response = tokio::time::timeout(
            tokio::time::Duration::from_secs(30),
            req.send()
        ).await
            .map_err(|_| "请求超时（30秒）".to_string())?
            .map_err(|e| format!("Request failed: {}", e))?;
        
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let error_msg = format!("HTTP {}: {}", status, text);
            #[cfg(debug_assertions)]
            eprintln!("[LLM] 流式调用失败: {}", error_msg);
            return Err(error_msg);
        }
        
        #[cfg(debug_assertions)]
        println!("[LLM] 流式响应开始接收...");
        
        // 创建 channel 用于流式输出
        let (tx, rx) = tokio::sync::mpsc::channel::<String>(100);
        
        // 在后台任务中处理流
        let mut stream = response.bytes_stream();
        tokio::spawn(async move {
            let mut buffer = String::new();
            let mut chunk_count = 0usize;
            let mut total_chars = 0usize;
            let start_time = std::time::Instant::now();
            
            // 流式读取超时：如果 60 秒没有新数据，认为流结束
            let stream_timeout = tokio::time::Duration::from_secs(60);
            
            loop {
                let chunk_result = tokio::time::timeout(stream_timeout, stream.next()).await;
                
                let chunk = match chunk_result {
                    Ok(Some(Ok(bytes))) => bytes,
                    Ok(Some(Err(e))) => {
                        #[cfg(debug_assertions)]
                        eprintln!("[LLM] 流式读取错误: {}", e);
                        break;
                    }
                    Ok(None) => {
                        // 流正常结束
                        #[cfg(debug_assertions)]
                        println!("[LLM] 流式响应结束，共 {} 个 chunk，{} 字符，耗时 {:?}", 
                            chunk_count, total_chars, start_time.elapsed());
                        break;
                    }
                    Err(_) => {
                        // 超时
                        #[cfg(debug_assertions)]
                        eprintln!("[LLM] 流式读取超时（{}秒无数据）", stream_timeout.as_secs());
                        break;
                    }
                };
                
                let text = String::from_utf8_lossy(&chunk);
                buffer.push_str(&text);
                
                // 按行处理 SSE
                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();
                    
                    if line.is_empty() || line.starts_with(": ") {
                        continue;
                    }
                    
                    if line.starts_with("data: ") {
                        let data = &line[6..];
                        
                        if data == "[DONE]" {
                            #[cfg(debug_assertions)]
                            println!("[LLM] 收到 [DONE] 信号");
                            return;  // 使用 return 而不是 break，确保退出整个 spawn
                        }
                        
                        if let Ok(json) = serde_json::from_str::<Value>(data) {
                            // 检查是否有错误
                            if let Some(error) = json.get("error") {
                                #[cfg(debug_assertions)]
                                eprintln!("[LLM] API 返回错误: {}", error);
                                return;
                            }
                            
                            if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                                chunk_count += 1;
                                total_chars += content.chars().count();
                                if tx.send(content.to_string()).await.is_err() {
                                    // 接收端已关闭
                                    #[cfg(debug_assertions)]
                                    println!("[LLM] 接收端已关闭，停止发送");
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        });
        
        Ok(rx)
    }
}
