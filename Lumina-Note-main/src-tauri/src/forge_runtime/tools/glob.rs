use crate::forge_runtime::permissions::request_permission;
use crate::forge_runtime::tools::shared::{
    ensure_external_directory_permission, parse_tool_input, resolve_path,
};
use crate::forge_runtime::tools::ToolEnvironment;
use forge::runtime::error::{GraphError, GraphResult};
use forge::runtime::tool::{ToolCall, ToolContext, ToolDefinition, ToolOutput, ToolRegistry};
use globset::Glob;
use serde::Deserialize;
use serde_json::{json, Map};
use std::sync::Arc;

const LIMIT: usize = 100;

#[derive(Deserialize)]
struct GlobInput {
    pattern: String,
    path: Option<String>,
}

pub fn register(registry: &mut ToolRegistry, env: ToolEnvironment) {
    let description = include_str!("descriptions/glob.txt").to_string();
    let definition = ToolDefinition::new("glob", description).with_input_schema(json!({
        "type": "object",
        "properties": {
            "pattern": { "type": "string" },
            "path": { "type": "string" }
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
    let input: GlobInput = parse_tool_input(&call)?;
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

    let pattern = metadata
        .get("pattern")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    request_permission(
        &ctx,
        &env.permissions,
        "glob",
        &pattern,
        metadata,
        vec!["*".to_string()],
    )?;

    let matcher = Glob::new(&input.pattern)
        .map_err(|err| GraphError::ExecutionError {
            node: format!("tool:{}", call.tool),
            message: format!("Invalid glob pattern: {}", err),
        })?
        .compile_matcher();

    let mut entries: Vec<(String, u64)> = Vec::new();
    let mut truncated = false;

    for entry in walkdir::WalkDir::new(&search_root)
        .follow_links(true)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(&search_root)
            .unwrap_or(entry.path());
        if !matcher.is_match(rel) {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let mtime = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        entries.push((entry.path().display().to_string(), mtime));
        if entries.len() >= LIMIT {
            truncated = true;
            break;
        }
    }

    entries.sort_by(|a, b| b.1.cmp(&a.1));

    let mut output = Vec::new();
    if entries.is_empty() {
        output.push("No files found".to_string());
    } else {
        output.extend(entries.iter().map(|(path, _)| path.clone()));
        if truncated {
            output.push("".to_string());
            output.push(
                "(Results are truncated. Consider using a more specific path or pattern.)"
                    .to_string(),
            );
        }
    }

    Ok(ToolOutput::text(output.join("\n"))
        .with_mime_type("text/plain")
        .with_schema("tool.glob.v1")
        .with_attribute("count", json!(entries.len()))
        .with_attribute("truncated", json!(truncated)))
}
