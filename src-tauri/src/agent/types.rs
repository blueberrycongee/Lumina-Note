//! Agent 类型定义

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::langgraph::state::GraphState as LangGraphState;

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
    Coordinator,  // 协调器：理解任务意图
    Planner,      // 规划器：分解复杂任务
    Executor,     // 执行器：执行计划步骤
    Editor,       // 编辑器：编辑笔记
    Researcher,   // 研究员：搜索信息
    Writer,       // 写作者：创建内容
    Organizer,    // 整理者：文件组织
    Reporter,     // 报告者：汇总结果
}

impl Default for AgentType {
    fn default() -> Self {
        Self::Coordinator
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

/// 计划步骤
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub id: String,
    pub description: String,
    pub agent: AgentType,
    #[serde(default)]
    pub completed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
}

/// 任务计划
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Plan {
    pub steps: Vec<PlanStep>,
    pub current_step: usize,
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

/// Agent 图状态
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GraphState {
    /// 消息历史
    pub messages: Vec<Message>,
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
    /// RAG 结果
    #[serde(default)]
    pub rag_results: Vec<RagResult>,
    /// 解析的 WikiLinks
    #[serde(default)]
    pub resolved_links: Vec<ResolvedLink>,
    /// 任务意图
    #[serde(default)]
    pub intent: TaskIntent,
    /// 当前计划
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_plan: Option<Plan>,
    /// 计划迭代次数
    #[serde(default)]
    pub plan_iterations: usize,
    /// 当前步骤索引
    #[serde(default)]
    pub current_step_index: usize,
    /// 观察结果（工具输出）
    #[serde(default)]
    pub observations: Vec<String>,
    /// 最终结果
    #[serde(skip_serializing_if = "Option::is_none")]
    pub final_result: Option<String>,
    /// 下一个节点
    #[serde(default)]
    pub goto: String,
    /// 是否自动审批
    #[serde(default)]
    pub auto_approve: bool,
    /// 当前状态
    #[serde(default)]
    pub status: AgentStatus,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Agent 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    /// LLM 提供商
    pub provider: String,
    /// 模型名称
    pub model: String,
    /// API Key
    pub api_key: String,
    /// Base URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    /// 温度
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    /// 最大 tokens
    #[serde(default = "default_max_tokens")]
    pub max_tokens: usize,
    /// 最大计划迭代
    #[serde(default = "default_max_plan_iterations")]
    pub max_plan_iterations: usize,
    /// 最大步骤数
    #[serde(default = "default_max_steps")]
    pub max_steps: usize,
    /// 是否自动审批
    #[serde(default)]
    pub auto_approve: bool,
    /// 语言
    #[serde(default = "default_locale")]
    pub locale: String,
}

fn default_temperature() -> f32 { 0.7 }
fn default_max_tokens() -> usize { 4096 }
fn default_max_plan_iterations() -> usize { 3 }
fn default_max_steps() -> usize { 10 }
fn default_locale() -> String { "zh-CN".to_string() }

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            model: "gpt-4o-mini".to_string(),
            api_key: String::new(),
            base_url: None,
            temperature: default_temperature(),
            max_tokens: default_max_tokens(),
            max_plan_iterations: default_max_plan_iterations(),
            max_steps: default_max_steps(),
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
    /// 意图分析结果
    IntentAnalysis { intent: String, route: String, message: String },
    /// 工具调用
    ToolCall { tool: ToolCall },
    /// 工具结果
    ToolResult { result: ToolResult },
    /// 计划创建
    PlanCreated { plan: Plan },
    /// 步骤开始
    StepStarted { step: PlanStep, index: usize },
    /// 步骤完成
    StepCompleted { step: PlanStep, index: usize },
    /// Token 使用量
    TokenUsage { prompt_tokens: usize, completion_tokens: usize, total_tokens: usize },
    /// 任务完成
    Complete { result: String },
    /// 错误
    Error { message: String },
}

/// 任务上下文（从前端传入）
#[derive(Debug, Clone, Serialize, Deserialize)]
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
}

// ============ 实现 LangGraph GraphState trait ============

impl LangGraphState for GraphState {
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
