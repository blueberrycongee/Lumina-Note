//! Agent 类型定义

use forge::runtime::state::GraphState as ForgeGraphState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Agent 状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Idle,
    Running,
    WaitingApproval,
    Completed,
    Error,
    Aborted,
}

impl Default for AgentStatus {
    fn default() -> Self {
        Self::Idle
    }
}

/// 智能体类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    Coordinator, // 协调器：理解任务意图
    Planner,     // 规划器：分解复杂任务
    Executor,    // 执行器：执行计划步骤
    Editor,      // 编辑器：编辑笔记
    Researcher,  // 研究员：搜索信息
    Writer,      // 写作者：创建内容
    Organizer,   // 整理者：文件组织
    Reporter,    // 报告者：汇总结果
}

impl Default for AgentType {
    fn default() -> Self {
        Self::Coordinator
    }
}

/// 执行模式
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentExecutionMode {
    Auto,
    LegacySingleAgent,
    Orchestrated,
}

impl Default for AgentExecutionMode {
    fn default() -> Self {
        Self::Auto
    }
}

/// 编排阶段
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentStage {
    Explore,
    Plan,
    Execute,
    Verify,
    Report,
}

impl Default for AgentStage {
    fn default() -> Self {
        Self::Execute
    }
}

/// 任务意图
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskIntent {
    Chat,      // 简单聊天
    Edit,      // 编辑笔记
    Create,    // 创建内容
    Organize,  // 整理文件
    Search,    // 搜索研究
    Flashcard, // 生成与管理闪卡
    Complex,   // 复杂任务（需要规划）
}

impl Default for TaskIntent {
    fn default() -> Self {
        Self::Chat
    }
}

/// 消息角色
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
    Tool,
}

/// 消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: MessageRole,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

/// 工具调用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub params: HashMap<String, serde_json::Value>,
}

/// 工具结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub tool_call_id: String,
    pub success: bool,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 计划步骤状态 (Windsurf 风格)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PlanStepStatus {
    Pending,
    InProgress,
    Completed,
}

impl Default for PlanStepStatus {
    fn default() -> Self {
        PlanStepStatus::Pending
    }
}

/// 计划步骤 (Windsurf 风格)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub id: String,
    pub step: String,
    #[serde(default = "default_plan_step_role")]
    pub role: AgentStage,
    pub status: PlanStepStatus,
    #[serde(default)]
    pub expected_artifacts: Vec<String>,
}

/// 任务计划 (Windsurf 风格)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Plan {
    pub steps: Vec<PlanStep>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
}

fn default_plan_step_role() -> AgentStage {
    AgentStage::Execute
}

/// RAG 搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagResult {
    pub file_path: String,
    pub content: String,
    pub score: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<String>,
}

/// WikiLink 解析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedLink {
    pub link_name: String,
    pub file_path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExploreFileRef {
    pub file_path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExploreContextEntry {
    pub source: String,
    pub file_path: String,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExploreReport {
    pub summary: String,
    #[serde(default)]
    pub related_files: Vec<String>,
    #[serde(default)]
    pub key_locations: Vec<ExploreFileRef>,
    #[serde(default)]
    pub similar_patterns: Vec<ExploreFileRef>,
    #[serde(default)]
    pub risks: Vec<String>,
    #[serde(default)]
    pub recommended_entry_points: Vec<String>,
    #[serde(default)]
    pub retrieved_context: Vec<ExploreContextEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VerificationVerdict {
    Pass,
    Fail,
    Partial,
}

impl Default for VerificationVerdict {
    fn default() -> Self {
        Self::Partial
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VerificationCheck {
    pub label: String,
    pub result: VerificationVerdict,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VerificationCommandResult {
    pub command: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    pub ran: bool,
    pub output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VerificationReport {
    pub verdict: VerificationVerdict,
    pub summary: String,
    #[serde(default)]
    pub checks: Vec<VerificationCheck>,
    #[serde(default)]
    pub command_results: Vec<VerificationCommandResult>,
    #[serde(default)]
    pub outstanding_risks: Vec<String>,
}

/// Agent 图状态
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GraphState {
    /// 消息历史
    pub messages: Vec<Message>,
    /// 原始任务输入
    #[serde(default)]
    pub task: TaskState,
    /// 编排状态
    #[serde(default)]
    pub orchestration: OrchestrationState,
    /// Explore 阶段状态
    #[serde(default)]
    pub explore: ExploreStageState,
    /// Plan 阶段状态
    #[serde(default)]
    pub plan: PlanStageState,
    /// Execute 阶段状态
    #[serde(default)]
    pub execute: ExecuteStageState,
    /// Verify 阶段状态
    #[serde(default)]
    pub verify: VerifyStageState,
    /// Report 阶段状态
    #[serde(default)]
    pub report: ReportStageState,
    /// 下一个节点
    #[serde(default)]
    pub goto: String,
    /// 当前状态
    #[serde(default)]
    pub status: AgentStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TaskState {
    /// 用户任务
    pub user_task: String,
    /// 工作区路径
    pub workspace_path: String,
    /// 当前活动笔记路径
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_note_path: Option<String>,
    /// 当前活动笔记内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_note_content: Option<String>,
    /// 文件树
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_tree: Option<String>,
    /// 是否自动审批
    #[serde(default)]
    pub auto_approve: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationState {
    /// 预期执行模式
    #[serde(default)]
    pub mode: AgentExecutionMode,
    /// 当前阶段
    #[serde(default)]
    pub current_stage: AgentStage,
    /// 计划阶段序列
    #[serde(default = "default_orchestration_stages")]
    pub stages: Vec<AgentStage>,
    /// 当前是否降级回单 Agent 执行
    #[serde(default)]
    pub fallback_to_single_agent: bool,
    /// 降级原因
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_reason: Option<String>,
}

impl Default for OrchestrationState {
    fn default() -> Self {
        Self {
            mode: AgentExecutionMode::default(),
            current_stage: AgentStage::default(),
            stages: default_orchestration_stages(),
            fallback_to_single_agent: false,
            fallback_reason: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExploreStageState {
    /// 预处理后的 RAG 结果
    #[serde(default)]
    pub rag_results: Vec<RagResult>,
    /// 已解析 WikiLinks
    #[serde(default)]
    pub resolved_links: Vec<ResolvedLink>,
    /// Explore 阶段结构化报告
    #[serde(skip_serializing_if = "Option::is_none")]
    pub report: Option<ExploreReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlanStageState {
    /// 任务意图
    #[serde(default)]
    pub intent: TaskIntent,
    /// 当前计划
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_plan: Option<Plan>,
    /// 计划迭代次数
    #[serde(default)]
    pub plan_iterations: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExecuteStageState {
    /// 当前步骤索引
    #[serde(default)]
    pub current_step_index: usize,
    /// 观察结果（工具输出）
    #[serde(default)]
    pub observations: Vec<String>,
    /// 执行阶段修改过的文件
    #[serde(default)]
    pub modified_files: Vec<String>,
    /// 执行阶段运行过的命令
    #[serde(default)]
    pub executed_commands: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VerifyStageState {
    /// 当前验证摘要
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// 结构化验证报告
    #[serde(skip_serializing_if = "Option::is_none")]
    pub report: Option<VerificationReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ReportStageState {
    /// 最终结果
    #[serde(skip_serializing_if = "Option::is_none")]
    pub final_result: Option<String>,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn default_orchestration_stages() -> Vec<AgentStage> {
    vec![
        AgentStage::Explore,
        AgentStage::Plan,
        AgentStage::Execute,
        AgentStage::Verify,
        AgentStage::Report,
    ]
}

/// Agent 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    /// LLM 提供商
    pub provider: String,
    /// 模型名称
    pub model: String,
    /// 复杂任务模型（可选，供编排模式使用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub complex_task_model: Option<String>,
    /// API Key
    pub api_key: String,
    /// Base URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    /// 温度
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    /// 思考模式
    #[serde(default = "default_thinking_mode")]
    pub thinking_mode: ThinkingMode,
    /// 最大 tokens
    #[serde(default = "default_max_tokens")]
    pub max_tokens: usize,
    /// 最大计划迭代（0 表示无限制）
    #[serde(default = "default_max_plan_iterations")]
    pub max_plan_iterations: usize,
    /// 最大步骤数（0 表示无限制）
    #[serde(default = "default_max_steps")]
    pub max_steps: usize,
    /// 执行模式
    #[serde(default)]
    pub execution_mode: AgentExecutionMode,
    /// 是否自动审批
    #[serde(default)]
    pub auto_approve: bool,
    /// 语言
    #[serde(default = "default_locale")]
    pub locale: String,
}

fn default_temperature() -> f32 {
    0.7
}
fn default_thinking_mode() -> ThinkingMode {
    ThinkingMode::Auto
}
fn default_max_tokens() -> usize {
    4096
}
// 0 means unlimited (no iteration cap)
fn default_max_plan_iterations() -> usize {
    0
}
fn default_max_steps() -> usize {
    0
}
fn default_locale() -> String {
    "zh-CN".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ThinkingMode {
    Auto,
    Thinking,
    Instant,
}

impl Default for ThinkingMode {
    fn default() -> Self {
        Self::Auto
    }
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            model: "gpt-4o-mini".to_string(),
            complex_task_model: None,
            api_key: String::new(),
            base_url: None,
            temperature: default_temperature(),
            thinking_mode: default_thinking_mode(),
            max_tokens: default_max_tokens(),
            max_plan_iterations: default_max_plan_iterations(),
            max_steps: default_max_steps(),
            execution_mode: AgentExecutionMode::Auto,
            auto_approve: false,
            locale: default_locale(),
        }
    }
}

/// Agent 事件（发送给前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
#[serde(rename_all = "snake_case")]
pub enum AgentEvent {
    /// 状态变化
    StatusChange { status: AgentStatus },
    /// 消息块（流式输出）
    MessageChunk { content: String, agent: AgentType },
    /// 思考块（流式输出）
    ReasoningDelta { content: String, agent: AgentType },
    /// 思考流结束
    ReasoningDone { request_id: String },
    /// 意图分析结果
    IntentAnalysis {
        intent: String,
        route: String,
        message: String,
    },
    /// 工具调用
    ToolCall { tool: ToolCall },
    /// 工具结果
    ToolResult { result: ToolResult },
    /// 计划更新（Windsurf 风格：每次发送完整计划）
    PlanUpdated { plan: Plan },
    /// Token 使用量
    TokenUsage {
        prompt_tokens: usize,
        completion_tokens: usize,
        total_tokens: usize,
    },
    /// 任务完成
    Complete { result: String },
    /// 错误
    Error { message: String },
    /// 等待工具审批
    WaitingApproval { tool: ToolCall, request_id: String },
    /// LLM 请求开始（用于超时检测）
    LlmRequestStart { request_id: String, timestamp: u64 },
    /// LLM 请求结束
    LlmRequestEnd { request_id: String },
    /// LLM 自动重试计划（有限重试）
    LlmRetryScheduled {
        request_id: String,
        attempt: u32,
        max_retries: u32,
        delay_ms: u64,
        reason: String,
        next_retry_at: u64,
    },
    /// 心跳（用于连接状态监控）
    Heartbeat { timestamp: u64 },
    /// 队列状态变化
    QueueUpdated {
        running: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        active_task: Option<String>,
        queued: Vec<QueuedTaskSummary>,
    },
    /// 提示词注入栈（调试可观测）
    PromptStack {
        provider: String,
        base_system: String,
        system_prompt: String,
        role_prompt: String,
        built_in_agent: String,
        workspace_agent: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        skills_index: Option<String>,
    },
    /// 编排流程更新
    OrchestrationUpdated {
        mode: AgentExecutionMode,
        stage: AgentStage,
        stages: Vec<AgentStage>,
        #[serde(skip_serializing_if = "Option::is_none")]
        fallback_reason: Option<String>,
    },
    /// Explore 阶段结构化结果
    ExploreUpdated { report: ExploreReport },
    /// Verify 阶段结构化结果
    VerificationUpdated { report: VerificationReport },
}

/// 队列任务摘要（用于前端展示）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuedTaskSummary {
    pub id: String,
    pub task: String,
    pub workspace_path: String,
    pub enqueued_at: u64,
    pub position: usize,
}

/// Agent 队列快照
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentQueueSnapshot {
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_task: Option<String>,
    pub queued: Vec<QueuedTaskSummary>,
}

/// Skill context injected from frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillContext {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// 任务上下文（从前端传入）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TaskContext {
    pub workspace_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_note_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_note_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_tree: Option<String>,
    #[serde(default)]
    pub rag_results: Vec<RagResult>,
    #[serde(default)]
    pub resolved_links: Vec<ResolvedLink>,
    /// 历史对话消息（多轮对话支持）
    #[serde(default)]
    pub history: Vec<Message>,
    /// Skills (text-only for now)
    #[serde(default)]
    pub skills: Vec<SkillContext>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mobile_session_id: Option<String>,
}

impl GraphState {
    pub fn user_task(&self) -> &str {
        &self.task.user_task
    }

    pub fn workspace_path(&self) -> &str {
        &self.task.workspace_path
    }

    pub fn set_stage(&mut self, stage: AgentStage) {
        self.orchestration.current_stage = stage;
    }

    pub fn final_result(&self) -> Option<&str> {
        self.report.final_result.as_deref()
    }

    pub fn set_final_result(&mut self, result: Option<String>) {
        self.report.final_result = result;
    }

    pub fn set_error(&mut self, error: Option<String>) {
        self.report.error = error;
    }

    pub fn push_observation(&mut self, observation: String) {
        self.execute.observations.push(observation);
    }

    pub fn record_modified_file(&mut self, file_path: impl Into<String>) {
        let path = file_path.into();
        if path.is_empty() || self.execute.modified_files.iter().any(|item| item == &path) {
            return;
        }
        self.execute.modified_files.push(path);
    }

    pub fn record_executed_command(&mut self, command: impl Into<String>) {
        let command = command.into();
        if command.is_empty()
            || self
                .execute
                .executed_commands
                .iter()
                .any(|item| item == &command)
        {
            return;
        }
        self.execute.executed_commands.push(command);
    }
}

// ============ 实现 Forge GraphState trait ============

impl ForgeGraphState for GraphState {
    fn get_next(&self) -> Option<&str> {
        if self.goto.is_empty() {
            None
        } else {
            Some(&self.goto)
        }
    }

    fn set_next(&mut self, next: Option<String>) {
        self.goto = next.unwrap_or_default();
    }

    fn is_complete(&self) -> bool {
        self.status == AgentStatus::Completed || self.status == AgentStatus::Error
    }

    fn mark_complete(&mut self) {
        self.status = AgentStatus::Completed;
    }
}
