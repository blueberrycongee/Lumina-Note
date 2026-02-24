use crate::forge_runtime::permissions::request_permission;
use crate::forge_runtime::tools::ToolEnvironment;
use forge::runtime::error::{GraphError, GraphResult};
use forge::runtime::tool::{ToolCall, ToolContext, ToolDefinition, ToolOutput, ToolRegistry};
use html2md::parse_html;
use reqwest::header::CONTENT_TYPE;
use reqwest::StatusCode;
use scraper::Html;
use serde::Deserialize;
use serde_json::{json, Map};
use std::sync::Arc;
use std::time::Duration;

const DEFAULT_TIMEOUT_SECS: u64 = 30;
const MAX_TIMEOUT_SECS: u64 = 120;
const MAX_BYTES: usize = 5 * 1024 * 1024;

#[derive(Deserialize)]
struct FetchInput {
    url: String,
    format: String,
    timeout: Option<u64>,
}

pub fn register(registry: &mut ToolRegistry, env: ToolEnvironment) {
    let description = include_str!("descriptions/fetch.txt").to_string();
    let definition = ToolDefinition::new("fetch", description).with_input_schema(json!({
        "type": "object",
        "properties": {
            "url": { "type": "string" },
            "format": { "type": "string", "enum": ["text", "markdown", "html"] },
            "timeout": { "type": "number" }
        },
        "required": ["url", "format"]
    }));

    registry.register_with_definition(
        definition,
        Arc::new(move |call, ctx| {
            let env = env.clone();
            Box::pin(async move { handle(call, ctx, env).await })
        }),
    );
}

async fn handle(call: ToolCall, ctx: ToolContext, env: ToolEnvironment) -> GraphResult<ToolOutput> {
    let input: FetchInput = match serde_json::from_value(call.input.clone()) {
        Ok(input) => input,
        Err(err) => {
            return Ok(tool_error(format!(
                "Failed to parse fetch parameters: {}",
                err
            )))
        }
    };

    if input.url.is_empty() {
        return Ok(tool_error("URL parameter is required"));
    }

    let format = input.format.to_ascii_lowercase();
    if format != "text" && format != "markdown" && format != "html" {
        return Ok(tool_error("Format must be one of: text, markdown, html"));
    }

    if !input.url.starts_with("http://") && !input.url.starts_with("https://") {
        return Ok(tool_error("URL must start with http:// or https://"));
    }

    let timeout = input
        .timeout
        .unwrap_or(DEFAULT_TIMEOUT_SECS)
        .min(MAX_TIMEOUT_SECS);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout))
        .build()
        .map_err(|err| GraphError::ExecutionError {
            node: format!("tool:{}", call.tool),
            message: format!("Failed to create request client: {}", err),
        })?;

    let mut metadata = Map::new();
    metadata.insert("url".to_string(), json!(input.url));
    metadata.insert("format".to_string(), json!(format));
    if let Some(timeout) = input.timeout {
        metadata.insert("timeout".to_string(), json!(timeout));
    }

    request_permission(
        &ctx,
        &env.permissions,
        "fetch",
        &input.url,
        metadata,
        vec![input.url.clone()],
    )?;

    let request = client
        .get(&input.url)
        .header("User-Agent", "opencode/1.0")
        .build()
        .map_err(|err| GraphError::ExecutionError {
            node: format!("tool:{}", call.tool),
            message: format!("Failed to create request: {}", err),
        })?;

    let mut resp = client
        .execute(request)
        .await
        .map_err(|err| GraphError::ExecutionError {
            node: format!("tool:{}", call.tool),
            message: format!("Failed to fetch URL: {}", err),
        })?;

    if resp.status() != StatusCode::OK {
        return Ok(tool_error(format!(
            "Request failed with status code: {}",
            resp.status().as_u16()
        )));
    }

    let content_type = resp
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();

    let body = match read_body_limited(&mut resp).await {
        Ok(body) => body,
        Err(err) => return Ok(tool_error(format!("Failed to read response body: {}", err))),
    };

    let content = String::from_utf8_lossy(&body).to_string();

    let output = match format.as_str() {
        "text" => {
            if content_type.to_ascii_lowercase().contains("text/html") {
                match extract_text_from_html(&content) {
                    Ok(text) => text,
                    Err(err) => {
                        return Ok(tool_error(format!(
                            "Failed to extract text from HTML: {}",
                            err
                        )))
                    }
                }
            } else {
                content
            }
        }
        "markdown" => {
            if content_type.to_ascii_lowercase().contains("text/html") {
                match convert_html_to_markdown(&content) {
                    Ok(markdown) => markdown,
                    Err(err) => {
                        return Ok(tool_error(format!(
                            "Failed to convert HTML to Markdown: {}",
                            err
                        )))
                    }
                }
            } else {
                format!("```\n{}\n```", content)
            }
        }
        "html" => content,
        _ => content,
    };

    Ok(ToolOutput::text(output)
        .with_mime_type("text/plain")
        .with_schema("tool.fetch.v1")
        .with_attribute("url", json!(input.url))
        .with_attribute("format", json!(format))
        .with_attribute("content_type", json!(content_type)))
}

fn tool_error(message: impl Into<String>) -> ToolOutput {
    ToolOutput::text(message.into())
        .with_mime_type("text/plain")
        .with_schema("tool.fetch.v1")
        .with_attribute("is_error", json!(true))
}

async fn read_body_limited(resp: &mut reqwest::Response) -> Result<Vec<u8>, reqwest::Error> {
    let mut body = Vec::new();
    while let Some(chunk) = resp.chunk().await? {
        if body.len() >= MAX_BYTES {
            break;
        }
        let remaining = MAX_BYTES.saturating_sub(body.len());
        let end = remaining.min(chunk.len());
        body.extend_from_slice(&chunk[..end]);
        if end < chunk.len() {
            break;
        }
    }
    Ok(body)
}

fn extract_text_from_html(html: &str) -> Result<String, String> {
    let document = Html::parse_document(html);
    let raw = document.root_element().text().collect::<Vec<_>>().join(" ");
    let text = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    Ok(text)
}

fn convert_html_to_markdown(html: &str) -> Result<String, String> {
    Ok(parse_html(html))
}
