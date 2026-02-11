//! LLM 客户端封装
//!
//! 封装 LLM API 调用，支持多种提供商
//!
//! ## SSE 稳定性增强
//! - 心跳机制：定期发送心跳事件，检测连接状态
//! - 指数退避重试：网络错误时自动重试
//! - 超时检测：检测流式响应假死

use crate::agent::types::*;
use crate::mobile_gateway::emit_agent_event;
use futures_util::StreamExt;
use reqwest::header::HeaderMap;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tokio::time::interval;

const STREAM_MAX_RETRIES: u32 = 3;
const STREAM_RETRY_BASE_DELAY_MS: u64 = 1_000;
const STREAM_RETRY_MAX_DELAY_MS: u64 = 30_000;
const STREAM_RETRY_JITTER_MS: u64 = 500;

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
    pub tool_calls: Option<Vec<ToolCall>>, // FC 模式下直接返回解析后的工具调用
    pub prompt_tokens: usize,
    pub completion_tokens: usize,
    pub total_tokens: usize,
}

#[derive(Default)]
struct StreamToolCall {
    id: Option<String>,
    name: String,
    args: String,
}

#[derive(Debug, Clone)]
struct StreamRequestError {
    message: String,
    retryable: bool,
    retry_after_ms: Option<u64>,
}

impl StreamRequestError {
    fn retryable(message: impl Into<String>, retry_after_ms: Option<u64>) -> Self {
        Self {
            message: message.into(),
            retryable: true,
            retry_after_ms,
        }
    }

    fn fatal(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            retryable: false,
            retry_after_ms: None,
        }
    }
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
        let base = self
            .config
            .base_url
            .clone()
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
            "zai" => "https://open.bigmodel.cn/api/paas/v4".to_string(),
            "groq" => "https://api.groq.com/openai/v1".to_string(),
            _ => "https://api.openai.com/v1".to_string(),
        }
    }

    /// 判断当前 provider 是否支持 Function Calling
    pub fn supports_fc(&self) -> bool {
        match self.config.provider.as_str() {
            "openai" | "anthropic" | "deepseek" | "moonshot" | "zai" | "gemini" | "groq"
            | "openrouter" => true,
            "ollama" => false, // 本地模型 FC 支持不稳定，使用 XML 模式
            _ => false,        // 未知 provider 默认不支持
        }
    }

    fn model_matches(model: &str, target: &str) -> bool {
        let normalized_model = model.trim().to_ascii_lowercase();
        let normalized_target = target.trim().to_ascii_lowercase();
        normalized_model == normalized_target
            || normalized_model.ends_with(&format!("/{}", normalized_target))
    }

    fn resolved_model(&self) -> String {
        let model = self.config.model.clone();
        if self.config.provider != "deepseek" {
            return model;
        }

        let is_deepseek_pair = Self::model_matches(&model, "deepseek-chat")
            || Self::model_matches(&model, "deepseek-reasoner");
        if !is_deepseek_pair {
            return model;
        }

        match self.config.thinking_mode {
            ThinkingMode::Thinking => "deepseek-reasoner".to_string(),
            ThinkingMode::Instant => "deepseek-chat".to_string(),
            ThinkingMode::Auto => model,
        }
    }

    fn apply_thinking_controls(&self, body: &mut Value, model: &str) {
        if self.config.provider == "moonshot"
            && Self::model_matches(model, "kimi-k2.5")
            && self.config.thinking_mode == ThinkingMode::Instant
        {
            body["thinking"] = json!({ "type": "disabled" });
        }
    }

    fn apply_moonshot_k25_constraints(&self, body: &mut Value, model: &str) {
        if self.config.provider != "moonshot"
            || (!Self::model_matches(model, "kimi-k2.5")
                && !Self::model_matches(model, "kimi-k2-5"))
        {
            return;
        }

        // Moonshot K2.5 参数约束（官方文档）：
        // - 思考开启/auto: temperature 必须 1.0
        // - 思考关闭（instant）: temperature 必须 0.6
        // - top_p 必须 0.95
        // - n 必须 1
        // - presence_penalty 必须 0.0
        // - frequency_penalty 必须 0.0
        // 任一值偏离都可能返回 400，因此在请求构建层统一强制覆盖，防止后续改动误传。
        body["temperature"] = json!(match self.config.thinking_mode {
            ThinkingMode::Instant => 0.6,
            _ => 1.0,
        });
        body["top_p"] = json!(0.95);
        body["n"] = json!(1);
        body["presence_penalty"] = json!(0.0);
        body["frequency_penalty"] = json!(0.0);

        // 如果是默认 max_tokens（4096），提升到 K2.5 默认值 32768。
        if body["max_tokens"].as_u64() == Some(4096) {
            body["max_tokens"] = json!(32768);
        }
    }

    fn fixed_temperature(provider: &str, model: &str, thinking_mode: &ThinkingMode) -> Option<f32> {
        if provider == "moonshot"
            && (Self::model_matches(model, "kimi-k2.5") || Self::model_matches(model, "kimi-k2-5"))
        {
            return Some(match thinking_mode {
                ThinkingMode::Instant => 0.6,
                _ => 1.0,
            });
        }
        None
    }

    fn recommended_temperature(provider: &str, model: &str) -> f32 {
        let normalized = model.to_ascii_lowercase();
        if normalized.contains("thinking")
            || normalized.contains("reasoner")
            || normalized.contains("r1")
            || normalized.contains("k2.5")
            || normalized.contains("k2-5")
        {
            return 1.0;
        }
        if normalized.contains("codex")
            || normalized.contains("coder")
            || normalized.contains("code")
        {
            return 0.2;
        }
        if normalized.contains("flash-lite")
            || normalized.contains("nano")
            || normalized.contains("mini")
        {
            return 0.5;
        }
        if normalized.contains("flash")
            || normalized.contains("turbo")
            || normalized.contains("haiku")
        {
            return 0.6;
        }

        if provider == "ollama" {
            return 0.6;
        }

        0.7
    }

    fn resolved_temperature(&self) -> f32 {
        let resolved_model = self.resolved_model();
        if let Some(fixed) = Self::fixed_temperature(
            &self.config.provider,
            &resolved_model,
            &self.config.thinking_mode,
        ) {
            return fixed;
        }
        let recommended = Self::recommended_temperature(&self.config.provider, &resolved_model);
        let configured = self.config.temperature;
        if configured.is_finite() {
            configured.clamp(0.0, 2.0)
        } else {
            recommended
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
                    format!("Bearer {}", self.config.api_key),
                );
            }
        }

        headers
    }

    /// 转换消息格式
    fn convert_messages(&self, messages: &[Message]) -> Vec<ChatMessage> {
        messages
            .iter()
            .map(|m| ChatMessage {
                role: match m.role {
                    MessageRole::System => "system".to_string(),
                    MessageRole::User => "user".to_string(),
                    MessageRole::Assistant => "assistant".to_string(),
                    MessageRole::Tool => "tool".to_string(),
                },
                content: m.content.clone(),
                name: m.name.clone(),
                tool_call_id: m.tool_call_id.clone(),
            })
            .collect()
    }

    /// 非流式调用（带重试机制）
    pub async fn call(
        &self,
        messages: &[Message],
        tools: Option<&[Value]>,
    ) -> Result<LlmResponse, String> {
        let url = self.get_api_url();
        let headers = self.build_headers();

        let chat_messages = self.convert_messages(messages);
        let resolved_model = self.resolved_model();
        let temperature = self.resolved_temperature();

        let mut body = json!({
            "model": resolved_model,
            "messages": chat_messages,
            "temperature": temperature,
            "max_tokens": self.config.max_tokens,
            "stream": false,
        });
        self.apply_thinking_controls(&mut body, &resolved_model);
        self.apply_moonshot_k25_constraints(&mut body, &resolved_model);

        let has_tools = tools.is_some();
        if let Some(tools) = tools {
            body["tools"] = json!(tools);
        }

        println!("[LlmClient] 📤 发送请求到: {}", url);
        println!(
            "[LlmClient] 📤 模型: {}, 消息数: {}, 工具: {}",
            resolved_model,
            chat_messages.len(),
            has_tools
        );

        // 重试机制
        let max_retries = 2;
        let mut last_error = String::new();

        for attempt in 0..=max_retries {
            if attempt > 0 {
                // 重试前等待，指数退避
                let wait_secs = 1u64 << (attempt - 1); // 1s, 2s
                println!(
                    "[LlmClient] ⏳ 重试 {} (等待 {}s)，上次错误: {}",
                    attempt, wait_secs, last_error
                );
                tokio::time::sleep(std::time::Duration::from_secs(wait_secs)).await;
            }

            let start_time = std::time::Instant::now();

            // 每次重试都重新构建请求（避免连接复用问题）
            let mut req = self.client.post(&url);
            for (key, value) in &headers {
                req = req.header(key, value);
            }
            req = req.json(&body);

            match req.send().await {
                Ok(response) => {
                    println!("[LlmClient] ✅ 收到响应，耗时: {:?}", start_time.elapsed());

                    if !response.status().is_success() {
                        let status = response.status();
                        let text = response.text().await.unwrap_or_default();
                        last_error = format!("HTTP {}: {}", status, text);

                        // 5xx 错误可以重试，4xx 错误不重试
                        if status.is_server_error() {
                            continue;
                        }
                        return Err(last_error);
                    }

                    let json: Value = match response.json().await {
                        Ok(j) => j,
                        Err(e) => {
                            last_error = format!("Failed to parse response: {}", e);
                            continue;
                        }
                    };

                    // 成功，解析响应
                    return self.parse_llm_response(json);
                }
                Err(e) => {
                    println!("[LlmClient] ❌ 请求失败: {}", e);
                    last_error = format!("Request failed: {}", e);
                    // 继续重试
                }
            }
        }

        // 所有重试都失败
        Err(last_error)
    }

    /// 解析 LLM 响应
    fn parse_llm_response(&self, json: Value) -> Result<LlmResponse, String> {
        // 提取 token 使用量
        let usage = &json["usage"];
        let prompt_tokens = usage["prompt_tokens"].as_u64().unwrap_or(0) as usize;
        let completion_tokens = usage["completion_tokens"].as_u64().unwrap_or(0) as usize;
        let total_tokens = usage["total_tokens"]
            .as_u64()
            .map(|t| t as usize)
            .unwrap_or(prompt_tokens + completion_tokens);

        let message = &json["choices"][0]["message"];

        let reasoning = Self::extract_reasoning_content(message);

        // 检查是否有 tool_calls（Function Call）
        if let Some(fc_tool_calls) = message.get("tool_calls").and_then(|v| v.as_array()) {
            if self.supports_fc() {
                // FC 模式：直接解析 JSON 返回结构化工具调用
                let mut parsed_calls = Vec::new();
                for (idx, tc) in fc_tool_calls.iter().enumerate() {
                    let name = tc["function"]["name"].as_str().unwrap_or("").to_string();
                    let args_str = tc["function"]["arguments"].as_str().unwrap_or("{}");

                    // 解析参数 JSON
                    let params: HashMap<String, Value> =
                        serde_json::from_str(args_str).unwrap_or_default();

                    parsed_calls.push(ToolCall {
                        id: format!("call_{}", idx),
                        name,
                        params,
                    });
                }

                // 文本内容（如果有）
                let content = message["content"].as_str().unwrap_or("").to_string();
                let content = Self::attach_reasoning_block(reasoning.as_deref(), &content);

                return Ok(LlmResponse {
                    content,
                    tool_calls: Some(parsed_calls),
                    prompt_tokens,
                    completion_tokens,
                    total_tokens,
                });
            } else {
                // XML 模式（Ollama 等不支持 FC 的 provider）：转换为 XML 格式
                let mut xml_output = String::new();
                for tc in fc_tool_calls {
                    let name = tc["function"]["name"].as_str().unwrap_or("");
                    let args_str = tc["function"]["arguments"].as_str().unwrap_or("{}");

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
                    tool_calls: None,
                    prompt_tokens,
                    completion_tokens,
                    total_tokens,
                });
            }
        }

        // 提取文本内容
        let content = message["content"].as_str().unwrap_or("").to_string();
        let content = Self::attach_reasoning_block(reasoning.as_deref(), &content);

        Ok(LlmResponse {
            content,
            tool_calls: None,
            prompt_tokens,
            completion_tokens,
            total_tokens,
        })
    }

    /// 流式调用（带 delta 回调）
    pub async fn call_stream_with_delta<F>(
        &self,
        app: Option<AppHandle>,
        request_id: &str,
        messages: &[Message],
        tools: Option<&[Value]>,
        mut on_delta: F,
    ) -> Result<LlmResponse, String>
    where
        F: FnMut(&str) + Send,
    {
        if let Some(app) = &app {
            let start_timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            emit_agent_event(
                app,
                AgentEvent::LlmRequestStart {
                    request_id: request_id.to_string(),
                    timestamp: start_timestamp,
                },
            );
        }

        let result = self
            .call_stream_with_delta_retry(app.clone(), request_id, messages, tools, &mut on_delta)
            .await;

        if let Some(app) = &app {
            emit_agent_event(
                app,
                AgentEvent::LlmRequestEnd {
                    request_id: request_id.to_string(),
                },
            );
        }

        result
    }

    async fn call_stream_with_delta_retry<F>(
        &self,
        app: Option<AppHandle>,
        request_id: &str,
        messages: &[Message],
        tools: Option<&[Value]>,
        on_delta: &mut F,
    ) -> Result<LlmResponse, String>
    where
        F: FnMut(&str) + Send,
    {
        let mut last_error = StreamRequestError::fatal("unknown stream error");

        for attempt in 0..=STREAM_MAX_RETRIES {
            match self
                .call_stream_inner_with_delta(app.clone(), request_id, messages, tools, on_delta)
                .await
            {
                Ok(response) => return Ok(response),
                Err(e) => {
                    last_error = e.clone();
                    if !e.retryable || attempt >= STREAM_MAX_RETRIES {
                        return Err(e.message);
                    }
                    let retry_attempt = attempt + 1;
                    let delay_ms = Self::retry_delay_ms(retry_attempt, e.retry_after_ms);
                    let next_retry_at = Self::current_timestamp_ms() + delay_ms;

                    println!(
                        "[LlmClient] stream retry {}/{} (wait {}ms), last error: {}",
                        retry_attempt, STREAM_MAX_RETRIES, delay_ms, e.message
                    );

                    if let Some(app) = &app {
                        emit_agent_event(
                            app,
                            AgentEvent::LlmRetryScheduled {
                                request_id: request_id.to_string(),
                                attempt: retry_attempt,
                                max_retries: STREAM_MAX_RETRIES,
                                delay_ms,
                                reason: Self::retry_reason(&e.message),
                                next_retry_at,
                            },
                        );
                    }

                    tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                }
            }
        }

        Err(format!(
            "streaming failed after {} retries: {}",
            STREAM_MAX_RETRIES, last_error.message
        ))
    }

    async fn call_stream_inner_with_delta<F>(
        &self,
        app: Option<AppHandle>,
        _request_id: &str,
        messages: &[Message],
        tools: Option<&[Value]>,
        on_delta: &mut F,
    ) -> Result<LlmResponse, StreamRequestError>
    where
        F: FnMut(&str) + Send,
    {
        let url = self.get_api_url();
        let headers = self.build_headers();

        let chat_messages = self.convert_messages(messages);
        let resolved_model = self.resolved_model();
        let temperature = self.resolved_temperature();

        let mut body = json!({
            "model": resolved_model,
            "messages": chat_messages,
            "temperature": temperature,
            "max_tokens": self.config.max_tokens,
            "stream": true,
        });
        self.apply_thinking_controls(&mut body, &resolved_model);
        self.apply_moonshot_k25_constraints(&mut body, &resolved_model);

        if let Some(tools) = tools {
            body["tools"] = json!(tools);
        }

        let mut req = self.client.post(&url);
        for (key, value) in headers {
            req = req.header(&key, &value);
        }
        req = req.json(&body);

        let response = req
            .send()
            .await
            .map_err(|e| Self::to_reqwest_error("Request failed", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let headers = response.headers().clone();
            let text = response.text().await.unwrap_or_default();
            return Err(Self::to_http_error(status, &text, &headers));
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut reasoning_content = String::new();
        let mut full_content = String::new();
        let mut tool_calls: Vec<StreamToolCall> = Vec::new();
        let mut prompt_tokens = 0usize;
        let mut completion_tokens = 0usize;
        let mut total_tokens = 0usize;

        let heartbeat_interval = Duration::from_secs(15);
        let stream_timeout = Duration::from_secs(60);
        let mut last_data_time = Instant::now();
        let mut heartbeat_timer = interval(heartbeat_interval);

        loop {
            tokio::select! {
                chunk_result = stream.next() => {
                    match chunk_result {
                        Some(Ok(bytes)) => {
                            last_data_time = Instant::now();
                            let text = String::from_utf8_lossy(&bytes);
                            buffer.push_str(&text);

                            while let Some(newline_pos) = buffer.find('\n') {
                                let line = buffer[..newline_pos].trim().to_string();
                                buffer = buffer[newline_pos + 1..].to_string();

                                if line.is_empty() || line.starts_with(": ") {
                                    continue;
                                }

                                if line.starts_with("data: ") {
                                    let data = &line[6..];

                                    if data == "[DONE]" {
                                        return Ok(Self::build_stream_response(
                                            reasoning_content,
                                            full_content,
                                            tool_calls,
                                            prompt_tokens,
                                            completion_tokens,
                                            total_tokens,
                                        ));
                                    }

                                    if let Ok(json) = serde_json::from_str::<Value>(data) {
                                        if let Some(error) = json.get("error") {
                                            return Err(Self::to_api_error(error));
                                        }

                                        if let Some(usage) = json.get("usage") {
                                            prompt_tokens = usage["prompt_tokens"].as_u64().unwrap_or(prompt_tokens as u64) as usize;
                                            completion_tokens = usage["completion_tokens"].as_u64().unwrap_or(completion_tokens as u64) as usize;
                                            total_tokens = usage["total_tokens"].as_u64().unwrap_or(total_tokens as u64) as usize;
                                        }

                                        let delta = &json["choices"][0]["delta"];

                                        if let Some(reasoning) = Self::extract_reasoning_content(delta) {
                                            reasoning_content.push_str(reasoning.as_str());
                                        }

                                        if let Some(tc_array) = delta.get("tool_calls").and_then(|v| v.as_array()) {
                                            for tc in tc_array {
                                                let idx = tc["index"].as_u64().unwrap_or(0) as usize;
                                                while tool_calls.len() <= idx {
                                                    tool_calls.push(StreamToolCall::default());
                                                }

                                                if let Some(id) = tc["id"].as_str() {
                                                    tool_calls[idx].id = Some(id.to_string());
                                                }
                                                if let Some(name) = tc["function"]["name"].as_str() {
                                                    tool_calls[idx].name.push_str(name);
                                                }
                                                if let Some(args) = tc["function"]["arguments"].as_str() {
                                                    tool_calls[idx].args.push_str(args);
                                                }
                                            }
                                        }

                                        if let Some(content) = delta["content"].as_str() {
                                            if content.is_empty() {
                                                continue;
                                            }
                                            full_content.push_str(content);
                                            on_delta(content);
                                        }
                                    }
                                }
                            }
                        }
                        Some(Err(e)) => {
                            return Err(Self::to_reqwest_error("Stream error", e));
                        }
                        None => {
                            return Ok(Self::build_stream_response(
                                reasoning_content,
                                full_content,
                                tool_calls,
                                prompt_tokens,
                                completion_tokens,
                                total_tokens,
                            ));
                        }
                    }
                }

                _ = heartbeat_timer.tick() => {
                    if let Some(app) = &app {
                        let timestamp = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;
                        emit_agent_event(app, AgentEvent::Heartbeat { timestamp });
                    }

                    if last_data_time.elapsed() > stream_timeout {
                        return Err(StreamRequestError::retryable(
                            format!(
                            "Stream timeout: no data for {} seconds",
                            stream_timeout.as_secs()
                        ),
                            None,
                        ));
                    }
                }
            }
        }
    }

    fn current_timestamp_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }

    fn retry_reason(message: &str) -> String {
        let trimmed = message.lines().next().unwrap_or(message).trim();
        if trimmed.chars().count() <= 160 {
            return trimmed.to_string();
        }
        let mut result = String::new();
        for ch in trimmed.chars().take(157) {
            result.push(ch);
        }
        result.push_str("...");
        result
    }

    fn retry_delay_ms(attempt: u32, retry_after_ms: Option<u64>) -> u64 {
        if let Some(ms) = retry_after_ms {
            if ms > 0 {
                return ms.min(STREAM_RETRY_MAX_DELAY_MS.saturating_mul(20));
            }
        }

        let exponent = attempt.saturating_sub(1);
        let backoff = STREAM_RETRY_BASE_DELAY_MS
            .saturating_mul(2_u64.saturating_pow(exponent))
            .min(STREAM_RETRY_MAX_DELAY_MS);
        let jitter = rand::random::<u64>() % STREAM_RETRY_JITTER_MS;
        backoff.saturating_add(jitter)
    }

    fn parse_retry_after_ms(headers: &HeaderMap) -> Option<u64> {
        if let Some(value) = headers.get("retry-after-ms").and_then(|v| v.to_str().ok()) {
            if let Ok(parsed) = value.trim().parse::<f64>() {
                if parsed.is_finite() && parsed > 0.0 {
                    return Some(parsed.ceil() as u64);
                }
            }
        }

        if let Some(value) = headers.get("retry-after").and_then(|v| v.to_str().ok()) {
            let raw = value.trim();
            if let Ok(seconds) = raw.parse::<f64>() {
                if seconds.is_finite() && seconds > 0.0 {
                    return Some((seconds * 1000.0).ceil() as u64);
                }
            }
            if let Ok(date) = chrono::DateTime::parse_from_rfc2822(raw) {
                let target = date.timestamp_millis();
                let now = Self::current_timestamp_ms() as i64;
                if target > now {
                    return Some((target - now) as u64);
                }
            }
        }

        None
    }

    fn is_retryable_http_status(status: StatusCode) -> bool {
        matches!(
            status,
            StatusCode::REQUEST_TIMEOUT
                | StatusCode::CONFLICT
                | StatusCode::TOO_EARLY
                | StatusCode::TOO_MANY_REQUESTS
                | StatusCode::INTERNAL_SERVER_ERROR
                | StatusCode::BAD_GATEWAY
                | StatusCode::SERVICE_UNAVAILABLE
                | StatusCode::GATEWAY_TIMEOUT
        )
    }

    fn to_http_error(status: StatusCode, body: &str, headers: &HeaderMap) -> StreamRequestError {
        let message = format!("HTTP {}: {}", status, body);
        if Self::is_retryable_http_status(status) {
            return StreamRequestError::retryable(message, Self::parse_retry_after_ms(headers));
        }
        StreamRequestError::fatal(message)
    }

    fn to_reqwest_error(prefix: &str, error: reqwest::Error) -> StreamRequestError {
        let message = format!("{}: {}", prefix, error);
        if let Some(status) = error.status() {
            if Self::is_retryable_http_status(status) {
                return StreamRequestError::retryable(message, None);
            }
        }

        if error.is_timeout() || error.is_connect() || error.is_request() || error.is_body() {
            return StreamRequestError::retryable(message, None);
        }

        StreamRequestError::fatal(message)
    }

    fn to_api_error(error: &Value) -> StreamRequestError {
        let message = format!("API error: {}", error);
        let normalized = error.to_string().to_lowercase();
        let retryable = normalized.contains("too_many_requests")
            || normalized.contains("rate_limit")
            || normalized.contains("overloaded")
            || normalized.contains("resource_exhausted")
            || normalized.contains("temporar")
            || normalized.contains("unavailable");
        if retryable {
            return StreamRequestError::retryable(message, None);
        }
        StreamRequestError::fatal(message)
    }

    fn build_stream_response(
        reasoning_content: String,
        full_content: String,
        tool_calls: Vec<StreamToolCall>,
        prompt_tokens: usize,
        completion_tokens: usize,
        total_tokens: usize,
    ) -> LlmResponse {
        let parsed_calls = Self::parse_stream_tool_calls(tool_calls);
        let total_tokens = if total_tokens == 0 {
            prompt_tokens + completion_tokens
        } else {
            total_tokens
        };

        LlmResponse {
            content: Self::attach_reasoning_block(Some(reasoning_content.as_str()), &full_content),
            tool_calls: if parsed_calls.is_empty() {
                None
            } else {
                Some(parsed_calls)
            },
            prompt_tokens,
            completion_tokens,
            total_tokens,
        }
    }

    fn parse_stream_tool_calls(tool_calls: Vec<StreamToolCall>) -> Vec<ToolCall> {
        tool_calls
            .into_iter()
            .enumerate()
            .filter_map(|(idx, call)| {
                if call.name.is_empty() {
                    return None;
                }
                let params =
                    serde_json::from_str::<HashMap<String, Value>>(&call.args).unwrap_or_default();
                let id = call.id.unwrap_or_else(|| format!("call_{}", idx));
                Some(ToolCall {
                    id,
                    name: call.name,
                    params,
                })
            })
            .collect()
    }

    /// 统一提取 reasoning 字段（不同 provider 字段名不同）。
    fn extract_reasoning_content(message: &Value) -> Option<String> {
        message
            .get("reasoning_content")
            .and_then(|v| v.as_str())
            .or_else(|| message.get("reasoning").and_then(|v| v.as_str()))
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    }

    /// 把 reasoning 作为 <thinking> 块附加到正文前，供前端折叠展示。
    fn attach_reasoning_block(reasoning: Option<&str>, content: &str) -> String {
        let Some(reasoning) = reasoning else {
            return content.to_string();
        };
        let trimmed_reasoning = reasoning.trim();
        if trimmed_reasoning.is_empty() {
            return content.to_string();
        }
        if content.trim().is_empty() {
            return format!("<thinking>\n{}\n</thinking>", trimmed_reasoning);
        }
        format!(
            "<thinking>\n{}\n</thinking>\n\n{}",
            trimmed_reasoning, content
        )
    }

    /// 流式调用（带心跳和超时检测）
    pub async fn call_stream(
        &self,
        app: &AppHandle,
        request_id: &str,
        messages: &[Message],
        tools: Option<&[Value]>,
        current_agent: AgentType,
    ) -> Result<String, String> {
        // 发送 LLM 请求开始事件
        let start_timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        emit_agent_event(
            app,
            AgentEvent::LlmRequestStart {
                request_id: request_id.to_string(),
                timestamp: start_timestamp,
            },
        );

        // 使用带重试的流式调用
        let result = self
            .call_stream_with_retry(app, request_id, messages, tools, current_agent)
            .await;

        // 发送 LLM 请求结束事件
        emit_agent_event(
            app,
            AgentEvent::LlmRequestEnd {
                request_id: request_id.to_string(),
            },
        );

        result
    }

    /// 流式调用（带指数退避重试）
    async fn call_stream_with_retry(
        &self,
        app: &AppHandle,
        request_id: &str,
        messages: &[Message],
        tools: Option<&[Value]>,
        current_agent: AgentType,
    ) -> Result<String, String> {
        let max_retries = 3;
        let base_delay = Duration::from_secs(1);
        let mut last_error = String::new();

        for attempt in 0..max_retries {
            if attempt > 0 {
                // 指数退避 + 随机抖动
                let delay_secs = base_delay.as_secs() * 2u64.pow(attempt as u32);
                let jitter_ms = rand::random::<u64>() % 500;
                let delay = Duration::from_secs(delay_secs) + Duration::from_millis(jitter_ms);

                println!(
                    "[LlmClient] ⏳ 流式调用重试 {} (等待 {:?})，上次错误: {}",
                    attempt, delay, last_error
                );
                tokio::time::sleep(delay).await;
            }

            match self
                .call_stream_inner(app, request_id, messages, tools, current_agent.clone())
                .await
            {
                Ok(content) => return Ok(content),
                Err(e) => {
                    last_error = e.clone();
                    // 判断是否可重试
                    if !Self::is_retryable_error(&e) {
                        return Err(e);
                    }
                    println!(
                        "[LlmClient] ❌ 流式调用失败 (attempt {}): {}",
                        attempt + 1,
                        e
                    );
                }
            }
        }

        Err(format!(
            "流式调用失败，已重试 {} 次: {}",
            max_retries, last_error
        ))
    }

    /// 判断错误是否可重试
    fn is_retryable_error(error: &str) -> bool {
        let error_lower = error.to_lowercase();
        error_lower.contains("timeout")
            || error_lower.contains("connection")
            || error_lower.contains("reset")
            || error_lower.contains("broken pipe")
            || error_lower.contains("stream error")
            || error_lower.contains("no data")
            || error.contains("5") && error.contains("HTTP") // 5xx 错误
    }

    /// 流式调用内部实现（带心跳）
    async fn call_stream_inner(
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
        let resolved_model = self.resolved_model();
        let temperature = self.resolved_temperature();

        let mut body = json!({
            "model": resolved_model,
            "messages": chat_messages,
            "temperature": temperature,
            "max_tokens": self.config.max_tokens,
            "stream": true,
        });
        self.apply_thinking_controls(&mut body, &resolved_model);
        self.apply_moonshot_k25_constraints(&mut body, &resolved_model);

        if let Some(tools) = tools {
            body["tools"] = json!(tools);
        }

        let mut req = self.client.post(&url);
        for (key, value) in headers {
            req = req.header(&key, &value);
        }
        req = req.json(&body);

        let response = req
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("HTTP {}: {}", status, text));
        }

        // 流式读取（带心跳和超时检测）
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut full_content = String::new();

        // 用于累积 tool_calls
        let mut tool_calls: Vec<(String, String)> = Vec::new(); // (name, arguments)

        // 心跳和超时配置
        let heartbeat_interval = Duration::from_secs(15);
        let stream_timeout = Duration::from_secs(60);
        let mut last_data_time = Instant::now();
        let mut heartbeat_timer = interval(heartbeat_interval);

        loop {
            tokio::select! {
                // 处理流数据
                chunk_result = stream.next() => {
                    match chunk_result {
                        Some(Ok(bytes)) => {
                            last_data_time = Instant::now();
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
                                        // 流正常结束
                                        return self.finalize_stream_result(full_content, tool_calls);
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

                                            // 发送事件到前端
                                            emit_agent_event(
                                                app,
                                                AgentEvent::MessageChunk {
                                                    content: content.to_string(),
                                                    agent: current_agent.clone(),
                                                },
                                            );
                                        }
                                    }
                                }
                            }
                        }
                        Some(Err(e)) => {
                            return Err(format!("Stream error: {}", e));
                        }
                        None => {
                            // 流结束
                            return self.finalize_stream_result(full_content, tool_calls);
                        }
                    }
                }

                // 定期发送心跳
                _ = heartbeat_timer.tick() => {
                    let timestamp = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    emit_agent_event(app, AgentEvent::Heartbeat { timestamp });

                    // 检测假死（超时无数据）
                    if last_data_time.elapsed() > stream_timeout {
                        return Err(format!("Stream timeout: no data for {} seconds", stream_timeout.as_secs()));
                    }
                }
            }
        }
    }

    /// 处理流式结果
    fn finalize_stream_result(
        &self,
        full_content: String,
        tool_calls: Vec<(String, String)>,
    ) -> Result<String, String> {
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
            println!(
                "[LLM Stream] final content length: {}, newlines: {}",
                full_content.len(),
                newline_count
            );
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
        println!(
            "[LLM] 流式调用开始，prompt 长度: {} 字符",
            prompt_chars.chars().count()
        );

        let resolved_model = self.resolved_model();
        let mut body = json!({
            "model": resolved_model,
            "messages": [{
                "role": "user",
                "content": prompt_chars
            }],
            "temperature": self.resolved_temperature(),
            "max_tokens": self.config.max_tokens,
            "stream": true,
        });
        self.apply_thinking_controls(&mut body, &resolved_model);
        self.apply_moonshot_k25_constraints(&mut body, &resolved_model);

        let mut req = self.client.post(&url);
        for (key, value) in headers {
            req = req.header(&key, &value);
        }
        req = req.json(&body);

        // 添加请求超时（大请求需要更长时间）
        let response = tokio::time::timeout(tokio::time::Duration::from_secs(120), req.send())
            .await
            .map_err(|_| "请求超时（120秒）".to_string())?
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
            #[cfg(debug_assertions)]
            let mut chunk_count = 0usize;
            #[cfg(debug_assertions)]
            let mut total_chars = 0usize;
            #[cfg(debug_assertions)]
            let start_time = std::time::Instant::now();

            // 流式读取超时：如果 60 秒没有新数据，认为流结束
            let stream_timeout = tokio::time::Duration::from_secs(60);

            loop {
                let chunk_result = tokio::time::timeout(stream_timeout, stream.next()).await;

                let chunk = match chunk_result {
                    Ok(Some(Ok(bytes))) => bytes,
                    Ok(Some(Err(err))) => {
                        #[cfg(debug_assertions)]
                        eprintln!("[LLM] 流式读取错误: {}", err);
                        #[cfg(not(debug_assertions))]
                        let _ = err;
                        break;
                    }
                    Ok(None) => {
                        // 流正常结束
                        #[cfg(debug_assertions)]
                        println!(
                            "[LLM] 流式响应结束，共 {} 个 chunk，{} 字符，耗时 {:?}",
                            chunk_count,
                            total_chars,
                            start_time.elapsed()
                        );
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
                            return; // 使用 return 而不是 break，确保退出整个 spawn
                        }

                        if let Ok(json) = serde_json::from_str::<Value>(data) {
                            // 检查是否有错误
                            if json.get("error").is_some() {
                                #[cfg(debug_assertions)]
                                if let Some(error) = json.get("error") {
                                    eprintln!("[LLM] API 返回错误: {}", error);
                                }
                                return;
                            }

                            if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                                #[cfg(debug_assertions)]
                                {
                                    chunk_count += 1;
                                    total_chars += content.chars().count();
                                }
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

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderMap, HeaderValue};

    #[test]
    fn parse_retry_after_ms_prefers_retry_after_ms_header() {
        let mut headers = HeaderMap::new();
        headers.insert("retry-after-ms", HeaderValue::from_static("2500"));
        headers.insert("retry-after", HeaderValue::from_static("10"));

        let parsed = LlmClient::parse_retry_after_ms(&headers);
        assert_eq!(parsed, Some(2500));
    }

    #[test]
    fn parse_retry_after_ms_parses_seconds() {
        let mut headers = HeaderMap::new();
        headers.insert("retry-after", HeaderValue::from_static("1.5"));

        let parsed = LlmClient::parse_retry_after_ms(&headers);
        assert_eq!(parsed, Some(1500));
    }

    #[test]
    fn parse_retry_after_ms_parses_http_date() {
        let retry_at = chrono::Utc::now() + chrono::Duration::seconds(3);
        let mut headers = HeaderMap::new();
        headers.insert(
            "retry-after",
            HeaderValue::from_str(&retry_at.to_rfc2822()).expect("valid header"),
        );

        let parsed = LlmClient::parse_retry_after_ms(&headers).expect("retry-after parsed");
        assert!((1000..=4000).contains(&parsed), "parsed={parsed}");
    }

    #[test]
    fn retry_delay_ms_respects_retry_after_cap() {
        let capped = LlmClient::retry_delay_ms(1, Some(u64::MAX));
        assert_eq!(capped, STREAM_RETRY_MAX_DELAY_MS * 20);
    }

    #[test]
    fn to_http_error_marks_retryable_status() {
        let headers = HeaderMap::new();
        let retryable =
            LlmClient::to_http_error(StatusCode::TOO_MANY_REQUESTS, "rate limited", &headers);
        assert!(retryable.retryable);

        let fatal = LlmClient::to_http_error(StatusCode::BAD_REQUEST, "bad request", &headers);
        assert!(!fatal.retryable);
    }

    #[test]
    fn retry_reason_truncates_long_error() {
        let long_message = "x".repeat(300);
        let reason = LlmClient::retry_reason(&long_message);
        assert_eq!(reason.len(), 160);
        assert!(reason.ends_with("..."));
    }
}
