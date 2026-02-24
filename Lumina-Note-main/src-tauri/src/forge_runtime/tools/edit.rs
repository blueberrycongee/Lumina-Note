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
struct EditInput {
    #[serde(rename = "filePath")]
    file_path: String,
    #[serde(rename = "oldString")]
    old_string: String,
    #[serde(rename = "newString")]
    new_string: String,
    #[serde(rename = "replaceAll")]
    replace_all: Option<bool>,
}

pub fn register(registry: &mut ToolRegistry, env: ToolEnvironment) {
    let description = include_str!("descriptions/edit.txt").to_string();
    let definition = ToolDefinition::new("edit", description).with_input_schema(json!({
        "type": "object",
        "properties": {
            "filePath": { "type": "string" },
            "oldString": { "type": "string" },
            "newString": { "type": "string" },
            "replaceAll": { "type": "boolean" }
        },
        "required": ["filePath", "oldString", "newString"]
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
    let input: EditInput = parse_tool_input(&call)?;
    if input.old_string == input.new_string {
        return Err(GraphError::ExecutionError {
            node: format!("tool:{}", call.tool),
            message: "oldString and newString must be different".to_string(),
        });
    }

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
    metadata.insert("filepath".to_string(), json!(target.display().to_string()));

    request_permission(
        &ctx,
        &env.permissions,
        "edit",
        &pattern,
        metadata,
        vec!["*".to_string()],
    )?;

    let content =
        tokio::fs::read_to_string(&target)
            .await
            .map_err(|err| GraphError::ExecutionError {
                node: format!("tool:{}", call.tool),
                message: format!("Failed to read file: {}", err),
            })?;

    let replace_all = input.replace_all.unwrap_or(false);
    let (new_content, replaced) = if input.old_string.is_empty() {
        (input.new_string.clone(), 0usize)
    } else {
        let count = content.matches(&input.old_string).count();
        if count == 0 {
            return Err(GraphError::ExecutionError {
                node: format!("tool:{}", call.tool),
                message: "oldString not found in content".to_string(),
            });
        }
        if !replace_all && count > 1 {
            return Err(GraphError::ExecutionError {
                node: format!("tool:{}", call.tool),
                message:
                    "Found multiple matches for oldString. Provide more context or set replaceAll."
                        .to_string(),
            });
        }
        let updated = if replace_all {
            content.replace(&input.old_string, &input.new_string)
        } else {
            content.replacen(&input.old_string, &input.new_string, 1)
        };
        (updated, count)
    };

    tokio::fs::write(&target, new_content)
        .await
        .map_err(|err| GraphError::ExecutionError {
            node: format!("tool:{}", call.tool),
            message: format!("Failed to write file: {}", err),
        })?;

    Ok(ToolOutput::text("Edit applied successfully.")
        .with_mime_type("text/plain")
        .with_schema("tool.edit.v1")
        .with_attribute("filepath", json!(target.display().to_string()))
        .with_attribute("replaced", json!(replaced)))
}
