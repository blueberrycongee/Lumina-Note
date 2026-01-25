use crate::forge_runtime::permissions::request_permission;
use crate::forge_runtime::tools::shared::{
    ensure_external_directory_permission, parse_tool_input, permission_path, resolve_path,
};
use crate::forge_runtime::tools::ToolEnvironment;
use forge::runtime::error::{GraphError, GraphResult};
use forge::runtime::tool::{ToolCall, ToolContext, ToolDefinition, ToolOutput, ToolRegistry};
use serde::Deserialize;
use serde_json::{json, Map};
use std::sync::Arc;

#[derive(Deserialize)]
struct WriteInput {
    #[serde(rename = "filePath")]
    file_path: String,
    content: String,
}

pub fn register(registry: &mut ToolRegistry, env: ToolEnvironment) {
    let description = include_str!("descriptions/write.txt").to_string();
    let definition = ToolDefinition::new("write", description).with_input_schema(json!({
        "type": "object",
        "properties": {
            "filePath": { "type": "string" },
            "content": { "type": "string" }
        },
        "required": ["filePath", "content"]
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
    let input: WriteInput = parse_tool_input(&call)?;
    let target = resolve_path(&env.workspace_root, &input.file_path);

    ensure_external_directory_permission(&ctx, &env.permissions, &env.workspace_root, &target, "file")?;

    let pattern = permission_path(&env.workspace_root, &target);
    let mut metadata = Map::new();
    metadata.insert("filepath".to_string(), json!(target.display().to_string()));

    request_permission(
        &ctx,
        &env.permissions,
        "edit",
        &pattern,
        metadata,
        vec!["*".to_string()],
    )?;

    let exists = tokio::fs::metadata(&target).await.is_ok();
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|err| GraphError::ExecutionError {
            node: format!("tool:{}", call.tool),
            message: format!("Failed to create directory: {}", err),
        })?;
    }
    tokio::fs::write(&target, input.content)
        .await
        .map_err(|err| GraphError::ExecutionError {
            node: format!("tool:{}", call.tool),
            message: format!("Failed to write file: {}", err),
        })?;

    Ok(ToolOutput::text("Wrote file successfully.")
        .with_mime_type("text/plain")
        .with_schema("tool.write.v1")
        .with_attribute("filepath", json!(target.display().to_string()))
        .with_attribute("exists", json!(exists)))
}
