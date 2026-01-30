//! Agent Tauri 命令
//! 
//! 前端调用的 Agent API
//! 
//! 使用 Forge LoopNode 构建和执行 Agent 循环

use crate::agent::deep_research::{
    build_deep_research_graph, DeepResearchConfig, DeepResearchContext, DeepResearchEvent,
    DeepResearchRequest, DeepResearchState, ResearchPhase,
};
use crate::agent::forge_loop::{build_runtime, run_forge_loop, ForgeRunResult, ForgeRuntime, TauriEventSink};
use crate::agent::skills::{list_skills, read_skill, SkillDetail, SkillInfo};
use crate::agent::types::*;
use crate::forge_runtime::permissions::{default_ruleset, PermissionRule, PermissionSession as LocalPermissionSession};
use crate::langgraph::error::ResumeCommand;
use crate::langgraph::executor::{Checkpoint, ExecutionResult};
use crate::mobile_gateway::emit_agent_event;
use forge::runtime::cancel::CancellationToken;
use forge::runtime::error::Interrupt;
use forge::runtime::event::{Event, EventSink, PermissionReply};
use forge::runtime::permission::PermissionDecision;
use forge::runtime::session_state::RunStatus;
use std::sync::Arc;
use tauri::{AppHandle, State};
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

/// Agent 状态管理
pub struct AgentState {
    current_state: Arc<Mutex<Option<GraphState>>>,
    is_running: Arc<Mutex<bool>>,
    runtime: Arc<Mutex<Option<ForgeRuntimeState>>>,
    checkpoint: Arc<Mutex<Option<ForgeCheckpoint>>>,
}

impl AgentState {
    pub fn new() -> Self {
        Self {
            current_state: Arc::new(Mutex::new(None)),
            is_running: Arc::new(Mutex::new(false)),
            runtime: Arc::new(Mutex::new(None)),
            checkpoint: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for AgentState {
    fn default() -> Self {
        Self::new()
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
    // 检查是否已在运行
    {
        let mut is_running = state.is_running.lock().await;
        if *is_running {
            return Err("Agent is already running".to_string());
        }
        *is_running = true;
    }

    // 调试日志：记录配置和任务
    {
        use crate::agent::debug_log as dbg;
        dbg::log_config(&config.provider, &config.model, config.temperature);
        dbg::log_task(&task);
        dbg::log_skills(&context.skills);
    }
    
    // 构建初始状态（使用前端传入的历史消息）
    let messages = build_initial_messages(&task, &context);
    let initial_state = GraphState {
        messages,
        user_task: task.clone(),
        workspace_path: context.workspace_path,
        active_note_path: context.active_note_path,
        active_note_content: context.active_note_content,
        file_tree: context.file_tree,
        rag_results: context.rag_results,
        resolved_links: context.resolved_links,
        intent: TaskIntent::default(),
        current_plan: None,
        plan_iterations: 0,
        current_step_index: 0,
        observations: vec![],
        final_result: None,
        goto: String::new(), // 空字符串，让图从 START 开始
        auto_approve: config.auto_approve,
        status: AgentStatus::Running,
        error: None,
    };

    {
        let mut current_state = state.current_state.lock().await;
        *current_state = Some(initial_state.clone());
    }

    let permissions = build_permission_session(config.auto_approve);
    let runtime = build_runtime(&initial_state.workspace_path, permissions);
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
    sink.emit(Event::RunStarted {
        run_id: runtime_state.run_id.clone(),
        status: RunStatus::Running,
    });

    let result = run_forge_loop(
        app.clone(),
        config,
        initial_state,
        runtime_state.runtime.clone(),
        Vec::new(),
        runtime_state.session_id.clone(),
        runtime_state.message_id.clone(),
        runtime_state.cancel.clone(),
    )
    .await;

    handle_forge_result(app.clone(), state, runtime_state, result).await?;

    Ok(())
}

/// 中止 Agent 任务
#[tauri::command]
pub async fn agent_abort(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<(), String> {
    let runtime = { state.runtime.lock().await.clone() };
    if let Some(runtime) = runtime {
        runtime.cancel.cancel("user aborted");
        let sink = TauriEventSink::new(app.clone());
        sink.emit(Event::RunAborted {
            run_id: runtime.run_id.clone(),
            reason: "user aborted".to_string(),
        });
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
        let mut current_state = state.current_state.lock().await;
        if let Some(ref mut current) = *current_state {
            current.status = AgentStatus::Aborted;
        }
    }

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
    println!("[Agent] 收到审批响应: request_id={}, approved={}", request_id, approved);

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
                role: MessageRole::User,
                content: format!("用户拒绝授权工具 {}。", rejected.name),
                name: None,
                tool_call_id: None,
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

    let sink = TauriEventSink::new(app.clone());
    sink.emit(Event::PermissionReplied {
        permission: request.permission.clone(),
        reply: reply.clone(),
    });
    sink.emit(Event::RunResumed {
        run_id: runtime_state.run_id.clone(),
        checkpoint_id: checkpoint.checkpoint_id.clone(),
    });

    let result = run_forge_loop(
        app.clone(),
        runtime_state.config.clone(),
        resumed_state,
        runtime_state.runtime.clone(),
        pending_calls,
        runtime_state.session_id.clone(),
        runtime_state.message_id.clone(),
        runtime_state.cancel.clone(),
    )
    .await;

    handle_forge_result(app.clone(), state, runtime_state, result).await?;

    Ok(())
}

/// 获取 Agent 状态
#[tauri::command]
pub async fn agent_get_status(
    state: State<'_, AgentState>,
) -> Result<AgentStatus, String> {
    let current_state = state.current_state.lock().await;
    if let Some(current) = current_state.as_ref() {
        return Ok(current.status.clone());
    }
    Ok(AgentStatus::Idle)
}

/// 继续任务（用户回答问题后）
#[tauri::command]
pub async fn agent_continue_with_answer(
    app: AppHandle,
    _state: State<'_, AgentState>,
    answer: String,
) -> Result<(), String> {
    // TODO: 实现用户回答后继续执行
    // 这需要在状态机中支持暂停和恢复
    
    emit_agent_event(
        &app,
        AgentEvent::MessageChunk {
            content: format!("用户回答: {}", answer),
            agent: AgentType::Coordinator,
        },
    );

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

fn build_initial_messages(task: &str, context: &TaskContext) -> Vec<Message> {
    let mut messages = Vec::new();
    messages.push(Message {
        role: MessageRole::System,
        content: build_system_prompt(context),
        name: None,
        tool_call_id: None,
    });
    if !context.skills.is_empty() {
        messages.extend(build_skill_messages(&context.skills));
    }
    messages.extend(context.history.clone());
    messages.push(Message {
        role: MessageRole::User,
        content: task.to_string(),
        name: None,
        tool_call_id: None,
    });
    messages
}

fn build_skill_messages(skills: &[SkillContext]) -> Vec<Message> {
    skills
        .iter()
        .map(|skill| {
            let title = skill.title.as_deref().unwrap_or(&skill.name);
            let mut content = format!("Skill: {} ({})\n", title, skill.name);
            if let Some(desc) = skill.description.as_deref() {
                content.push_str(&format!("Description: {}\n", desc));
            }
            if let Some(source) = skill.source.as_deref() {
                content.push_str(&format!("Source: {}\n", source));
            }
            content.push_str("Instructions:\n");
            content.push_str(&skill.prompt);
            Message {
                role: MessageRole::System,
                content,
                name: None,
                tool_call_id: None,
            }
        })
        .collect()
}

fn build_system_prompt(context: &TaskContext) -> String {
    let mut prompt = String::from(
        "You are Lumina, a note assistant. Use the provided tools to read or edit files when needed. Be concise and accurate.",
    );
    prompt.push_str(&format!("\nWorkspace: {}", context.workspace_path));
    if let Some(path) = context.active_note_path.as_deref() {
        prompt.push_str(&format!("\nActive note: {}", path));
    }
    if let Some(tree) = context.file_tree.as_deref() {
        prompt.push_str("\nFile tree:\n");
        prompt.push_str(tree);
    }
    prompt
}

async fn handle_forge_result(
    app: AppHandle,
    state: State<'_, AgentState>,
    runtime_state: ForgeRuntimeState,
    result: Result<ForgeRunResult, String>,
) -> Result<(), String> {
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
                sink.emit(Event::RunPaused {
                    run_id: runtime_state.run_id.clone(),
                    checkpoint_id,
                });
                return Ok(());
            }

            final_state.status = AgentStatus::Completed;
            {
                let mut current_state = state.current_state.lock().await;
                *current_state = Some(final_state);
            }
            sink.emit(Event::RunCompleted {
                run_id: runtime_state.run_id.clone(),
                status: RunStatus::Completed,
            });
        }
        Err(err) => {
            sink.emit(Event::RunFailed {
                run_id: runtime_state.run_id.clone(),
                error: err.clone(),
            });
            {
                let mut current_state = state.current_state.lock().await;
                if let Some(ref mut current) = *current_state {
                    current.status = AgentStatus::Error;
                    current.error = Some(err.clone());
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

    Ok(())
}

// ============ Deep Research 状态管理 ============

/// Deep Research 状态管理
pub struct DeepResearchStateManager {
    is_running: Arc<Mutex<bool>>,
    /// 保存中断时的检查点（用于恢复执行）
    checkpoint: Arc<Mutex<Option<Checkpoint<DeepResearchState>>>>,
    /// 保存当前配置（用于恢复时重建图）
    current_config: Arc<Mutex<Option<DeepResearchConfig>>>,
}

impl DeepResearchStateManager {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(Mutex::new(false)),
            checkpoint: Arc::new(Mutex::new(None)),
            current_config: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for DeepResearchStateManager {
    fn default() -> Self {
        Self::new()
    }
}

// ============ Deep Research 命令 ============

/// 启动 Deep Research 任务
#[tauri::command]
pub async fn deep_research_start(
    app: AppHandle,
    state: State<'_, DeepResearchStateManager>,
    config: DeepResearchConfig,
    request: DeepResearchRequest,
) -> Result<(), String> {
    // 检查是否已在运行
    {
        let mut is_running = state.is_running.lock().await;
        if *is_running {
            return Err("Deep Research is already running".to_string());
        }
        *is_running = true;
    }

    // 判断搜索模式：如果有预搜索结果则用语义搜索，否则用关键词搜索
    let search_mode = if !request.pre_searched_notes.is_empty() {
        crate::agent::deep_research::SearchMode::Semantic
    } else {
        crate::agent::deep_research::SearchMode::Keyword
    };

    // 构建初始状态
    let initial_state = DeepResearchState {
        topic: request.topic,
        workspace_path: request.workspace_path,
        search_scope: request.search_scope,
        search_mode,
        pre_searched_notes: request.pre_searched_notes,
        phase: ResearchPhase::Init,
        keywords: vec![],
        found_notes: vec![],
        web_search_results: vec![],
        crawled_pages: vec![],
        read_notes: vec![],
        outline: None,
        report: None,
        report_chunks: vec![],
        goto: String::new(),
        error: None,
        clarification: None,  // 澄清字段，interrupt 恢复后填充
    };

    // 发送开始事件
    let _ = app.emit("deep-research-event", DeepResearchEvent::PhaseChange {
        phase: ResearchPhase::Init,
        message: "开始深度研究...".to_string(),
    });

    // 创建配置，合并请求中的选项
    let mut final_config = config;
    final_config.report_style = request.report_style;
    final_config.include_citations = request.include_citations;

    // 保存配置（用于 resume 时重建图）
    {
        let mut config_lock = state.current_config.lock().await;
        *config_lock = Some(final_config.clone());
    }

    // 异步执行研究
    let app_clone = app.clone();
    let state_is_running = state.is_running.clone();
    let state_checkpoint = state.checkpoint.clone();
    
    tokio::spawn(async move {
        let result = run_deep_research_resumable(
            app_clone.clone(), 
            final_config, 
            initial_state,
            state_checkpoint.clone(),
        ).await;
        
        match result {
            Ok(exec_result) => {
                match exec_result {
                    ExecutionResult::Complete(_final_state) => {
                        // 成功完成（事件已在节点中发送）
                        let mut is_running = state_is_running.lock().await;
                        *is_running = false;
                    }
                    ExecutionResult::Interrupted { checkpoint, interrupts: _ } => {
                        // 保存检查点，等待用户输入
                        let mut cp_lock = state_checkpoint.lock().await;
                        *cp_lock = Some(checkpoint);
                        // 中断时也设为 false，因为研究已暂停
                        // resume 时会重新设为 true
                        let mut is_running = state_is_running.lock().await;
                        *is_running = false;
                    }
                }
            }
            Err(e) => {
                let _ = app_clone.emit("deep-research-event", DeepResearchEvent::Error {
                    message: e,
                });
                let mut is_running = state_is_running.lock().await;
                *is_running = false;
            }
        }
    });

    Ok(())
}

/// 执行 Deep Research（支持中断/恢复）
async fn run_deep_research_resumable(
    app: AppHandle,
    config: DeepResearchConfig,
    initial_state: DeepResearchState,
    _checkpoint_store: Arc<Mutex<Option<Checkpoint<DeepResearchState>>>>,
) -> Result<ExecutionResult<DeepResearchState>, String> {
    // 创建执行上下文
    let ctx = DeepResearchContext::new(app, config.clone());
    
    // 构建图
    let graph = build_deep_research_graph(ctx)
        .map_err(|e| format!("Failed to build deep research graph: {}", e))?;
    
    // 配置并执行
    let graph = graph
        .with_max_iterations(20)
        .with_debug(false);
    
    // 使用可中断执行
    graph.invoke_resumable(initial_state).await
        .map_err(|e| format!("Deep research execution error: {}", e))
}

/// 恢复 Deep Research 任务（用户提供澄清后）
#[tauri::command]
pub async fn deep_research_resume(
    app: AppHandle,
    state: State<'_, DeepResearchStateManager>,
    clarification: String,
) -> Result<(), String> {
    // 获取保存的检查点和配置
    let checkpoint = {
        let mut cp_lock = state.checkpoint.lock().await;
        cp_lock.take()
    };
    
    let config = {
        let config_lock = state.current_config.lock().await;
        config_lock.clone()
    };
    
    let checkpoint = checkpoint.ok_or("No checkpoint found. Research may not be in clarification state.")?;
    let config = config.ok_or("No config found.")?;
    
    // 设置为运行中
    {
        let mut is_running = state.is_running.lock().await;
        *is_running = true;
    }
    
    // 更新状态，添加用户澄清
    let mut resumed_state = checkpoint.state.clone();
    resumed_state.clarification = Some(clarification.clone());
    resumed_state.phase = ResearchPhase::AnalyzingTopic;  // 重新进入分析阶段
    
    // 创建新的检查点
    let resumed_checkpoint = Checkpoint {
        state: resumed_state,
        next_node: checkpoint.next_node,
        pending_interrupts: vec![],  // 清空中断
        iterations: checkpoint.iterations,
        resume_values: checkpoint.resume_values,
    };
    
    // 发送恢复事件
    let _ = app.emit("deep-research-event", DeepResearchEvent::PhaseChange {
        phase: ResearchPhase::AnalyzingTopic,
        message: format!("收到用户澄清，继续研究: {}", clarification),
    });
    
    // 异步恢复执行
    let app_clone = app.clone();
    let state_is_running = state.is_running.clone();
    let state_checkpoint = state.checkpoint.clone();
    
    tokio::spawn(async move {
        // 创建执行上下文
        let ctx = DeepResearchContext::new(app_clone.clone(), config.clone());
        
        // 构建图
        let graph = match build_deep_research_graph(ctx) {
            Ok(g) => g.with_max_iterations(20).with_debug(false),
            Err(e) => {
                let _ = app_clone.emit("deep-research-event", DeepResearchEvent::Error {
                    message: format!("Failed to rebuild graph: {}", e),
                });
                return;
            }
        };
        
        // 恢复执行
        let resume_cmd = ResumeCommand::new(clarification);
        let result = graph.resume(resumed_checkpoint, resume_cmd).await;
        
        match result {
            Ok(exec_result) => {
                match exec_result {
                    ExecutionResult::Complete(_final_state) => {
                        // 成功完成
                        let mut is_running = state_is_running.lock().await;
                        *is_running = false;
                    }
                    ExecutionResult::Interrupted { checkpoint, interrupts: _ } => {
                        // 又一次中断（可能需要更多澄清）
                        let mut cp_lock = state_checkpoint.lock().await;
                        *cp_lock = Some(checkpoint);
                    }
                }
            }
            Err(e) => {
                let _ = app_clone.emit("deep-research-event", DeepResearchEvent::Error {
                    message: format!("Resume error: {}", e),
                });
                let mut is_running = state_is_running.lock().await;
                *is_running = false;
            }
        }
    });
    
    Ok(())
}

/// 中止 Deep Research 任务
#[tauri::command]
pub async fn deep_research_abort(
    app: AppHandle,
    state: State<'_, DeepResearchStateManager>,
) -> Result<(), String> {
    // 清空检查点
    {
        let mut cp_lock = state.checkpoint.lock().await;
        *cp_lock = None;
    }
    
    {
        let mut is_running = state.is_running.lock().await;
        if !*is_running {
            return Ok(());
        }
        *is_running = false;
    }

    // 发送中止事件
    let _ = app.emit("deep-research-event", DeepResearchEvent::Error {
        message: "研究已被中止".to_string(),
    });

    Ok(())
}

/// 获取 Deep Research 运行状态
#[tauri::command]
pub async fn deep_research_is_running(
    state: State<'_, DeepResearchStateManager>,
) -> Result<bool, String> {
    let is_running = state.is_running.lock().await;
    Ok(*is_running)
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
