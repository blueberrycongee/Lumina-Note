use crate::agent::llm_client::LlmClient;
use crate::agent::types::{AgentConfig, GraphState, Message, MessageRole, ToolCall};
use crate::forge_runtime::permissions::PermissionSession as LocalPermissionSession;
use crate::forge_runtime::tools::{build_registry, ToolEnvironment};
use crate::mobile_gateway::emit_agent_event_payload;
use forge::runtime::cancel::CancellationToken;
use forge::runtime::error::{GraphError, Interrupt};
use forge::runtime::event::{Event, EventSink, TokenUsage};
use forge::runtime::r#loop::LoopNode;
use forge::runtime::permission::{PermissionPolicy, PermissionSession};
use forge::runtime::session_state::SessionState;
use forge::runtime::tool::{ToolCall as ForgeToolCall, ToolOutput, ToolRegistry};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use uuid::Uuid;

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
    fn emit(&self, event: Event) {
        let payload = wrap_event(event);
        emit_agent_event_payload(&self.app, payload);
    }
}

pub fn build_runtime(workspace_root: impl Into<PathBuf>, permissions: Arc<LocalPermissionSession>) -> ForgeRuntime {
    let env = ToolEnvironment::new(workspace_root, permissions.clone());
    let registry = Arc::new(build_registry(env));
    ForgeRuntime { registry, permissions }
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
    mut state: GraphState,
    runtime: ForgeRuntime,
    pending_tool_calls: Vec<ToolCall>,
    session_id: String,
    message_id: String,
    cancel: CancellationToken,
) -> Result<ForgeRunResult, String> {
    let tool_defs = Arc::new(build_tool_definitions(&runtime.registry));
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
        let session_id = session_id.clone();
        let message_id = message_id.clone();
        let cancel = cancel.clone();
        let app = app.clone();
        move |mut state: GraphState, ctx| {
            let pending = pending.clone();
            let pending_calls = pending_calls.clone();
            let llm = llm.clone();
            let tool_defs = tool_defs.clone();
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
                let max_iterations = config.max_steps.max(1);

                loop {
                    if cancel.is_cancelled() {
                        return Err(GraphError::Aborted {
                            reason: cancel.abort_reason(),
                        });
                    }

                    if queued_calls.is_empty() {
                        iteration += 1;
                        if iteration > max_iterations {
                            return Err(GraphError::MaxIterationsExceeded);
                        }

                        ctx.emit(Event::StepStart {
                            session_id: session_id.clone(),
                        });

                        let tools = if llm.supports_fc() {
                            Some(tool_defs.as_ref().as_slice())
                        } else {
                            None
                        };

                        let request_id = Uuid::new_v4().to_string();
                        let ctx_for_delta = ctx.clone();
                        let delta_session_id = session_id.clone();
                        let delta_message_id = message_id.clone();
                        let response = llm
                            .call_stream_with_delta(
                                Some(app.clone()),
                                &request_id,
                                &state.messages,
                                tools,
                                move |delta| {
                                    ctx_for_delta.emit(Event::TextDelta {
                                        session_id: delta_session_id.clone(),
                                        message_id: delta_message_id.clone(),
                                        delta: delta.to_string(),
                                    });
                                },
                            )
                            .await
                            .map_err(|err| GraphError::ExecutionError {
                                node: "llm".to_string(),
                                message: err,
                            })?;

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
                        });

                        let tool_calls = response.tool_calls.unwrap_or_default();
                        if tool_calls.is_empty() {
                            let content = response.content;
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
                                text: content.clone(),
                            });
                            state.final_result = Some(content);
                            break;
                        }

                        queued_calls = tool_calls;
                    }

                    while let Some(call) = pop_next_call(&mut queued_calls) {
                        let input = serde_json::Value::Object(
                            call.params
                                .iter()
                                .map(|(key, value)| (key.clone(), value.clone()))
                                .collect(),
                        );
                        let forge_call = ForgeToolCall::new(call.name.clone(), call.id.clone(), input);
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
    state.observations.push(format!("[{}] {}", call.name, content));
    state.messages.push(Message {
        role: MessageRole::User,
        content: format!("Tool {} result:\n{}", call.name, content),
        name: None,
        tool_call_id: None,
    });
}

fn handle_tool_error(state: &mut GraphState, call: &ToolCall, err: &GraphError) {
    let message = format!("Tool {} failed: {}", call.name, err);
    state.observations.push(format!("[{}] {}", call.name, message));
    state.messages.push(Message {
        role: MessageRole::User,
        content: message,
        name: None,
        tool_call_id: None,
    });
}

fn tool_output_text(output: &ToolOutput) -> String {
    if let Some(text) = output.content.as_str() {
        return text.to_string();
    }
    serde_json::to_string_pretty(&output.content).unwrap_or_else(|_| output.content.to_string())
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
