//! Error types for LangGraph

use serde::{Deserialize, Serialize};
use std::fmt;

// ============ Interrupt Types ============

/// 中断信息，用于人机交互
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Interrupt {
    /// 要显示给用户的值（问题、选项等）
    pub value: serde_json::Value,
    /// 中断的唯一 ID，用于恢复
    pub id: String,
    /// 中断发生的节点
    pub node: String,
}

impl Interrupt {
    /// 创建新的中断
    pub fn new(value: impl Serialize, node: impl Into<String>) -> Self {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        use std::time::{SystemTime, UNIX_EPOCH};

        // 生成唯一 ID：时间戳 + 随机哈希
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let mut hasher = DefaultHasher::new();
        timestamp.hash(&mut hasher);
        std::thread::current().id().hash(&mut hasher);
        let id = format!("{:016x}", hasher.finish());

        Self {
            value: serde_json::to_value(value).unwrap_or(serde_json::Value::Null),
            id,
            node: node.into(),
        }
    }

    /// 使用指定 ID 创建中断
    pub fn with_id(value: impl Serialize, node: impl Into<String>, id: impl Into<String>) -> Self {
        Self {
            value: serde_json::to_value(value).unwrap_or(serde_json::Value::Null),
            id: id.into(),
            node: node.into(),
        }
    }
}

/// 恢复命令，用于继续被中断的执行
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResumeCommand {
    /// 用户提供的恢复值
    pub value: serde_json::Value,
    /// 要恢复的中断 ID（可选，如果只有一个中断可以省略）
    pub interrupt_id: Option<String>,
}

impl ResumeCommand {
    pub fn new(value: impl Serialize) -> Self {
        Self {
            value: serde_json::to_value(value).unwrap_or(serde_json::Value::Null),
            interrupt_id: None,
        }
    }

    pub fn with_id(value: impl Serialize, interrupt_id: impl Into<String>) -> Self {
        Self {
            value: serde_json::to_value(value).unwrap_or(serde_json::Value::Null),
            interrupt_id: Some(interrupt_id.into()),
        }
    }
}

// ============ Error Types ============

/// Error type for graph operations
#[derive(Debug, Clone)]
pub enum GraphError {
    /// Node not found in graph
    NodeNotFound(String),
    /// Node already exists
    NodeAlreadyExists(String),
    /// Invalid node name (reserved or contains invalid characters)
    InvalidNodeName(String),
    /// Edge validation error
    InvalidEdge {
        from: String,
        to: String,
        reason: String,
    },
    /// Graph has no entry point
    NoEntryPoint,
    /// Graph validation failed
    ValidationError(String),
    /// Maximum iterations exceeded
    MaxIterationsExceeded,
    /// Node execution error
    ExecutionError { node: String, message: String },
    /// Branch/routing error
    BranchError { node: String, message: String },
    /// Graph not compiled
    NotCompiled,
    /// Compilation error
    CompilationError(String),
    /// Graph interrupted - waiting for human input
    Interrupted(Vec<Interrupt>),
    /// Generic error
    Other(String),
}

impl fmt::Display for GraphError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NodeNotFound(name) => write!(f, "Node '{}' not found in graph", name),
            Self::NodeAlreadyExists(name) => write!(f, "Node '{}' already exists", name),
            Self::InvalidNodeName(name) => write!(f, "Invalid node name: '{}'", name),
            Self::InvalidEdge { from, to, reason } => {
                write!(f, "Invalid edge from '{}' to '{}': {}", from, to, reason)
            }
            Self::NoEntryPoint => write!(f, "Graph must have an entry point (edge from START)"),
            Self::ValidationError(msg) => write!(f, "Graph validation failed: {}", msg),
            Self::MaxIterationsExceeded => write!(f, "Maximum iterations exceeded"),
            Self::ExecutionError { node, message } => {
                write!(f, "Error executing node '{}': {}", node, message)
            }
            Self::BranchError { node, message } => {
                write!(f, "Branch error at node '{}': {}", node, message)
            }
            Self::NotCompiled => write!(f, "Graph has not been compiled"),
            Self::CompilationError(msg) => write!(f, "Compilation error: {}", msg),
            Self::Interrupted(interrupts) => {
                write!(
                    f,
                    "Graph interrupted with {} pending interrupt(s)",
                    interrupts.len()
                )
            }
            Self::Other(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for GraphError {}

/// Result type for graph operations
pub type GraphResult<T> = Result<T, GraphError>;

// ============ Interrupt Helper ============

/// 在节点中触发中断，等待人类输入
///
/// # Example
/// ```rust,no_run
/// use lumina_note_lib::langgraph::error::{interrupt, GraphResult};
/// use lumina_note_lib::langgraph::state::GraphState;
///
/// #[derive(Clone, Default)]
/// struct MyState {
///     needs_clarification: bool,
/// }
///
/// impl GraphState for MyState {}
///
/// async fn clarify_node(state: MyState) -> GraphResult<MyState> {
///     // Need user clarification
///     if state.needs_clarification {
///         return interrupt("Please clarify your topic.", "clarify");
///     }
///     Ok(state)
/// }
/// ```
pub fn interrupt<T, V: Serialize>(value: V, node: impl Into<String>) -> GraphResult<T> {
    Err(GraphError::Interrupted(vec![Interrupt::new(value, node)]))
}

/// 在节点中触发多个中断
pub fn interrupt_all<T>(interrupts: Vec<Interrupt>) -> GraphResult<T> {
    Err(GraphError::Interrupted(interrupts))
}
