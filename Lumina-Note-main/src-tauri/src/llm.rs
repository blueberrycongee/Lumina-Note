use futures_util::StreamExt;
/**
 * LLM HTTP Client
 * 使用 Rust reqwest 库发送 HTTP 请求，避免 WebView 的 HTTP/2 协议问题
 * 支持流式传输 (SSE)
 */
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMRequest {
    pub url: String,
    pub method: String, // "POST" | "GET"
    pub headers: HashMap<String, String>,
    pub body: Option<String>, // JSON string
    pub timeout_secs: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMResponse {
    pub status: u16,
    pub body: String,
    pub error: Option<String>,
}

/// 发送 LLM API 请求（带重试机制）
#[tauri::command]
pub async fn llm_fetch(request: LLMRequest) -> Result<LLMResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(
            request.timeout_secs.unwrap_or(120),
        ))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let max_retries = 2;
    let mut last_error = String::new();

    for attempt in 0..=max_retries {
        if attempt > 0 {
            // 重试前等待 1 秒
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            eprintln!(
                "[LLM] Retry attempt {} after error: {}",
                attempt, last_error
            );
        }

        let mut req_builder = match request.method.to_uppercase().as_str() {
            "POST" => client.post(&request.url),
            "GET" => client.get(&request.url),
            _ => return Err(format!("Unsupported HTTP method: {}", request.method)),
        };

        // 添加 headers
        for (key, value) in &request.headers {
            req_builder = req_builder.header(key, value);
        }

        // 添加 body
        if let Some(ref body) = request.body {
            req_builder = req_builder.body(body.clone());
        }

        // 发送请求
        match req_builder.send().await {
            Ok(response) => {
                let status = response.status().as_u16();
                match response.text().await {
                    Ok(body) => {
                        return Ok(LLMResponse {
                            status,
                            body,
                            error: None,
                        });
                    }
                    Err(e) => {
                        last_error = format!("Failed to read response body: {}", e);
                        // 继续重试
                    }
                }
            }
            Err(e) => {
                last_error = format!("Request failed: {}", e);
                // 继续重试
            }
        }
    }

    // 所有重试都失败了
    Ok(LLMResponse {
        status: 0,
        body: String::new(),
        error: Some(last_error),
    })
}

/// 流式 SSE 事件
#[derive(Debug, Clone, Serialize)]
pub struct StreamChunk {
    pub request_id: String,
    pub chunk: String, // SSE data 内容
    pub done: bool,    // 是否完成
    pub error: Option<String>,
}

/// 发送流式 LLM API 请求
#[tauri::command]
pub async fn llm_fetch_stream(
    app: AppHandle,
    request_id: String,
    request: LLMRequest,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(
            request.timeout_secs.unwrap_or(300),
        ))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut req_builder = match request.method.to_uppercase().as_str() {
        "POST" => client.post(&request.url),
        "GET" => client.get(&request.url),
        _ => return Err(format!("Unsupported HTTP method: {}", request.method)),
    };

    // 添加 headers
    for (key, value) in &request.headers {
        req_builder = req_builder.header(key, value);
    }

    // 添加 body
    if let Some(ref body) = request.body {
        req_builder = req_builder.body(body.clone());
    }

    // 发送请求
    let response = match req_builder.send().await {
        Ok(r) => r,
        Err(e) => {
            let _ = app.emit(
                "llm-stream-chunk",
                StreamChunk {
                    request_id,
                    chunk: String::new(),
                    done: true,
                    error: Some(format!("Request failed: {}", e)),
                },
            );
            return Ok(());
        }
    };

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        let _ = app.emit(
            "llm-stream-chunk",
            StreamChunk {
                request_id,
                chunk: String::new(),
                done: true,
                error: Some(format!("HTTP {} error: {}", status, body)),
            },
        );
        return Ok(());
    }

    // 流式读取响应体
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                buffer.push_str(&text);

                // 按行处理 SSE 数据
                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();

                    // 跳过空行和 keep-alive 注释
                    if line.is_empty() || line.starts_with(": keep-alive") || line == ":" {
                        continue;
                    }

                    // 解析 SSE data 行
                    if line.starts_with("data: ") {
                        let data = &line[6..];

                        // [DONE] 表示流结束
                        if data == "[DONE]" {
                            let _ = app.emit(
                                "llm-stream-chunk",
                                StreamChunk {
                                    request_id: request_id.clone(),
                                    chunk: String::new(),
                                    done: true,
                                    error: None,
                                },
                            );
                            return Ok(());
                        }

                        // 发送数据块
                        let _ = app.emit(
                            "llm-stream-chunk",
                            StreamChunk {
                                request_id: request_id.clone(),
                                chunk: data.to_string(),
                                done: false,
                                error: None,
                            },
                        );
                    }
                }
            }
            Err(e) => {
                let _ = app.emit(
                    "llm-stream-chunk",
                    StreamChunk {
                        request_id,
                        chunk: String::new(),
                        done: true,
                        error: Some(format!("Stream read error: {}", e)),
                    },
                );
                return Ok(());
            }
        }
    }

    // 流正常结束
    let _ = app.emit(
        "llm-stream-chunk",
        StreamChunk {
            request_id,
            chunk: String::new(),
            done: true,
            error: None,
        },
    );

    Ok(())
}

/// 追加调试日志到文件
#[tauri::command]
pub async fn append_debug_log(app: AppHandle, content: String) -> Result<(), String> {
    use std::fs::{create_dir_all, OpenOptions};
    use std::io::Write;

    // 获取应用目录
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;

    let log_dir = app_dir.join("debug-logs");
    create_dir_all(&log_dir).map_err(|e| format!("Failed to create log dir: {}", e))?;

    // 使用日期作为文件名
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let log_file = log_dir.join(format!("{}.log", today));

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write log: {}", e))?;

    Ok(())
}

/// 获取调试日志目录路径
#[tauri::command]
pub fn get_debug_log_path(app: AppHandle) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;

    let log_dir = app_dir.join("debug-logs");
    Ok(log_dir.to_string_lossy().to_string())
}
