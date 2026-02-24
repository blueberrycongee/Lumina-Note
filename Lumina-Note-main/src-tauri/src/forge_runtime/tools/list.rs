use crate::forge_runtime::permissions::request_permission;
use crate::forge_runtime::tools::shared::{
    ensure_external_directory_permission, parse_tool_input, resolve_path,
};
use crate::forge_runtime::tools::ToolEnvironment;
use forge::runtime::error::{GraphError, GraphResult};
use forge::runtime::tool::{ToolCall, ToolContext, ToolDefinition, ToolOutput, ToolRegistry};
use globset::{Glob, GlobSetBuilder};
use serde::Deserialize;
use serde_json::{json, Map};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Arc;

const LIMIT: usize = 100;
const MAX_RENDER_DEPTH: usize = 32;

const IGNORE_PATTERNS: &[&str] = &[
    "node_modules/",
    "__pycache__/",
    ".git/",
    "dist/",
    "build/",
    "target/",
    "vendor/",
    "bin/",
    "obj/",
    ".idea/",
    ".vscode/",
    ".zig-cache/",
    "zig-out",
    ".coverage",
    "coverage/",
    "vendor/",
    "tmp/",
    "temp/",
    ".cache/",
    "cache/",
    "logs/",
    ".venv/",
    "venv/",
    "env/",
];

#[derive(Deserialize)]
struct ListInput {
    path: Option<String>,
    ignore: Option<Vec<String>>,
}

pub fn register(registry: &mut ToolRegistry, env: ToolEnvironment) {
    let description = include_str!("descriptions/list.txt").to_string();
    let definition = ToolDefinition::new("list", description).with_input_schema(json!({
        "type": "object",
        "properties": {
            "path": { "type": "string" },
            "ignore": { "type": "array", "items": { "type": "string" } }
        }
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
    let input: ListInput = parse_tool_input(&call)?;
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
    metadata.insert("path".to_string(), json!(search_root.display().to_string()));

    let pattern = metadata
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    request_permission(
        &ctx,
        &env.permissions,
        "list",
        &pattern,
        metadata,
        vec!["*".to_string()],
    )?;

    let ignore_set = build_ignore_set(input.ignore)?;

    let mut files = Vec::new();
    let mut truncated = false;

    for entry in walkdir::WalkDir::new(&search_root)
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
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        if should_ignore(&rel_str, &ignore_set) {
            continue;
        }

        files.push(rel_str);
        if files.len() >= LIMIT {
            truncated = true;
            break;
        }
    }

    let mut dirs: HashSet<String> = HashSet::new();
    let mut files_by_dir: HashMap<String, Vec<String>> = HashMap::new();

    for file in &files {
        let mut dir = Path::new(file)
            .parent()
            .map(|path| path.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|| ".".to_string());
        if dir.is_empty() {
            dir = ".".to_string();
        }

        let parts: Vec<&str> = if dir == "." {
            Vec::new()
        } else {
            dir.split('/').collect()
        };
        for i in 0..=parts.len() {
            let mut dir_path = if i == 0 {
                ".".to_string()
            } else {
                parts[..i].join("/")
            };
            if dir_path.is_empty() {
                dir_path = ".".to_string();
            }
            dirs.insert(dir_path);
        }

        files_by_dir.entry(dir).or_default().push(
            Path::new(file)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
        );
    }

    let mut depth_truncated = false;
    let mut output = format!("{}/\n", search_root.display());
    output.push_str(&render_dir(".", &dirs, &files_by_dir, &mut depth_truncated));
    if depth_truncated {
        truncated = true;
    }

    Ok(ToolOutput::text(output)
        .with_mime_type("text/plain")
        .with_schema("tool.list.v1")
        .with_attribute("count", json!(files.len()))
        .with_attribute("truncated", json!(truncated)))
}

fn build_ignore_set(ignore: Option<Vec<String>>) -> GraphResult<Option<globset::GlobSet>> {
    let Some(ignore) = ignore else {
        return Ok(None);
    };
    if ignore.is_empty() {
        return Ok(None);
    }
    let mut builder = GlobSetBuilder::new();
    for pattern in ignore {
        builder.add(
            Glob::new(&pattern).map_err(|err| GraphError::ExecutionError {
                node: "tool:list".to_string(),
                message: format!("Invalid ignore pattern: {}", err),
            })?,
        );
    }
    Ok(Some(builder.build().map_err(|err| {
        GraphError::ExecutionError {
            node: "tool:list".to_string(),
            message: format!("Invalid ignore pattern: {}", err),
        }
    })?))
}

fn should_ignore(path: &str, ignore_set: &Option<globset::GlobSet>) -> bool {
    if let Some(set) = ignore_set {
        if set.is_match(Path::new(path)) {
            return true;
        }
    }

    let normalized = path.replace('\\', "/");
    for pattern in IGNORE_PATTERNS {
        let trimmed = pattern.trim_end_matches('/');
        if normalized.split('/').any(|part| part == trimmed) {
            return true;
        }
    }
    false
}

fn render_dir(
    dir_path: &str,
    dirs: &HashSet<String>,
    files_by_dir: &HashMap<String, Vec<String>>,
    depth_truncated: &mut bool,
) -> String {
    let mut output = String::new();
    let mut stack: Vec<(String, usize, bool)> = Vec::new();
    stack.push((dir_path.to_string(), 0, false));

    while let Some((current, depth, exit)) = stack.pop() {
        if exit {
            let mut files = files_by_dir.get(&current).cloned().unwrap_or_default();
            files.sort();
            let child_indent = "  ".repeat(depth + 1);
            for file in files {
                output.push_str(&format!("{}{}\n", child_indent, file));
            }
            continue;
        }

        let indent = "  ".repeat(depth);
        if depth > 0 {
            let name = Path::new(&current)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| current.to_string());
            output.push_str(&format!("{}{}/\n", indent, name));
        }

        stack.push((current.clone(), depth, true));

        if depth >= MAX_RENDER_DEPTH {
            *depth_truncated = true;
            continue;
        }

        let mut children: Vec<String> = dirs
            .iter()
            .filter(|dir| dir_parent(dir) == current)
            .cloned()
            .collect();
        children.sort();

        for child in children.into_iter().rev() {
            stack.push((child, depth + 1, false));
        }
    }

    output
}

fn dir_parent(dir: &str) -> &str {
    if dir.is_empty() {
        return ".";
    }
    if dir == "." {
        return "";
    }
    match dir.rfind('/') {
        Some(idx) => {
            if idx == 0 {
                "."
            } else {
                &dir[..idx]
            }
        }
        None => ".",
    }
}
