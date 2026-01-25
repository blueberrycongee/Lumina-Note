use crate::forge_runtime::permissions::request_permission;
use crate::forge_runtime::tools::shared::{
    ensure_external_directory_permission, parse_tool_input, resolve_path,
};
use crate::forge_runtime::tools::ToolEnvironment;
use forge::runtime::error::{GraphError, GraphResult};
use forge::runtime::tool::{ToolCall, ToolContext, ToolDefinition, ToolOutput, ToolRegistry};
use globset::{Glob, GlobSetBuilder};
use regex::Regex;
use serde::Deserialize;
use serde_json::{json, Map};
use std::sync::Arc;

const MAX_LINE_LENGTH: usize = 2000;
const LIMIT: usize = 100;

#[derive(Deserialize)]
struct GrepInput {
    pattern: String,
    path: Option<String>,
    include: Option<String>,
}

#[derive(Clone)]
struct MatchLine {
    path: String,
    mod_time: u64,
    line_num: usize,
    line_text: String,
}

pub fn register(registry: &mut ToolRegistry, env: ToolEnvironment) {
    let description = include_str!("descriptions/grep.txt").to_string();
    let definition = ToolDefinition::new("grep", description).with_input_schema(json!({
        "type": "object",
        "properties": {
            "pattern": { "type": "string" },
            "path": { "type": "string" },
            "include": { "type": "string" }
        },
        "required": ["pattern"]
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
    let input: GrepInput = parse_tool_input(&call)?;
    let search_root = input
        .path
        .as_deref()
        .map(|path| resolve_path(&env.workspace_root, path))
        .unwrap_or_else(|| env.workspace_root.clone());

    ensure_external_directory_permission(
        &ctx,
        &env.permissions,
        &env.workspace_root,
        &search_root,
        "directory",
    )?;

    let mut metadata = Map::new();
    metadata.insert("pattern".to_string(), json!(input.pattern));
    metadata.insert("path".to_string(), json!(search_root.display().to_string()));
    metadata.insert("include".to_string(), json!(input.include));

    let pattern = metadata
        .get("pattern")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    request_permission(
        &ctx,
        &env.permissions,
        "grep",
        &pattern,
        metadata,
        vec!["*".to_string()],
    )?;

    let regex = Regex::new(&input.pattern).map_err(|err| GraphError::ExecutionError {
        node: format!("tool:{}", call.tool),
        message: format!("Invalid regex pattern: {}", err),
    })?;

    let include_matcher = if let Some(pattern) = input.include {
        let mut builder = GlobSetBuilder::new();
        builder.add(Glob::new(&pattern).map_err(|err| GraphError::ExecutionError {
            node: format!("tool:{}", call.tool),
            message: format!("Invalid include pattern: {}", err),
        })?);
        Some(builder.build().map_err(|err| GraphError::ExecutionError {
            node: format!("tool:{}", call.tool),
            message: format!("Invalid include pattern: {}", err),
        })?)
    } else {
        None
    };

    let mut matches = Vec::new();
    let mut truncated = false;

    'walker: for entry in walkdir::WalkDir::new(&search_root)
        .follow_links(true)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }

        if let Some(ref matcher) = include_matcher {
            let rel = entry.path().strip_prefix(&search_root).unwrap_or(entry.path());
            if !matcher.is_match(rel) {
                continue;
            }
        }

        let content = match tokio::fs::read_to_string(entry.path()).await {
            Ok(content) => content,
            Err(_) => continue,
        };

        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let mod_time = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or(0);

        for (idx, line) in content.lines().enumerate() {
            if !regex.is_match(line) {
                continue;
            }

            let mut line_text = line.to_string();
            if line_text.len() > MAX_LINE_LENGTH {
                line_text.truncate(MAX_LINE_LENGTH);
                line_text.push_str("...");
            }
            matches.push(MatchLine {
                path: entry.path().display().to_string(),
                mod_time,
                line_num: idx + 1,
                line_text,
            });
            if matches.len() >= LIMIT {
                truncated = true;
                break 'walker;
            }
        }
    }

    if matches.is_empty() {
        return Ok(ToolOutput::text("No files found")
            .with_mime_type("text/plain")
            .with_schema("tool.grep.v1")
            .with_attribute("matches", json!(0))
            .with_attribute("truncated", json!(false)));
    }

    matches.sort_by(|a, b| {
        b.mod_time
            .cmp(&a.mod_time)
            .then_with(|| a.path.cmp(&b.path))
            .then_with(|| a.line_num.cmp(&b.line_num))
    });

    let mut output = Vec::new();
    output.push(format!("Found {} matches", matches.len()));

    let mut current_path = String::new();
    for item in &matches {
        if item.path != current_path {
            if !current_path.is_empty() {
                output.push(String::new());
            }
            current_path = item.path.clone();
            output.push(format!("{}:", current_path));
        }
        output.push(format!("  Line {}: {}", item.line_num, item.line_text));
    }

    if truncated {
        output.push(String::new());
        output.push("(Results are truncated. Consider using a more specific path or pattern.)".to_string());
    }

    Ok(ToolOutput::text(output.join("\n"))
        .with_mime_type("text/plain")
        .with_schema("tool.grep.v1")
        .with_attribute("matches", json!(matches.len()))
        .with_attribute("truncated", json!(truncated)))
}
