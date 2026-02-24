use crate::agent::llm_client::LlmClient;
use crate::agent::types::{AgentConfig, GraphState, Message, MessageRole, ToolCall};
use crate::forge_runtime::permissions::PermissionSession as LocalPermissionSession;
use crate::forge_runtime::tools::{build_registry, ToolEnvironment};
use crate::mobile_gateway::emit_agent_event_payload;
use forge::runtime::cancel::CancellationToken;
use forge::runtime::error::{GraphError, GraphResult, Interrupt};
use forge::runtime::event::{Event, EventSink, TokenUsage};
use forge::runtime::permission::{PermissionPolicy, PermissionSession};
use forge::runtime::r#loop::LoopNode;
use forge::runtime::session_state::SessionState;
use forge::runtime::tool::{ToolCall as ForgeToolCall, ToolOutput, ToolRegistry};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use uuid::Uuid;

const DOOM_LOOP_THRESHOLD: usize = 3;
const TOOL_CALLS_MESSAGE_NAME: &str = "__lumina_tool_calls__";

#[derive(Clone)]
pub struct ForgeRuntime {
    pub registry: Arc<ToolRegistry>,
    pub permissions: Arc<LocalPermissionSession>,
}

pub struct ForgePending {
    pub interrupts: Vec<Interrupt>,
    pub pending_tool_calls: Vec<ToolCall>,
}

pub struct ForgeRunResult {
    pub state: GraphState,
    pub pending: Option<ForgePending>,
}

#[derive(Clone)]
pub struct TauriEventSink {
    app: AppHandle,
}

impl TauriEventSink {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl EventSink for TauriEventSink {
    fn emit(&self, event: Event) -> GraphResult<()> {
        let payload = wrap_event(event);
        emit_agent_event_payload(&self.app, payload);
        Ok(())
    }
}

pub fn build_runtime(
    workspace_root: impl Into<PathBuf>,
    permissions: Arc<LocalPermissionSession>,
) -> ForgeRuntime {
    let env = ToolEnvironment::new(workspace_root, permissions.clone());
    let registry = Arc::new(build_registry(env));
    ForgeRuntime {
        registry,
        permissions,
    }
}

pub fn build_tool_definitions(registry: &ToolRegistry) -> Vec<Value> {
    registry
        .definitions()
        .into_iter()
        .map(|definition| {
            let parameters = definition.input_schema.unwrap_or_else(|| {
                json!({
                    "type": "object",
                    "properties": {},
                })
            });
            json!({
                "type": "function",
                "function": {
                    "name": definition.name,
                    "description": definition.description,
                    "parameters": parameters,
                }
            })
        })
        .collect()
}

pub async fn run_forge_loop(
    app: AppHandle,
    config: AgentConfig,
    state: GraphState,
    runtime: ForgeRuntime,
    pending_tool_calls: Vec<ToolCall>,
    session_id: String,
    message_id: String,
    cancel: CancellationToken,
) -> Result<ForgeRunResult, String> {
    let tool_defs = Arc::new(build_tool_definitions(&runtime.registry));
    let available_tools = Arc::new(collect_available_tools(&tool_defs));
    let llm = Arc::new(LlmClient::new(config.clone()));
    let pending = Arc::new(Mutex::new(None::<ForgePending>));
    let pending_calls = Arc::new(Mutex::new(pending_tool_calls));
    let sink: Arc<dyn EventSink> = Arc::new(TauriEventSink::new(app.clone()));
    let session_state = Arc::new(Mutex::new(SessionState::new(
        session_id.clone(),
        message_id.clone(),
    )));

    let gate = Arc::new(PermissionSession::new(PermissionPolicy::default()));
    let node = LoopNode::with_tools_and_gate("agent_loop", runtime.registry.clone(), gate, {
        let pending = pending.clone();
        let pending_calls = pending_calls.clone();
        let llm = llm.clone();
        let tool_defs = tool_defs.clone();
        let available_tools = available_tools.clone();
        let session_id = session_id.clone();
        let message_id = message_id.clone();
        let cancel = cancel.clone();
        let app = app.clone();
        move |mut state: GraphState, ctx| {
            let pending = pending.clone();
            let pending_calls = pending_calls.clone();
            let llm = llm.clone();
            let tool_defs = tool_defs.clone();
            let available_tools = available_tools.clone();
            let session_id = session_id.clone();
            let message_id = message_id.clone();
            let cancel = cancel.clone();
            let app = app.clone();
            async move {
                let mut queued_calls = {
                    let mut locked = pending_calls.lock().unwrap();
                    std::mem::take(&mut *locked)
                };
                let mut iteration = 0usize;
                let max_iterations = config.max_steps;
                let mut recent_tool_batches: Vec<String> = Vec::new();

                loop {
                    if cancel.is_cancelled() {
                        return Err(GraphError::Aborted {
                            reason: cancel.abort_reason(),
                        });
                    }

                    if queued_calls.is_empty() {
                        iteration += 1;
                        if max_iterations > 0 && iteration > max_iterations {
                            return Err(GraphError::MaxIterationsExceeded);
                        }

                        ctx.emit(Event::StepStart {
                            session_id: session_id.clone(),
                        })?;

                        let tools = if llm.supports_fc() {
                            Some(tool_defs.as_ref().as_slice())
                        } else {
                            None
                        };

                        let request_id = Uuid::new_v4().to_string();
                        let ctx_for_delta = ctx.clone();
                        let delta_session_id = session_id.clone();
                        let delta_message_id = message_id.clone();
                        let delta_emit_error = Arc::new(Mutex::new(None::<String>));
                        let response = llm
                            .call_stream_with_delta(
                                Some(app.clone()),
                                &request_id,
                                &state.messages,
                                tools,
                                {
                                    let delta_emit_error = delta_emit_error.clone();
                                    move |delta| {
                                        if let Err(err) = ctx_for_delta.emit(Event::TextDelta {
                                            session_id: delta_session_id.clone(),
                                            message_id: delta_message_id.clone(),
                                            delta: delta.to_string(),
                                        }) {
                                            let mut locked = delta_emit_error.lock().unwrap();
                                            if locked.is_none() {
                                                *locked = Some(err.to_string());
                                            }
                                        }
                                    }
                                },
                            )
                            .await
                            .map_err(|err| GraphError::ExecutionError {
                                node: "llm".to_string(),
                                message: err,
                            })?;
                        if let Some(err) = delta_emit_error.lock().unwrap().take() {
                            return Err(GraphError::ExecutionError {
                                node: "event_sink:text_delta".to_string(),
                                message: err,
                            });
                        }

                        ctx.emit(Event::StepFinish {
                            session_id: session_id.clone(),
                            tokens: TokenUsage {
                                input: response.prompt_tokens as u64,
                                output: response.completion_tokens as u64,
                                reasoning: 0,
                                cache_read: 0,
                                cache_write: 0,
                            },
                            cost: 0.0,
                        })?;

                        let finish_reason = response.finish_reason.clone();
                        let raw_tool_calls = response.tool_calls.unwrap_or_default();
                        let (tool_calls, invalid_calls) =
                            repair_tool_calls(raw_tool_calls, &available_tools);
                        if !invalid_calls.is_empty() {
                            let warning = format!(
                                "模型请求了不可用工具：{}。请调整请求或切换模型后重试。",
                                invalid_calls.join(", ")
                            );
                            ctx.emit(Event::TextFinal {
                                session_id: session_id.clone(),
                                message_id: message_id.clone(),
                                text: warning.clone(),
                            })?;
                            state.final_result = Some(warning);
                            break;
                        }
                        if tool_calls.is_empty() {
                            let content = response.content;
                            let final_text = if matches!(finish_reason.as_deref(), Some("tool_calls")) {
                                "模型返回了 tool_calls 结束原因，但没有提供可执行的工具调用，已停止以避免循环。".to_string()
                            } else if matches!(finish_reason.as_deref(), Some("length"))
                                && content.trim().is_empty()
                            {
                                "模型因长度限制结束且未返回内容，请重试或提高 max_tokens。".to_string()
                            } else {
                                content.clone()
                            };
                            if !content.trim().is_empty() {
                                state.messages.push(Message {
                                    role: MessageRole::Assistant,
                                    content: content.clone(),
                                    name: None,
                                    tool_call_id: None,
                                });
                            }
                            ctx.emit(Event::TextFinal {
                                session_id: session_id.clone(),
                                message_id: message_id.clone(),
                                text: final_text.clone(),
                            })?;
                            state.final_result = Some(final_text);
                            break;
                        }

                        let batch_signature = tool_batch_signature(&tool_calls);
                        recent_tool_batches.push(batch_signature.clone());
                        if recent_tool_batches.len() > DOOM_LOOP_THRESHOLD {
                            recent_tool_batches.remove(0);
                        }
                        if recent_tool_batches.len() == DOOM_LOOP_THRESHOLD
                            && recent_tool_batches.iter().all(|sig| sig == &batch_signature)
                        {
                            let summary = summarize_tool_batch(&tool_calls);
                            let message = format!(
                                "检测到重复工具调用（连续 {} 次）：{}。请调整输入或提供更多约束后重试。",
                                DOOM_LOOP_THRESHOLD, summary
                            );
                            ctx.emit(Event::TextFinal {
                                session_id: session_id.clone(),
                                message_id: message_id.clone(),
                                text: message.clone(),
                            })?;
                            state.final_result = Some(message);
                            break;
                        }

                        let (reasoning_content, assistant_content) =
                            split_reasoning_block(&response.content);
                        let tool_calls_payload = serde_json::to_string(&json!({
                            "tool_calls": &tool_calls,
                            "content": assistant_content,
                            "reasoning_content": reasoning_content,
                        }))
                        .unwrap_or_else(|_| "[]".to_string());
                        state.messages.push(Message {
                            role: MessageRole::Assistant,
                            content: tool_calls_payload,
                            name: Some(TOOL_CALLS_MESSAGE_NAME.to_string()),
                            tool_call_id: None,
                        });
                        queued_calls = tool_calls;
                    }

                    while let Some(call) = pop_next_call(&mut queued_calls) {
                        let input = serde_json::Value::Object(
                            call.params
                                .iter()
                                .map(|(key, value)| (key.clone(), value.clone()))
                                .collect(),
                        );
                        let forge_call =
                            ForgeToolCall::new(call.name.clone(), call.id.clone(), input);
                        match ctx.run_tool(forge_call).await {
                            Ok(output) => {
                                handle_tool_success(&mut state, &call, output);
                            }
                            Err(GraphError::Interrupted(interrupts)) => {
                                let mut pending_calls = vec![call];
                                pending_calls.extend(queued_calls);
                                let mut locked = pending.lock().unwrap();
                                *locked = Some(ForgePending {
                                    interrupts,
                                    pending_tool_calls: pending_calls,
                                });
                                return Ok(state);
                            }
                            Err(GraphError::Aborted { reason }) => {
                                return Err(GraphError::Aborted { reason });
                            }
                            Err(err) => {
                                handle_tool_error(&mut state, &call, &err);
                            }
                        }
                    }
                }

                Ok(state)
            }
        }
    })
    .with_cancel_token(cancel.clone());

    let result = node
        .run_with_session_state(state, session_state, sink)
        .await
        .map_err(|err| err.to_string())?;

    let pending = pending.lock().unwrap().take();
    Ok(ForgeRunResult {
        state: result,
        pending,
    })
}

fn pop_next_call(queue: &mut Vec<ToolCall>) -> Option<ToolCall> {
    if queue.is_empty() {
        None
    } else {
        Some(queue.remove(0))
    }
}

fn handle_tool_success(state: &mut GraphState, call: &ToolCall, output: ToolOutput) {
    let content = tool_output_text(&output);
    state
        .observations
        .push(format!("[{}] {}", call.name, content));
    state.messages.push(Message {
        role: MessageRole::Tool,
        content,
        name: Some(call.name.clone()),
        tool_call_id: Some(call.id.clone()),
    });
}

fn handle_tool_error(state: &mut GraphState, call: &ToolCall, err: &GraphError) {
    let message = format!("Tool {} failed: {}", call.name, err);
    state
        .observations
        .push(format!("[{}] {}", call.name, message));
    state.messages.push(Message {
        role: MessageRole::Tool,
        content: message,
        name: Some(call.name.clone()),
        tool_call_id: Some(call.id.clone()),
    });
}

fn tool_output_text(output: &ToolOutput) -> String {
    if let Some(text) = output.content.as_str() {
        return text.to_string();
    }
    serde_json::to_string_pretty(&output.content).unwrap_or_else(|_| output.content.to_string())
}

fn tool_batch_signature(calls: &[ToolCall]) -> String {
    serde_json::to_string(calls).unwrap_or_else(|_| {
        calls
            .iter()
            .map(|call| call.name.as_str())
            .collect::<Vec<_>>()
            .join(",")
    })
}

fn summarize_tool_batch(calls: &[ToolCall]) -> String {
    calls
        .iter()
        .map(|call| call.name.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}

fn collect_available_tools(tool_defs: &[Value]) -> HashSet<String> {
    tool_defs
        .iter()
        .filter_map(|def| {
            def.get("function")
                .and_then(|func| func.get("name"))
                .and_then(|name| name.as_str())
                .map(|name| name.to_string())
        })
        .collect()
}

fn repair_tool_calls(
    calls: Vec<ToolCall>,
    available_tools: &HashSet<String>,
) -> (Vec<ToolCall>, Vec<String>) {
    let mut repaired = Vec::with_capacity(calls.len());
    let mut invalid = Vec::new();

    for mut call in calls {
        if available_tools.contains(&call.name) {
            repaired.push(call);
            continue;
        }
        let lower = call.name.to_lowercase();
        if available_tools.contains(&lower) {
            call.name = lower;
            repaired.push(call);
            continue;
        }
        invalid.push(call.name);
    }

    (repaired, invalid)
}

fn split_reasoning_block(content: &str) -> (Option<String>, String) {
    let trimmed = content.trim();
    if !trimmed.starts_with("<thinking>") {
        return (None, content.to_string());
    }
    let Some(end_idx) = trimmed.find("</thinking>") else {
        return (None, content.to_string());
    };
    let reasoning_start = "<thinking>".len();
    let reasoning = trimmed[reasoning_start..end_idx].trim().to_string();
    let remaining = trimmed[end_idx + "</thinking>".len()..]
        .trim_start_matches('\n')
        .trim_start()
        .to_string();
    let reasoning_opt = if reasoning.is_empty() {
        None
    } else {
        Some(reasoning)
    };
    (reasoning_opt, remaining)
}

fn wrap_event(event: Event) -> Value {
    let value = match serde_json::to_value(&event) {
        Ok(value) => value,
        Err(_) => return json!({ "type": "unknown", "data": null }),
    };
    if let Value::Object(ref map) = value {
        if map.len() == 1 {
            if let Some((key, data)) = map.iter().next() {
                let event_type = to_snake_case(key);
                return json!({ "type": event_type, "data": data.clone() });
            }
        }
    }
    json!({ "type": "unknown", "data": value })
}

fn to_snake_case(value: &str) -> String {
    let mut output = String::new();
    for (idx, ch) in value.chars().enumerate() {
        if ch.is_uppercase() {
            if idx > 0 {
                output.push('_');
            }
            for lower in ch.to_lowercase() {
                output.push(lower);
            }
        } else {
            output.push(ch);
        }
    }
    output
}
