use crate::forge_runtime::permissions::request_permission;
use crate::forge_runtime::tools::shared::{
    ensure_external_directory_permission, parse_tool_input, permission_path, resolve_path,
};
use crate::forge_runtime::tools::ToolEnvironment;
use forge::runtime::error::{GraphError, GraphResult};
use forge::runtime::tool::{ToolCall, ToolContext, ToolDefinition, ToolOutput, ToolRegistry};
use serde::Deserialize;
use serde_json::{json, Map};
use std::io;
use std::sync::Arc;

const DEFAULT_READ_LIMIT: usize = 2000;
const MAX_LINE_LENGTH: usize = 2000;
const MAX_BYTES: usize = 50 * 1024;
const PREVIEW_LINES: usize = 20;

#[derive(Deserialize)]
struct ReadInput {
    #[serde(rename = "filePath")]
    file_path: String,
    offset: Option<usize>,
    limit: Option<usize>,
}

pub fn register(registry: &mut ToolRegistry, env: ToolEnvironment) {
    let description = include_str!("descriptions/read.txt").to_string();
    let definition = ToolDefinition::new("read", description).with_input_schema(json!({
        "type": "object",
        "properties": {
            "filePath": { "type": "string" },
            "offset": { "type": "number" },
            "limit": { "type": "number" }
        },
        "required": ["filePath"]
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
    let input: ReadInput = parse_tool_input(&call)?;
    let target = resolve_path(&env.workspace_root, &input.file_path);

    ensure_external_directory_permission(
        &ctx,
        &env.permissions,
        &env.workspace_root,
        &target,
        "file",
    )?;

    let pattern = permission_path(&env.workspace_root, &target);
    let mut metadata = Map::new();
    metadata.insert("path".to_string(), json!(target.display().to_string()));

    request_permission(
        &ctx,
        &env.permissions,
        "read",
        &pattern,
        metadata,
        vec!["*".to_string()],
    )?;

    let bytes = match tokio::fs::read(&target).await {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == io::ErrorKind::NotFound => {
            return Err(GraphError::ExecutionError {
                node: format!("tool:{}", call.tool),
                message: missing_file_message(&target).await,
            });
        }
        Err(err) => {
            return Err(GraphError::ExecutionError {
                node: format!("tool:{}", call.tool),
                message: format!("Failed to read file: {}", err),
            });
        }
    };

    if bytes.is_empty() {
        return Ok(
            ToolOutput::text("[system reminder] file exists but is empty")
                .with_mime_type("text/plain")
                .with_schema("tool.read.v1")
                .with_attribute("truncated", json!(false)),
        );
    }

    let content = String::from_utf8(bytes).map_err(|_| GraphError::ExecutionError {
        node: format!("tool:{}", call.tool),
        message: format!("Cannot read binary file: {}", target.display()),
    })?;

    let lines: Vec<&str> = content.split('\n').collect();
    let total_lines = lines.len();
    let offset = input.offset.unwrap_or(0);
    let limit = input.limit.unwrap_or(DEFAULT_READ_LIMIT);
    let start = offset.min(total_lines);
    let end = (start + limit).min(total_lines);

    let mut raw_lines = Vec::new();
    let mut bytes = 0usize;
    let mut truncated_by_bytes = false;

    for line in lines.iter().take(end).skip(start) {
        let mut text = (*line).to_string();
        if text.len() > MAX_LINE_LENGTH {
            text.truncate(MAX_LINE_LENGTH);
            text.push_str("...");
        }

        let size = text.as_bytes().len() + if raw_lines.is_empty() { 0 } else { 1 };
        if bytes + size > MAX_BYTES {
            truncated_by_bytes = true;
            break;
        }
        raw_lines.push(text);
        bytes += size;
    }

    let numbered: Vec<String> = raw_lines
        .iter()
        .enumerate()
        .map(|(idx, line)| format!("{:0>5}| {}", idx + start + 1, line))
        .collect();

    let last_read_line = start + raw_lines.len();
    let has_more_lines = total_lines > last_read_line;
    let truncated = has_more_lines || truncated_by_bytes;

    let mut output = String::from("<file>\n");
    output.push_str(&numbered.join("\n"));

    if truncated_by_bytes {
        output.push_str(&format!(
            "\n\n(Output truncated at {} bytes. Use 'offset' parameter to read beyond line {})",
            MAX_BYTES, last_read_line
        ));
    } else if has_more_lines {
        output.push_str(&format!(
            "\n\n(File has more lines. Use 'offset' parameter to read beyond line {})",
            last_read_line
        ));
    } else {
        output.push_str(&format!("\n\n(End of file - total {} lines)", total_lines));
    }
    output.push_str("\n</file>");

    let preview = raw_lines
        .iter()
        .take(PREVIEW_LINES)
        .cloned()
        .collect::<Vec<_>>()
        .join("\n");

    Ok(ToolOutput::text(output)
        .with_mime_type("text/plain")
        .with_schema("tool.read.v1")
        .with_attribute("preview", json!(preview))
        .with_attribute("truncated", json!(truncated))
        .with_attribute("total_lines", json!(total_lines))
        .with_attribute("offset", json!(offset))
        .with_attribute("limit", json!(limit)))
}

async fn missing_file_message(path: &std::path::Path) -> String {
    let dir = path.parent().unwrap_or(path);
    let base = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");

    if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
        let mut suggestions = Vec::new();
        while let Ok(Some(entry)) = entries.next_entry().await {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.to_lowercase().contains(&base.to_lowercase())
                || base.to_lowercase().contains(&name.to_lowercase())
            {
                suggestions.push(entry.path().display().to_string());
            }
            if suggestions.len() >= 3 {
                break;
            }
        }

        if !suggestions.is_empty() {
            return format!(
                "File not found: {}\n\nDid you mean one of these?\n{}",
                path.display(),
                suggestions.join("\n")
            );
        }
    }

    format!("File not found: {}", path.display())
}
