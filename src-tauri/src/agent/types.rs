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

/// Agent 图状态
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GraphState {
    /// 消息历史
    pub messages: Vec<Message>,
    /// 原始任务输入
    #[serde(default)]
    pub task: TaskState,
    /// Execute 阶段状态
    #[serde(default)]
    pub execute: ExecuteStageState,
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
    /// 思考模式
    #[serde(default = "default_thinking_mode")]
    pub thinking_mode: ThinkingMode,
    /// 最大 tokens
    #[serde(default = "default_max_tokens")]
    pub max_tokens: usize,
    /// 最大步骤数（0 表示无限制）
    #[serde(default = "default_max_steps")]
    pub max_steps: usize,
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
            api_key: String::new(),
            base_url: None,
            temperature: default_temperature(),
            thinking_mode: default_thinking_mode(),
            max_tokens: default_max_tokens(),
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
    MessageChunk { content: String },
    /// 思考块（流式输出）
    ReasoningDelta { content: String },
    /// 思考流结束
    ReasoningDone { request_id: String },
    /// 工具调用
    ToolCall { tool: ToolCall },
    /// 工具结果
    ToolResult { result: ToolResult },
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
        built_in_agent: String,
        workspace_agent: String,
    },
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
    /// 历史对话消息（多轮对话支持）
    #[serde(default)]
    pub history: Vec<Message>,
}

impl GraphState {
    pub fn user_task(&self) -> &str {
        &self.task.user_task
    }

    pub fn workspace_path(&self) -> &str {
        &self.task.workspace_path
    }

    pub fn final_result(&self) -> Option<&str> {
        // After simplification, final_result is stored in the last assistant message
        // or we can check the last message. For now, return None — forge_loop sets it
        // via set_final_result.
        None
    }

    pub fn set_final_result(&mut self, _result: Option<String>) {
        // After simplification the final result is emitted via events.
        // This is intentionally a no-op; callers use the event stream.
    }

    pub fn set_error(&mut self, _error: Option<String>) {
        // Error is communicated through events and status field.
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
