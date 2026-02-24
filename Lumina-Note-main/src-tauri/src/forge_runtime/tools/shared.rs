use crate::forge_runtime::permissions::{request_permission, PermissionSession};
use forge::runtime::error::{GraphError, GraphResult};
use forge::runtime::tool::{ToolCall, ToolContext};
use serde::de::DeserializeOwned;
use serde_json::Map;
use std::path::{Component, Path, PathBuf};

pub fn parse_tool_input<T: DeserializeOwned>(call: &ToolCall) -> GraphResult<T> {
    serde_json::from_value(call.input.clone()).map_err(|err| GraphError::ExecutionError {
        node: format!("tool:{}", call.tool),
        message: format!("invalid tool input: {}", err),
    })
}

pub fn normalize_path(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => result.push(prefix.as_os_str()),
            Component::RootDir => result.push(Component::RootDir.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                result.pop();
            }
            Component::Normal(part) => result.push(part),
        }
    }
    result
}

pub fn resolve_path(workspace_root: &Path, input: &str) -> PathBuf {
    let path = Path::new(input);
    let resolved = if path.is_absolute() {
        path.to_path_buf()
    } else {
        workspace_root.join(path)
    };
    normalize_path(&resolved)
}

pub fn is_within_workspace(workspace_root: &Path, target: &Path) -> bool {
    let normalized_root = normalize_path(workspace_root);
    let normalized_target = normalize_path(target);
    normalized_target.starts_with(&normalized_root)
}

pub fn permission_path(workspace_root: &Path, target: &Path) -> String {
    if is_within_workspace(workspace_root, target) {
        target
            .strip_prefix(workspace_root)
            .unwrap_or(target)
            .display()
            .to_string()
    } else {
        target.display().to_string()
    }
}

pub fn ensure_external_directory_permission(
    ctx: &ToolContext,
    session: &PermissionSession,
    workspace_root: &Path,
    target: &Path,
    kind: &str,
) -> GraphResult<()> {
    if is_within_workspace(workspace_root, target) {
        return Ok(());
    }

    let parent = if kind == "directory" {
        target
    } else {
        target.parent().unwrap_or(target)
    };
    let glob = parent.join("*");
    let mut metadata = Map::new();
    metadata.insert(
        "filepath".to_string(),
        serde_json::Value::String(target.display().to_string()),
    );
    metadata.insert(
        "parentDir".to_string(),
        serde_json::Value::String(parent.display().to_string()),
    );
    request_permission(
        ctx,
        session,
        "external_directory",
        &glob.display().to_string(),
        metadata,
        vec![glob.display().to_string()],
    )
}

pub fn truncate_text(text: &str, max_lines: usize, max_bytes: usize) -> (String, bool) {
    let mut lines = Vec::new();
    let mut bytes = 0usize;
    let mut truncated = false;

    for line in text.lines() {
        if lines.len() >= max_lines {
            truncated = true;
            break;
        }
        let size = line.as_bytes().len() + if lines.is_empty() { 0 } else { 1 };
        if bytes + size > max_bytes {
            truncated = true;
            break;
        }
        lines.push(line);
        bytes += size;
    }

    let mut output = lines.join("\n");
    if truncated {
        output.push_str("\n\n(Output truncated. Use Read or Grep for more.)");
    }
    (output, truncated)
}
