//! Agent Tauri 命令
//!
//! 前端调用的 Agent API — 简化为 wiki-aware coding agent
//!
//! 使用 Forge LoopNode 构建和执行 Agent 循环

use crate::agent::forge_loop::{
    build_runtime_with_client, run_forge_loop, ForgeRunResult, ForgeRuntime, TauriEventSink,
};
use crate::agent::orchestrator::build_initial_graph_state;
use crate::agent::types::*;
use crate::agent::vault;
use crate::agent::emit::emit_agent_event;
use crate::forge_runtime::permissions::{
    default_ruleset, PermissionRule, PermissionSession as LocalPermissionSession,
};
use forge::runtime::cancel::CancellationToken;
use forge::runtime::error::Interrupt;
use forge::runtime::event::{Event, EventSink, PermissionReply};
use forge::runtime::permission::PermissionDecision;
use forge::runtime::session_state::RunStatus;
use std::collections::VecDeque;
use std::sync::Arc;
use std::{fs, path::Path};
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Clone)]
struct ForgeRuntimeState {
    config: AgentConfig,
    runtime: ForgeRuntime,
    session_id: String,
    message_id: String,
    run_id: String,
    cancel: CancellationToken,
}

struct ForgeCheckpoint {
    checkpoint_id: String,
    state: GraphState,
    pending_tool_calls: Vec<ToolCall>,
    interrupts: Vec<Interrupt>,
}

#[derive(Clone)]
struct QueuedTaskRequest {
    id: String,
    config: AgentConfig,
    task: String,
    context: TaskContext,
    enqueued_at: u64,
}

struct PromptStackSnapshot {
    provider: String,
    base_system: String,
    system_prompt: String,
    built_in_agent: String,
    workspace_agent: String,
}

/// Agent 状态管理
pub struct AgentState {
    current_state: Arc<Mutex<Option<GraphState>>>,
    is_running: Arc<Mutex<bool>>,
    runtime: Arc<Mutex<Option<ForgeRuntimeState>>>,
    checkpoint: Arc<Mutex<Option<ForgeCheckpoint>>>,
    queue: Arc<Mutex<VecDeque<QueuedTaskRequest>>>,
}

impl AgentState {
    pub fn new() -> Self {
        Self {
            current_state: Arc::new(Mutex::new(None)),
            is_running: Arc::new(Mutex::new(false)),
            runtime: Arc::new(Mutex::new(None)),
            checkpoint: Arc::new(Mutex::new(None)),
            queue: Arc::new(Mutex::new(VecDeque::new())),
        }
    }
}

impl Default for AgentState {
    fn default() -> Self {
        Self::new()
    }
}

fn emit_agent_event_safe(sink: &TauriEventSink, event: Event) {
    if let Err(err) = sink.emit(event) {
        eprintln!("[Agent] Failed to emit forge event: {}", err);
    }
}

async fn build_llm_http_client(app: &AppHandle) -> Result<reqwest::Client, String> {
    app.state::<crate::proxy::ProxyState>()
        .client_with_timeout(std::time::Duration::from_secs(300))
        .await
        .map_err(|e| format!("Failed to build LLM HTTP client: {e}"))
}

fn now_unix_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn task_preview(task: &str, limit: usize) -> String {
    let trimmed = task.trim();
    if trimmed.chars().count() <= limit {
        return trimmed.to_string();
    }
    let mut out = String::new();
    for ch in trimmed.chars().take(limit.saturating_sub(1)) {
        out.push(ch);
    }
    out.push('\u{2026}');
    out
}

async fn build_queue_snapshot(state: &AgentState) -> AgentQueueSnapshot {
    let running = *state.is_running.lock().await;
    let active_task = if running {
        state
            .current_state
            .lock()
            .await
            .as_ref()
            .map(|graph| task_preview(graph.user_task(), 80))
    } else {
        None
    };
    let queued = {
        let queue = state.queue.lock().await;
        queue
            .iter()
            .enumerate()
            .map(|(index, item)| QueuedTaskSummary {
                id: item.id.clone(),
                task: task_preview(&item.task, 80),
                workspace_path: item.context.workspace_path.clone(),
                enqueued_at: item.enqueued_at,
                position: index + 1,
            })
            .collect::<Vec<_>>()
    };

    AgentQueueSnapshot {
        running,
        active_task,
        queued,
    }
}

async fn emit_queue_updated(app: &AppHandle, state: &AgentState) {
    let snapshot = build_queue_snapshot(state).await;
    emit_agent_event(
        app,
        AgentEvent::QueueUpdated {
            running: snapshot.running,
            active_task: snapshot.active_task,
            queued: snapshot.queued,
        },
    );
}

async fn sync_graph_state(state: &AgentState, graph_state: &GraphState) {
    let mut current_state = state.current_state.lock().await;
    *current_state = Some(graph_state.clone());
}

async fn execute_task_inner(
    app: AppHandle,
    state: &AgentState,
    config: AgentConfig,
    task: String,
    context: TaskContext,
) -> Result<bool, String> {
    {
        use crate::agent::debug_log as dbg;
        dbg::log_config(&config.provider, &config.model, config.temperature);
        dbg::log_task(&task);
    }

    let (messages, prompt_stack) = build_initial_messages(
        &app,
        &task,
        &context,
        &config.provider,
    );
    emit_agent_event(
        &app,
        AgentEvent::PromptStack {
            provider: prompt_stack.provider.clone(),
            base_system: prompt_stack.base_system.clone(),
            system_prompt: prompt_stack.system_prompt.clone(),
            built_in_agent: prompt_stack.built_in_agent.clone(),
            workspace_agent: prompt_stack.workspace_agent.clone(),
        },
    );
    let initial_state = build_initial_graph_state(
        messages,
        task.clone(),
        context,
        &config,
    );

    sync_graph_state(state, &initial_state).await;
    emit_queue_updated(&app, state).await;

    let http_client = build_llm_http_client(&app).await?;

    let permissions = build_permission_session(config.auto_approve);
    let proxy_client = app.state::<crate::proxy::ProxyState>().client().await;
    let runtime = build_runtime_with_client(
        initial_state.workspace_path(),
        permissions,
        Some(proxy_client),
    );
    let runtime_state = ForgeRuntimeState {
        config: config.clone(),
        runtime,
        session_id: Uuid::new_v4().to_string(),
        message_id: Uuid::new_v4().to_string(),
        run_id: Uuid::new_v4().to_string(),
        cancel: CancellationToken::new(),
    };

    {
        let mut runtime_lock = state.runtime.lock().await;
        *runtime_lock = Some(runtime_state.clone());
        let mut checkpoint_lock = state.checkpoint.lock().await;
        *checkpoint_lock = None;
    }

    let sink = TauriEventSink::new(app.clone());
    emit_agent_event_safe(
        &sink,
        Event::RunStarted {
            run_id: runtime_state.run_id.clone(),
            status: RunStatus::Running,
        },
    );

    let result = run_forge_loop(
        app.clone(),
        config,
        initial_state,
        runtime_state.runtime.clone(),
        Vec::new(),
        runtime_state.session_id.clone(),
        runtime_state.message_id.clone(),
        runtime_state.cancel.clone(),
        http_client,
    )
    .await;

    handle_forge_result(app, state, runtime_state, result).await
}

async fn drain_queued_tasks(app: AppHandle, state: &AgentState) {
    loop {
        let next_task = {
            let mut is_running = state.is_running.lock().await;
            if *is_running {
                None
            } else {
                let mut queue = state.queue.lock().await;
                let next = queue.pop_front();
                if next.is_some() {
                    *is_running = true;
                }
                next
            }
        };

        let Some(next) = next_task else {
            emit_queue_updated(&app, state).await;
            return;
        };

        emit_queue_updated(&app, state).await;
        let result =
            execute_task_inner(app.clone(), state, next.config, next.task, next.context).await;
        match result {
            Ok(finished) => {
                if !finished {
                    // Paused waiting for approval; keep remaining tasks queued.
                    return;
                }
            }
            Err(err) => {
                eprintln!("[Agent] queued task failed: {}", err);
            }
        }

        if *state.is_running.lock().await {
            return;
        }
    }
}

/// 启动 Agent 任务
#[tauri::command]
pub async fn agent_start_task(
    app: AppHandle,
    state: State<'_, AgentState>,
    config: AgentConfig,
    task: String,
    context: TaskContext,
) -> Result<(), String> {
    let should_enqueue = {
        let mut is_running = state.is_running.lock().await;
        if *is_running {
            true
        } else {
            *is_running = true;
            false
        }
    };

    if should_enqueue {
        {
            let mut queue = state.queue.lock().await;
            queue.push_back(QueuedTaskRequest {
                id: Uuid::new_v4().to_string(),
                config,
                task,
                context,
                enqueued_at: now_unix_millis(),
            });
        }
        emit_queue_updated(&app, &state).await;
        return Ok(());
    }

    let result = execute_task_inner(app.clone(), &state, config, task, context).await;
    match result {
        Ok(finished) => {
            if finished {
                drain_queued_tasks(app, &state).await;
            }
            Ok(())
        }
        Err(err) => {
            drain_queued_tasks(app.clone(), &state).await;
            Err(err)
        }
    }
}

/// 中止 Agent 任务
#[tauri::command]
pub async fn agent_abort(app: AppHandle, state: State<'_, AgentState>) -> Result<(), String> {
    let runtime = { state.runtime.lock().await.clone() };
    if let Some(runtime) = runtime {
        runtime.cancel.cancel("user aborted");
        let sink = TauriEventSink::new(app.clone());
        emit_agent_event_safe(
            &sink,
            Event::RunAborted {
                run_id: runtime.run_id.clone(),
                reason: "user aborted".to_string(),
            },
        );
    }

    {
        let mut is_running = state.is_running.lock().await;
        *is_running = false;
    }
    {
        let mut checkpoint = state.checkpoint.lock().await;
        *checkpoint = None;
    }
    {
        let mut runtime = state.runtime.lock().await;
        *runtime = None;
    }
    {
        let mut queue = state.queue.lock().await;
        queue.clear();
    }
    {
        let mut current_state = state.current_state.lock().await;
        if let Some(ref mut current) = *current_state {
            current.status = AgentStatus::Aborted;
        }
    }
    emit_queue_updated(&app, &state).await;

    Ok(())
}

/// 审批工具调用
#[tauri::command]
pub async fn agent_approve_tool(
    app: AppHandle,
    state: State<'_, AgentState>,
    request_id: String,
    approved: bool,
) -> Result<(), String> {
    println!(
        "[Agent] 收到审批响应: request_id={}, approved={}",
        request_id, approved
    );

    let runtime_state = {
        state
            .runtime
            .lock()
            .await
            .clone()
            .ok_or("No active Forge runtime")?
    };
    let checkpoint = {
        let mut checkpoint_lock = state.checkpoint.lock().await;
        checkpoint_lock
            .take()
            .ok_or("No pending approval checkpoint")?
    };

    let interrupt = checkpoint
        .interrupts
        .iter()
        .find(|item| item.id == request_id)
        .ok_or("Unknown permission request")?;
    let request: forge::runtime::permission::PermissionRequest =
        serde_json::from_value(interrupt.value.clone())
            .map_err(|e| format!("Invalid permission request payload: {}", e))?;
    let pattern = request
        .patterns
        .get(0)
        .cloned()
        .unwrap_or_else(|| request.permission.clone());

    let reply = if approved {
        PermissionReply::Once
    } else {
        PermissionReply::Reject
    };
    runtime_state
        .runtime
        .permissions
        .apply_reply(&request.permission, &pattern, reply.clone());

    let mut resumed_state = checkpoint.state;
    let mut pending_calls = checkpoint.pending_tool_calls;
    if matches!(reply, PermissionReply::Reject) {
        if let Some(rejected) = pending_calls.first() {
            resumed_state.messages.push(Message {
                role: MessageRole::Tool,
                content: format!("Tool {} rejected by user approval.", rejected.name),
                name: Some(rejected.name.clone()),
                tool_call_id: Some(rejected.id.clone()),
            });
        }
        if !pending_calls.is_empty() {
            pending_calls.remove(0);
        }
    }

    {
        let mut is_running = state.is_running.lock().await;
        *is_running = true;
    }
    {
        let mut current_state = state.current_state.lock().await;
        if let Some(ref mut current) = *current_state {
            current.status = AgentStatus::Running;
        }
    }
    emit_queue_updated(&app, &state).await;

    let sink = TauriEventSink::new(app.clone());
    emit_agent_event_safe(
        &sink,
        Event::PermissionReplied {
            permission: request.permission.clone(),
            reply: reply.clone(),
        },
    );
    emit_agent_event_safe(
        &sink,
        Event::RunResumed {
            run_id: runtime_state.run_id.clone(),
            checkpoint_id: checkpoint.checkpoint_id.clone(),
        },
    );

    let http_client = build_llm_http_client(&app).await?;
    let result = run_forge_loop(
        app.clone(),
        runtime_state.config.clone(),
        resumed_state,
        runtime_state.runtime.clone(),
        pending_calls,
        runtime_state.session_id.clone(),
        runtime_state.message_id.clone(),
        runtime_state.cancel.clone(),
        http_client,
    )
    .await;

    let handled = handle_forge_result(app.clone(), &state, runtime_state, result).await;
    match handled {
        Ok(finished) => {
            if finished {
                drain_queued_tasks(app, &state).await;
            }
        }
        Err(err) => {
            drain_queued_tasks(app.clone(), &state).await;
            return Err(err);
        }
    }

    Ok(())
}

/// 获取 Agent 状态
#[tauri::command]
pub async fn agent_get_status(state: State<'_, AgentState>) -> Result<AgentStatus, String> {
    let current_state = state.current_state.lock().await;
    if let Some(current) = current_state.as_ref() {
        return Ok(current.status.clone());
    }
    Ok(AgentStatus::Idle)
}

/// 获取 Agent 任务队列状态
#[tauri::command]
pub async fn agent_get_queue_status(
    state: State<'_, AgentState>,
) -> Result<AgentQueueSnapshot, String> {
    Ok(build_queue_snapshot(&state).await)
}

/// 继续任务（用户回答问题后）
#[tauri::command]
pub async fn agent_continue_with_answer(
    app: AppHandle,
    state: State<'_, AgentState>,
    answer: String,
) -> Result<(), String> {
    let runtime_state = {
        state
            .runtime
            .lock()
            .await
            .clone()
            .ok_or("No active Forge runtime")?
    };

    let resumed_state = {
        let mut current_state = state.current_state.lock().await;
        let graph = current_state
            .as_mut()
            .ok_or("No active graph state to continue")?;
        graph.messages.push(Message {
            role: MessageRole::User,
            content: answer,
            name: None,
            tool_call_id: None,
        });
        graph.status = AgentStatus::Running;
        graph.clone()
    };

    {
        let mut is_running = state.is_running.lock().await;
        *is_running = true;
    }
    emit_queue_updated(&app, &state).await;

    let http_client = build_llm_http_client(&app).await?;
    let result = run_forge_loop(
        app.clone(),
        runtime_state.config.clone(),
        resumed_state,
        runtime_state.runtime.clone(),
        Vec::new(),
        runtime_state.session_id.clone(),
        runtime_state.message_id.clone(),
        runtime_state.cancel.clone(),
        http_client,
    )
    .await;

    let handled = handle_forge_result(app.clone(), &state, runtime_state, result).await?;
    if handled {
        drain_queued_tasks(app, &state).await;
    }
    Ok(())
}

// ============ Vault 命令 ============

/// 初始化 vault 结构
#[tauri::command]
pub async fn vault_initialize(workspace_path: String) -> Result<(), String> {
    vault::initialize_vault(&workspace_path)?;
    Ok(())
}

/// 加载 vault 索引
#[tauri::command]
pub async fn vault_load_index(workspace_path: String) -> Result<String, String> {
    let config = vault::load_vault_config(&workspace_path)?;
    let index_path = config.index_path();
    std::fs::read_to_string(&index_path)
        .map_err(|e| format!("Failed to read vault index: {}", e))
}

/// 运行 vault 结构化检查
#[tauri::command]
pub async fn vault_run_lint(workspace_path: String) -> Result<vault::LintReport, String> {
    Ok(vault::run_structural_lint(&workspace_path))
}

// ============ 内部辅助函数 ============

fn build_permission_session(auto_approve: bool) -> Arc<LocalPermissionSession> {
    if auto_approve {
        Arc::new(LocalPermissionSession::new(vec![PermissionRule::new(
            "*",
            "*",
            PermissionDecision::Allow,
        )]))
    } else {
        Arc::new(LocalPermissionSession::new(default_ruleset()))
    }
}

fn build_initial_messages(
    app: &AppHandle,
    task: &str,
    context: &TaskContext,
    provider: &str,
) -> (Vec<Message>, PromptStackSnapshot) {
    let base_system = base_system_prompt(provider).to_string();
    let system_prompt = build_system_prompt(context, provider);
    let built_in_agent = load_builtin_agent_instructions(app);
    let workspace_agent = load_workspace_agent_instructions(&context.workspace_path)
        .unwrap_or_else(|| WORKSPACE_AGENT_TEMPLATE.to_string());

    let mut messages = Vec::new();
    messages.push(Message {
        role: MessageRole::System,
        content: system_prompt.clone(),
        name: None,
        tool_call_id: None,
    });
    messages.push(Message {
        role: MessageRole::System,
        content: built_in_agent.clone(),
        name: None,
        tool_call_id: None,
    });
    messages.push(Message {
        role: MessageRole::System,
        content: workspace_agent.clone(),
        name: None,
        tool_call_id: None,
    });

    // Inject wiki context from vault
    let wiki_prompt = vault::build_wiki_system_prompt(&context.workspace_path);
    if !wiki_prompt.trim().is_empty() {
        messages.push(Message {
            role: MessageRole::System,
            content: wiki_prompt,
            name: None,
            tool_call_id: None,
        });
    }

    messages.extend(context.history.clone());
    messages.push(Message {
        role: MessageRole::User,
        content: task.to_string(),
        name: None,
        tool_call_id: None,
    });
    (
        messages,
        PromptStackSnapshot {
            provider: provider.to_string(),
            base_system,
            system_prompt,
            built_in_agent,
            workspace_agent,
        },
    )
}

const PROMPT_DEFAULT: &str =
    "You are Lumina, a note assistant. Use the provided tools to read or edit files when needed. Be concise and accurate. Stop calling tools once the task is complete and provide a final answer. If repeated tool calls do not produce new information, ask a clarification question and stop.";
const PROMPT_OPENAI: &str =
    "You are Lumina, a note assistant. Use tools to inspect files and make edits; do not guess. Be concise, accurate, and action-oriented. Stop tool use when the task is complete. Do not repeat the same tool call with the same input; if blocked, ask for clarification and stop.";
const PROMPT_ANTHROPIC: &str =
    "You are Lumina, a note assistant. Prefer clarifying questions when requirements are ambiguous, then use tools to read or edit files. Be concise and accurate. Stop tool calls when you can provide the final response. If repeated tool attempts are not progressing, ask one clear question and stop.";
const PROMPT_GEMINI: &str =
    "You are Lumina, a note assistant. Keep responses brief and structured. Use tools to read or edit files when needed and avoid guessing. Finish with a final response once done, and avoid repeated identical tool calls.";
const PROMPT_OLLAMA: &str =
    "You are Lumina, a note assistant. Keep responses brief and avoid unnecessary tool calls. Use tools to read or edit files when needed and avoid guessing. Stop tool use once complete, and ask for clarification instead of looping on the same tool input.";
const WORKSPACE_AGENT_TEMPLATE: &str = r#"Workspace instructions (editable):
- Add project-specific conventions here.
- Keep this file short and concrete.
- Prefer constraints that are specific to this workspace.
- Do not duplicate global system rules.
"#;
const BUILTIN_AGENT_INSTRUCTIONS: &str = include_str!("../../resources/agent/AGENT.md");

fn base_system_prompt(provider: &str) -> &'static str {
    match provider {
        "openai" => PROMPT_OPENAI,
        "anthropic" => PROMPT_ANTHROPIC,
        "gemini" => PROMPT_GEMINI,
        "ollama" => PROMPT_OLLAMA,
        "deepseek" | "moonshot" | "zai" | "groq" => PROMPT_OPENAI,
        _ => PROMPT_DEFAULT,
    }
}

fn build_system_prompt(context: &TaskContext, provider: &str) -> String {
    let mut lines = vec![
        "# Runtime Context".to_string(),
        format!("- Provider family: {}", provider),
        format!("- Workspace: {}", context.workspace_path),
    ];
    if let Some(path) = context.active_note_path.as_deref() {
        lines.push(format!("- Active note: {}", path));
    }
    lines.push(format!(
        "- Attached history messages: {}",
        context.history.len()
    ));
    if let Some(tree) = context.file_tree.as_deref() {
        lines.push("\n## File Tree Snapshot".to_string());
        lines.push(tree.to_string());
    }
    format!("{}\n\n{}", base_system_prompt(provider), lines.join("\n"))
}

fn normalized_template(input: &str) -> String {
    input.replace("\r\n", "\n").trim().to_string()
}

fn load_builtin_agent_instructions(_app: &AppHandle) -> String {
    normalized_template(BUILTIN_AGENT_INSTRUCTIONS)
}

fn load_workspace_agent_instructions(workspace_path: &str) -> Option<String> {
    if workspace_path.trim().is_empty() {
        return Some(WORKSPACE_AGENT_TEMPLATE.to_string());
    }

    let dir = Path::new(workspace_path).join(".lumina");
    let file_path = dir.join("AGENT.md");
    if file_path.exists() {
        return match fs::read_to_string(&file_path) {
            Ok(content) => Some(content),
            Err(err) => {
                eprintln!("[Agent] Failed to read AGENT.md: {}", err);
                None
            }
        };
    }
    if let Err(err) = fs::create_dir_all(&dir) {
        eprintln!("[Agent] Failed to create .lumina dir: {}", err);
        return Some(WORKSPACE_AGENT_TEMPLATE.to_string());
    }
    if let Err(err) = fs::write(&file_path, WORKSPACE_AGENT_TEMPLATE) {
        eprintln!("[Agent] Failed to write AGENT.md: {}", err);
    }
    Some(WORKSPACE_AGENT_TEMPLATE.to_string())
}

async fn handle_forge_result(
    app: AppHandle,
    state: &AgentState,
    runtime_state: ForgeRuntimeState,
    result: Result<ForgeRunResult, String>,
) -> Result<bool, String> {
    let sink = TauriEventSink::new(app.clone());
    match result {
        Ok(run) => {
            let mut final_state = run.state;
            if let Some(pending) = run.pending {
                final_state.status = AgentStatus::WaitingApproval;
                let checkpoint_id = Uuid::new_v4().to_string();
                {
                    let mut checkpoint_lock = state.checkpoint.lock().await;
                    *checkpoint_lock = Some(ForgeCheckpoint {
                        checkpoint_id: checkpoint_id.clone(),
                        state: final_state.clone(),
                        pending_tool_calls: pending.pending_tool_calls,
                        interrupts: pending.interrupts,
                    });
                }
                {
                    let mut current_state = state.current_state.lock().await;
                    *current_state = Some(final_state);
                }
                emit_agent_event_safe(
                    &sink,
                    Event::RunPaused {
                        run_id: runtime_state.run_id.clone(),
                        checkpoint_id,
                    },
                );
                emit_queue_updated(&app, state).await;
                return Ok(false);
            }

            final_state.status = AgentStatus::Completed;
            {
                let mut current_state = state.current_state.lock().await;
                *current_state = Some(final_state);
            }
            emit_agent_event_safe(
                &sink,
                Event::RunCompleted {
                    run_id: runtime_state.run_id.clone(),
                    status: RunStatus::Completed,
                },
            );
        }
        Err(err) => {
            emit_agent_event_safe(
                &sink,
                Event::RunFailed {
                    run_id: runtime_state.run_id.clone(),
                    error: err.clone(),
                },
            );
            {
                let mut current_state = state.current_state.lock().await;
                if let Some(ref mut current) = *current_state {
                    current.status = AgentStatus::Error;
                }
            }
            {
                let mut is_running = state.is_running.lock().await;
                *is_running = false;
            }
            {
                let mut runtime = state.runtime.lock().await;
                *runtime = None;
            }
            emit_queue_updated(&app, state).await;
            return Err(err);
        }
    }

    {
        let mut is_running = state.is_running.lock().await;
        *is_running = false;
    }
    {
        let mut runtime = state.runtime.lock().await;
        *runtime = None;
    }
    {
        let mut checkpoint = state.checkpoint.lock().await;
        *checkpoint = None;
    }
    emit_queue_updated(&app, state).await;

    Ok(true)
}

// ============ 调试命令 ============

/// 启用 Agent 调试模式
#[tauri::command]
pub fn agent_enable_debug(workspace_path: String) -> Result<String, String> {
    use crate::agent::debug_log;

    let path = debug_log::enable_debug(&workspace_path)?;
    Ok(path.to_string_lossy().to_string())
}

/// 禁用 Agent 调试模式
#[tauri::command]
pub fn agent_disable_debug() -> Result<(), String> {
    use crate::agent::debug_log;

    debug_log::disable_debug();
    Ok(())
}

/// 检查调试模式是否启用
#[tauri::command]
pub fn agent_is_debug_enabled() -> bool {
    use crate::agent::debug_log;

    debug_log::is_debug_enabled()
}

/// 获取当前调试日志路径
#[tauri::command]
pub fn agent_get_debug_log_path() -> Option<String> {
    use crate::agent::debug_log;

    debug_log::get_debug_file_path().map(|p| p.to_string_lossy().to_string())
}
