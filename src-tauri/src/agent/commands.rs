//! Agent Tauri 命令
//!
//! 前端调用的 Agent API
//!
//! 使用 Forge LoopNode 构建和执行 Agent 循环

use crate::agent::explore::run_explore;
use crate::agent::forge_loop::{
    build_runtime_with_client, run_forge_loop, ForgeRunResult, ForgeRuntime, TauriEventSink,
};
use crate::agent::orchestrator::{
    apply_verification_result_to_report, build_initial_graph_state_with_decision,
    mark_run_completed, mark_run_failed, mark_waiting_for_approval, plan_orchestration,
    prepare_for_forge_execution, resolve_runtime_config, OrchestrationDecision,
};
use crate::agent::plan::{mark_stage_completed, run_plan, sync_plan_statuses};
use crate::agent::skills::{list_skills, read_skill, SkillDetail, SkillInfo};
use crate::agent::types::*;
use crate::agent::verify::run_verify;
use crate::forge_runtime::permissions::{
    default_ruleset, PermissionRule, PermissionSession as LocalPermissionSession,
};
use crate::mobile_gateway::{emit_agent_event, MobileGatewayState};
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
    role_prompt: String,
    built_in_agent: String,
    workspace_agent: String,
    skills_index: Option<String>,
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
    out.push('…');
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

fn emit_orchestration_updated(app: &AppHandle, graph_state: &GraphState) {
    emit_agent_event(
        app,
        AgentEvent::OrchestrationUpdated {
            mode: graph_state.orchestration.mode.clone(),
            stage: graph_state.orchestration.current_stage.clone(),
            stages: graph_state.orchestration.stages.clone(),
            fallback_reason: graph_state.orchestration.fallback_reason.clone(),
        },
    );
}

fn emit_plan_updated_if_present(app: &AppHandle, graph_state: &GraphState) {
    if let Some(plan) = graph_state.plan.current_plan.clone() {
        emit_agent_event(app, AgentEvent::PlanUpdated { plan });
    }
}

async fn enter_stage(
    app: &AppHandle,
    state: &AgentState,
    graph_state: &mut GraphState,
    stage: AgentStage,
) {
    if let Some(plan) = graph_state.plan.current_plan.as_mut() {
        sync_plan_statuses(plan, stage.clone());
    }
    graph_state.set_stage(stage);
    sync_graph_state(state, graph_state).await;
    emit_orchestration_updated(app, graph_state);
    emit_plan_updated_if_present(app, graph_state);
}

fn insert_execution_context_messages(state: &mut GraphState) {
    if state.orchestration.mode != AgentExecutionMode::Orchestrated {
        return;
    }

    let mut injected = Vec::new();
    if let Some(report) = state.explore.report.as_ref() {
        let key_locations = report
            .key_locations
            .iter()
            .map(|item| format!("- {} :: {}", item.file_path, item.reason))
            .collect::<Vec<_>>()
            .join("\n");
        let risks = report
            .risks
            .iter()
            .map(|item| format!("- {}", item))
            .collect::<Vec<_>>()
            .join("\n");
        injected.push(format!(
            "# Explore Report\n{}\n\n## Related Files\n{}\n\n## Key Locations\n{}\n\n## Risks\n{}",
            report.summary,
            if report.related_files.is_empty() {
                "(none)".to_string()
            } else {
                report
                    .related_files
                    .iter()
                    .map(|item| format!("- {}", item))
                    .collect::<Vec<_>>()
                    .join("\n")
            },
            if key_locations.is_empty() {
                "(none)".to_string()
            } else {
                key_locations
            },
            if risks.is_empty() {
                "(none)".to_string()
            } else {
                risks
            }
        ));
    }

    if let Some(plan) = state.plan.current_plan.as_ref() {
        let steps = plan
            .steps
            .iter()
            .map(|step| {
                let artifacts = if step.expected_artifacts.is_empty() {
                    String::new()
                } else {
                    format!(" | artifacts: {}", step.expected_artifacts.join(", "))
                };
                format!(
                    "- [{}] {}{} ",
                    stage_label(&step.role),
                    step.step,
                    artifacts
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        injected.push(format!(
            "# Approved Plan\n{}\n\n{}",
            plan.explanation
                .clone()
                .unwrap_or_else(|| "Follow this plan before introducing extra scope.".to_string()),
            steps
        ));
    }

    if injected.is_empty() {
        return;
    }

    let insert_at = state
        .messages
        .iter()
        .rposition(|message| message.role == MessageRole::User)
        .unwrap_or(state.messages.len());
    for (offset, content) in injected.into_iter().enumerate() {
        state.messages.insert(
            insert_at + offset,
            Message {
                role: MessageRole::System,
                content,
                name: None,
                tool_call_id: None,
            },
        );
    }
}

fn stage_label(stage: &AgentStage) -> &'static str {
    match stage {
        AgentStage::Explore => "explore",
        AgentStage::Plan => "plan",
        AgentStage::Execute => "execute",
        AgentStage::Verify => "verify",
        AgentStage::Report => "report",
    }
}

async fn run_pre_execute_orchestration(
    app: &AppHandle,
    state: &AgentState,
    config: &AgentConfig,
    graph_state: &mut GraphState,
    http_client: reqwest::Client,
) {
    if graph_state.orchestration.mode != AgentExecutionMode::Orchestrated {
        prepare_for_forge_execution(graph_state);
        enter_stage(app, state, graph_state, AgentStage::Execute).await;
        return;
    }

    enter_stage(app, state, graph_state, AgentStage::Explore).await;
    let explore_report = run_explore(config, graph_state, http_client.clone()).await;
    graph_state.explore.report = Some(explore_report.clone());
    emit_agent_event(
        app,
        AgentEvent::ExploreUpdated {
            report: explore_report,
        },
    );
    sync_graph_state(state, graph_state).await;

    enter_stage(app, state, graph_state, AgentStage::Plan).await;
    graph_state.plan = run_plan(config, graph_state, http_client).await;
    if let Some(plan) = graph_state.plan.current_plan.as_mut() {
        mark_stage_completed(plan, AgentStage::Explore);
        mark_stage_completed(plan, AgentStage::Plan);
        sync_plan_statuses(plan, AgentStage::Execute);
    }
    emit_plan_updated_if_present(app, graph_state);
    sync_graph_state(state, graph_state).await;

    prepare_for_forge_execution(graph_state);
    insert_execution_context_messages(graph_state);
    enter_stage(app, state, graph_state, AgentStage::Execute).await;
}

async fn execute_task_inner(
    app: AppHandle,
    state: &AgentState,
    config: AgentConfig,
    task: String,
    context: TaskContext,
) -> Result<bool, String> {
    if let Some(mobile_state) = app.try_state::<MobileGatewayState>() {
        mobile_state
            .set_current_session_id(context.mobile_session_id.clone())
            .await;
    }

    {
        use crate::agent::debug_log as dbg;
        dbg::log_config(&config.provider, &config.model, config.temperature);
        dbg::log_task(&task);
        dbg::log_skills(&context.skills);
    }

    let orchestration_decision = plan_orchestration(&task, &context, config.execution_mode.clone());
    let (messages, prompt_stack) = build_initial_messages(
        &app,
        &task,
        &context,
        &config.provider,
        &orchestration_decision,
    );
    emit_agent_event(
        &app,
        AgentEvent::PromptStack {
            provider: prompt_stack.provider.clone(),
            base_system: prompt_stack.base_system.clone(),
            system_prompt: prompt_stack.system_prompt.clone(),
            role_prompt: prompt_stack.role_prompt.clone(),
            built_in_agent: prompt_stack.built_in_agent.clone(),
            workspace_agent: prompt_stack.workspace_agent.clone(),
            skills_index: prompt_stack.skills_index.clone(),
        },
    );
    let mut initial_state = build_initial_graph_state_with_decision(
        messages,
        task.clone(),
        context,
        &config,
        orchestration_decision,
    );
    let runtime_config = resolve_runtime_config(&config, &initial_state);

    sync_graph_state(state, &initial_state).await;
    emit_orchestration_updated(&app, &initial_state);
    emit_queue_updated(&app, state).await;

    let http_client = build_llm_http_client(&app).await?;
    run_pre_execute_orchestration(
        &app,
        state,
        &runtime_config,
        &mut initial_state,
        http_client.clone(),
    )
    .await;

    let permissions = build_permission_session(config.auto_approve);
    let proxy_client = app.state::<crate::proxy::ProxyState>().client().await;
    let runtime = build_runtime_with_client(
        initial_state.workspace_path(),
        permissions,
        Some(proxy_client),
    );
    let runtime_state = ForgeRuntimeState {
        config: runtime_config.clone(),
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
        runtime_config,
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

// ============ Skills 命令 ============

/// 列出可用 skills
#[tauri::command]
pub async fn agent_list_skills(
    app: AppHandle,
    workspace_path: Option<String>,
) -> Result<Vec<SkillInfo>, String> {
    Ok(list_skills(&app, workspace_path.as_deref()))
}

/// 读取 skill 详情
#[tauri::command]
pub async fn agent_read_skill(
    app: AppHandle,
    name: String,
    workspace_path: Option<String>,
) -> Result<SkillDetail, String> {
    read_skill(&app, workspace_path.as_deref(), &name)
}

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
    decision: &OrchestrationDecision,
) -> (Vec<Message>, PromptStackSnapshot) {
    let base_system = base_system_prompt(provider).to_string();
    let system_prompt = build_system_prompt(context, provider);
    let role_prompt = build_role_prompt(decision);
    let built_in_agent = load_builtin_agent_instructions(app);
    let workspace_agent = load_workspace_agent_instructions(&context.workspace_path)
        .unwrap_or_else(|| WORKSPACE_AGENT_TEMPLATE.to_string());
    let skills_index = build_skills_index_content(&context.skills);

    let mut messages = Vec::new();
    messages.push(Message {
        role: MessageRole::System,
        content: system_prompt.clone(),
        name: None,
        tool_call_id: None,
    });
    messages.push(Message {
        role: MessageRole::System,
        content: role_prompt.clone(),
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
    if let Some(skills_content) = skills_index.clone() {
        messages.push(Message {
            role: MessageRole::System,
            content: skills_content,
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
            role_prompt,
            built_in_agent,
            workspace_agent,
            skills_index,
        },
    )
}

fn build_skills_index_content(skills: &[SkillContext]) -> Option<String> {
    if skills.is_empty() {
        return None;
    }

    let mut content = String::from(
        "Selected skills index (metadata only):\n\
- Only name/title/description/source are provided here.\n\
- Do not assume full skill instructions from this index.\n\
- If a skill is needed, read the referenced skill file before applying detailed rules.\n\n\
Skills:\n",
    );

    for skill in skills {
        let title = skill.title.as_deref().unwrap_or(&skill.name);
        content.push_str(&format!("- {} ({})\n", title, skill.name));
        if let Some(desc) = skill.description.as_deref() {
            content.push_str(&format!("  description: {}\n", desc));
        }
        if let Some(source) = skill.source.as_deref() {
            content.push_str(&format!("  source: {}\n", source));
        }
    }

    Some(content)
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
const LEGACY_DEFAULT_AGENT_INSTRUCTIONS: &str = "Project instructions (edit this file as needed):\n- Follow existing note/project conventions.\n- Prefer minimal, correct changes.\n- Ask before making broad refactors.";
const PREVIOUS_DEFAULT_AGENT_INSTRUCTIONS_V1: &str = r#"Project instructions (edit this file as needed):
- Follow existing note/project conventions.
- Prefer minimal, correct changes.
- Ask before making broad refactors.

Flashcard generation rules:
- Trigger: when user asks to create flashcards / memory cards / Anki-style cards.
- Always write flashcards to `Flashcards/*.md` (one card per file unless user asks otherwise).
- Read source notes first if user gives source content or note paths.

Supported flashcard types:
- `basic`: fields `front`, `back`
- `basic-reversed`: fields `front`, `back`
- `cloze`: field `text` with cloze syntax such as `{{c1::answer}}`
- `mcq`: fields `question`, `options` (array), `answer` (0-based index), optional `explanation`
- `list`: fields `question`, `items` (array), `ordered` (boolean)

Required frontmatter format:
---
db: "flashcards"
type: "<basic|basic-reversed|cloze|mcq|list>"
deck: "Default"
ease: 2.5
interval: 0
repetitions: 0
due: "YYYY-MM-DD"
created: "YYYY-MM-DD"
---

Optional frontmatter:
- `source`
- `tags` (array)

Formatting constraints:
- Keep valid YAML frontmatter.
- Use YAML arrays for list-like fields.
- Keep body readable after frontmatter (question/answer or card content).
- After writing cards, read the created files once to verify required fields exist.
"#;
const PREVIOUS_DEFAULT_AGENT_INSTRUCTIONS_V2: &str = r#"Project instructions (edit this file as needed):
- Follow existing note/project conventions.
- Prefer minimal, correct changes.
- Ask before making broad refactors.

Database operation rules:
- Lumina databases are Dataview-style.
- Database definitions live at `Databases/<dbId>.db.json` (schema, columns, views, noteFolder).
- Rows are markdown notes. A note belongs to a database only when frontmatter `db` exactly equals `<dbId>`.
- Stable row identity is frontmatter `noteId` (do not rewrite it unless fixing missing/duplicate IDs).
- When creating a row note, include at least:
  - `db: "<dbId>"`
  - `noteId: "<stable id>"`
  - `title: "<row title>"`
  - `createdAt: "<ISO datetime>"`
  - `updatedAt: "<ISO datetime>"`
- Row values are persisted in frontmatter keys using column names (not internal column ids).
- Preferred row note directory:
  - Use `noteFolder` from `<dbId>.db.json` when present.
  - Otherwise use `Databases/<dbId>/`.
- For updates, always read the current note first and only patch necessary frontmatter fields.
- Keep YAML valid and preserve unknown fields. Avoid deleting `db`/`noteId` unless user explicitly asks.

Flashcard generation rules:
- Trigger: when user asks to create flashcards / memory cards / Anki-style cards.
- Always write flashcards to `Flashcards/*.md` (one card per file unless user asks otherwise).
- Read source notes first if user gives source content or note paths.

Supported flashcard types:
- `basic`: fields `front`, `back`
- `basic-reversed`: fields `front`, `back`
- `cloze`: field `text` with cloze syntax such as `{{c1::answer}}`
- `mcq`: fields `question`, `options` (array), `answer` (0-based index), optional `explanation`
- `list`: fields `question`, `items` (array), `ordered` (boolean)

Required frontmatter format:
---
db: "flashcards"
type: "<basic|basic-reversed|cloze|mcq|list>"
deck: "Default"
ease: 2.5
interval: 0
repetitions: 0
due: "YYYY-MM-DD"
created: "YYYY-MM-DD"
---

Optional frontmatter:
- `source`
- `tags` (array)

Formatting constraints:
- Keep valid YAML frontmatter.
- Use YAML arrays for list-like fields.
- Keep body readable after frontmatter (question/answer or card content).
- After writing cards, read the created files once to verify required fields exist.
"#;
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
    lines.push(format!("- Selected skills: {}", context.skills.len()));
    lines.push(format!(
        "- Retrieved note snippets: {}",
        context.rag_results.len()
    ));
    lines.push(format!(
        "- Resolved wikilinks: {}",
        context.resolved_links.len()
    ));
    if let Some(tree) = context.file_tree.as_deref() {
        lines.push("\n## File Tree Snapshot".to_string());
        lines.push(tree.to_string());
    }
    format!("{}\n\n{}", base_system_prompt(provider), lines.join("\n"))
}

fn build_role_prompt(decision: &OrchestrationDecision) -> String {
    match decision.mode {
        AgentExecutionMode::LegacySingleAgent => String::from(
            r#"# Role
You are Lumina's primary implementation agent.

Operate like a strong general-purpose coding assistant:
- Read before you edit
- Prefer minimal, correct changes over broad rewrites
- Use tools instead of guessing
- Stop once the requested work is complete
- If you are blocked by ambiguity, ask one precise clarification question"#
        ),
        AgentExecutionMode::Orchestrated => {
            let fallback_note = decision
                .fallback_reason
                .as_deref()
                .unwrap_or("The orchestration layer may temporarily collapse phases into one execution loop.");
            format!(
                r#"# Role
You are Lumina's execution agent inside a staged workflow inspired by Claude Code's layered agent prompts.

## Workflow Stages
- Explore: inspect the codebase and gather facts without editing
- Plan: turn findings into an implementation strategy
- Execute: make the smallest correct code changes
- Verify: check behavior with tests, builds, or direct inspection
- Report: summarize what changed, what was verified, and any remaining risk

## Current Assignment
You are handling the Execute phase.
- Assume upstream exploration/planning context may be partial
- Read enough context yourself before editing
- Leave the workspace in a state that is easy to verify
- Keep track of evidence that a later Verify/Report step can reuse

## Phase 1 Note
{}"#,
                fallback_note
            )
        }
        AgentExecutionMode::Auto => String::from(
            "# Role\nYou are Lumina's primary agent. Follow the active task with minimal, tool-grounded work."
        ),
    }
}

fn normalized_template(input: &str) -> String {
    input.replace("\r\n", "\n").trim().to_string()
}

fn should_upgrade_workspace_template(content: &str) -> bool {
    let normalized = normalized_template(content);
    normalized.is_empty()
        || normalized == normalized_template(LEGACY_DEFAULT_AGENT_INSTRUCTIONS)
        || normalized == normalized_template(PREVIOUS_DEFAULT_AGENT_INSTRUCTIONS_V1)
        || normalized == normalized_template(PREVIOUS_DEFAULT_AGENT_INSTRUCTIONS_V2)
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
            Ok(content) => {
                if should_upgrade_workspace_template(&content) {
                    if let Err(err) = fs::write(&file_path, WORKSPACE_AGENT_TEMPLATE) {
                        eprintln!("[Agent] Failed to upgrade AGENT.md: {}", err);
                        return Some(content);
                    }
                    return Some(WORKSPACE_AGENT_TEMPLATE.to_string());
                }
                Some(content)
            }
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
                mark_waiting_for_approval(&mut final_state);
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

            if final_state.orchestration.mode == AgentExecutionMode::Orchestrated {
                enter_stage(&app, state, &mut final_state, AgentStage::Verify).await;
                let verify_report = run_verify(
                    &runtime_state.config,
                    &final_state,
                    build_llm_http_client(&app).await?,
                )
                .await;
                final_state.verify.summary = Some(verify_report.summary.clone());
                final_state.verify.report = Some(verify_report.clone());
                emit_agent_event(
                    &app,
                    AgentEvent::VerificationUpdated {
                        report: verify_report,
                    },
                );
                apply_verification_result_to_report(&mut final_state);
                sync_graph_state(state, &final_state).await;
            }

            final_state.status = AgentStatus::Completed;
            if let Some(plan) = final_state.plan.current_plan.as_mut() {
                mark_stage_completed(plan, AgentStage::Execute);
                mark_stage_completed(plan, AgentStage::Verify);
            }
            mark_run_completed(&mut final_state);
            {
                let mut current_state = state.current_state.lock().await;
                *current_state = Some(final_state);
            }
            if let Some(current) = state.current_state.lock().await.clone() {
                emit_orchestration_updated(&app, &current);
                emit_plan_updated_if_present(&app, &current);
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
                    mark_run_failed(current, err.clone());
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
