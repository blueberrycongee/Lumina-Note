//! Agent Tauri 命令
//! 
//! 前端调用的 Agent API
//! 
//! 使用 langgraph-rust 框架构建和执行 Agent 图

use crate::agent::types::*;
use crate::agent::graph::{GraphExecutor, AgentContext, build_agent_graph};
use crate::agent::deep_research::{
    DeepResearchConfig, DeepResearchRequest, DeepResearchState,
    DeepResearchContext, DeepResearchEvent, ResearchPhase,
    build_deep_research_graph,
};
use crate::langgraph::executor::{Checkpoint, ExecutionResult};
use crate::langgraph::error::ResumeCommand;
use tauri::{AppHandle, Emitter, State};
use std::sync::Arc;
use tokio::sync::Mutex;

/// Agent 状态管理
pub struct AgentState {
    current_state: Arc<Mutex<Option<GraphState>>>,
    is_running: Arc<Mutex<bool>>,
}

impl AgentState {
    pub fn new() -> Self {
        Self {
            current_state: Arc::new(Mutex::new(None)),
            is_running: Arc::new(Mutex::new(false)),
        }
    }
}

impl Default for AgentState {
    fn default() -> Self {
        Self::new()
    }
}

/// 是否使用 langgraph-rust 框架执行
/// 设为 true 使用新的 langgraph-rust 框架，false 使用旧的直接实现
const USE_LANGGRAPH: bool = true;

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

    // 构建初始状态
    let initial_state = GraphState {
        messages: vec![],
        user_task: task,
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

    // 发送开始事件
    let _ = app.emit("agent-event", AgentEvent::StatusChange {
        status: AgentStatus::Running,
    });

    // 根据配置选择执行方式
    let result = if USE_LANGGRAPH {
        // 使用 langgraph-rust 框架
        run_with_langgraph(app.clone(), config, initial_state).await
    } else {
        // 使用旧的直接实现
        run_with_legacy(app.clone(), config, initial_state).await
    };
    
    match result {
        Ok(final_state) => {
            // 保存最终状态
            let mut state_lock = state.current_state.lock().await;
            *state_lock = Some(final_state);
        }
        Err(e) => {
            let _ = app.emit("agent-event", AgentEvent::Error {
                message: e.clone(),
            });
            let _ = app.emit("agent-event", AgentEvent::StatusChange {
                status: AgentStatus::Error,
            });
        }
    }

    // 标记完成
    {
        let mut is_running = state.is_running.lock().await;
        *is_running = false;
    }

    Ok(())
}

/// 使用 langgraph-rust 框架执行
async fn run_with_langgraph(
    app: AppHandle,
    config: AgentConfig,
    initial_state: GraphState,
) -> Result<GraphState, String> {
    // 创建执行上下文
    let ctx = AgentContext::new(app, config.clone());
    
    // 构建图
    let graph = build_agent_graph(ctx)
        .map_err(|e| format!("Failed to build graph: {}", e))?;
    
    // 配置并执行
    let graph = graph
        .with_max_iterations(config.max_steps * 2)
        .with_debug(false);
    
    // 执行图
    graph.invoke(initial_state).await
        .map_err(|e| format!("Graph execution error: {}", e))
}

/// 使用旧的直接实现执行（保留兼容性）
async fn run_with_legacy(
    app: AppHandle,
    config: AgentConfig,
    initial_state: GraphState,
) -> Result<GraphState, String> {
    let executor = GraphExecutor::new(config);
    executor.run(&app, initial_state).await
}

/// 中止 Agent 任务
#[tauri::command]
pub async fn agent_abort(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<(), String> {
    {
        let mut is_running = state.is_running.lock().await;
        if !*is_running {
            return Ok(());
        }
        *is_running = false;
    }

    // 发送中止事件
    let _ = app.emit("agent-event", AgentEvent::StatusChange {
        status: AgentStatus::Aborted,
    });

    Ok(())
}

/// 获取 Agent 状态
#[tauri::command]
pub async fn agent_get_status(
    state: State<'_, AgentState>,
) -> Result<AgentStatus, String> {
    let is_running = state.is_running.lock().await;
    if *is_running {
        Ok(AgentStatus::Running)
    } else {
        Ok(AgentStatus::Idle)
    }
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
    
    let _ = app.emit("agent-event", AgentEvent::MessageChunk {
        content: format!("用户回答: {}", answer),
        agent: AgentType::Coordinator,
    });

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
