use crate::forge_runtime::permissions::request_permission;
use crate::forge_runtime::tools::shared::{
    ensure_external_directory_permission, parse_tool_input, resolve_path, truncate_text,
};
use crate::forge_runtime::tools::ToolEnvironment;
use forge::runtime::error::{GraphError, GraphResult};
use forge::runtime::tool::{ToolCall, ToolContext, ToolDefinition, ToolOutput, ToolRegistry};
use serde::Deserialize;
use serde_json::{json, Map};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

const DEFAULT_TIMEOUT_MS: u64 = 120_000;
const MAX_LINES: usize = 2000;
const MAX_BYTES: usize = 50 * 1024;

#[derive(Deserialize)]
struct BashInput {
    command: String,
    timeout: Option<u64>,
    workdir: Option<String>,
    description: String,
}

pub fn register(registry: &mut ToolRegistry, env: ToolEnvironment) {
    let raw = include_str!("descriptions/bash.txt");
    let description = raw
        .replace("${directory}", &env.workspace_root.display().to_string())
        .replace("${maxLines}", &MAX_LINES.to_string())
        .replace("${maxBytes}", &MAX_BYTES.to_string());

    let definition = ToolDefinition::new("bash", description).with_input_schema(json!({
        "type": "object",
        "properties": {
            "command": { "type": "string" },
            "timeout": { "type": "number" },
            "workdir": { "type": "string" },
            "description": { "type": "string" }
        },
        "required": ["command", "description"]
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
    let input: BashInput = parse_tool_input(&call)?;
    let timeout = input.timeout.unwrap_or(DEFAULT_TIMEOUT_MS);

    let workdir = input
        .workdir
        .as_deref()
        .map(|path| resolve_path(&env.workspace_root, path))
        .unwrap_or_else(|| env.workspace_root.clone());

    ensure_external_directory_permission(
        &ctx,
        &env.permissions,
        &env.workspace_root,
        &workdir,
        "directory",
    )?;

    let command_pattern = input.command.clone();
    let always = command_pattern
        .split_whitespace()
        .next()
        .map(|head| format!("{} *", head))
        .into_iter()
        .collect::<Vec<_>>();

    let mut metadata = Map::new();
    metadata.insert("command".to_string(), json!(input.command));
    metadata.insert("workdir".to_string(), json!(workdir.display().to_string()));

    request_permission(
        &ctx,
        &env.permissions,
        "bash",
        &command_pattern,
        metadata,
        if always.is_empty() { vec!["*".to_string()] } else { always },
    )?;

    let mut cmd = if cfg!(windows) {
        let mut cmd = Command::new("cmd");
        cmd.arg("/C").arg(&input.command);
        cmd
    } else {
        let mut cmd = Command::new("bash");
        cmd.arg("-lc").arg(&input.command);
        cmd
    };

    let mut child = cmd
        .current_dir(&workdir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| GraphError::ExecutionError {
            node: format!("tool:{}", call.tool),
            message: format!("Failed to spawn command: {}", err),
        })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(mut out) = stdout {
            let _ = out.read_to_end(&mut buf).await;
        }
        buf
    });
    let stderr_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(mut err) = stderr {
            let _ = err.read_to_end(&mut buf).await;
        }
        buf
    });

    let status_result = tokio::select! {
        res = child.wait() => res.map(Some),
        _ = tokio::time::sleep(Duration::from_millis(timeout)) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            Ok(None)
        }
    };

    let status = match status_result {
        Ok(status) => status,
        Err(err) => {
            return Err(GraphError::ExecutionError {
                node: format!("tool:{}", call.tool),
                message: format!("Command failed: {}", err),
            });
        }
    };
    let timed_out = status.is_none();
    let status = status.and_then(|status| status.code());
    let stdout = stdout_task.await.unwrap_or_default();
    let stderr = stderr_task.await.unwrap_or_default();
    let mut output = format!(
        "{}{}",
        String::from_utf8_lossy(&stdout),
        String::from_utf8_lossy(&stderr)
    );

    if timed_out {
        output.push_str(&format!("\n\n(bash timed out after {} ms)", timeout));
    }

    let (truncated, is_truncated) = truncate_text(&output, MAX_LINES, MAX_BYTES);

    Ok(ToolOutput::text(truncated)
        .with_mime_type("text/plain")
        .with_schema("tool.bash.v1")
        .with_attribute("exit", json!(status))
        .with_attribute("description", json!(input.description))
        .with_attribute("truncated", json!(is_truncated)))
}
