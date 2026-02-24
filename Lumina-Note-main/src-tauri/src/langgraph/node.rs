//! Node definitions for LangGraph
//!
//! A node is a function that takes state and returns updated state.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use crate::langgraph::error::GraphResult;
use crate::langgraph::state::GraphState;

/// A boxed future type for async node execution
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Node function signature
///
/// A node function takes the current state and returns the updated state.
pub type NodeFn<S> = Arc<dyn Fn(S) -> BoxFuture<'static, GraphResult<S>> + Send + Sync>;

/// Trait for node implementations
pub trait Node<S: GraphState>: Send + Sync {
    /// Get the node's name
    fn name(&self) -> &str;

    /// Execute the node
    fn execute(&self, state: S) -> BoxFuture<'_, GraphResult<S>>;
}

/// Node specification - holds the node function and metadata
pub struct NodeSpec<S: GraphState> {
    /// Node name
    pub name: String,
    /// Node function
    pub func: NodeFn<S>,
    /// Optional metadata
    pub metadata: Option<NodeMetadata>,
}

/// Node metadata for additional configuration
#[derive(Clone, Default)]
pub struct NodeMetadata {
    /// Retry policy
    pub retry_count: usize,
    /// Timeout in milliseconds
    pub timeout_ms: Option<u64>,
    /// Tags for filtering/routing
    pub tags: Vec<String>,
}

impl<S: GraphState> NodeSpec<S> {
    /// Create a new node spec from an async function
    pub fn new<F, Fut>(name: impl Into<String>, func: F) -> Self
    where
        F: Fn(S) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = GraphResult<S>> + Send + 'static,
    {
        let name = name.into();
        Self {
            name,
            func: Arc::new(move |state| Box::pin(func(state))),
            metadata: None,
        }
    }

    /// Add metadata to the node
    pub fn with_metadata(mut self, metadata: NodeMetadata) -> Self {
        self.metadata = Some(metadata);
        self
    }

    /// Set retry count
    pub fn with_retry(mut self, count: usize) -> Self {
        let metadata = self.metadata.get_or_insert_with(NodeMetadata::default);
        metadata.retry_count = count;
        self
    }

    /// Set timeout
    pub fn with_timeout(mut self, timeout_ms: u64) -> Self {
        let metadata = self.metadata.get_or_insert_with(NodeMetadata::default);
        metadata.timeout_ms = Some(timeout_ms);
        self
    }
}

impl<S: GraphState> Node<S> for NodeSpec<S> {
    fn name(&self) -> &str {
        &self.name
    }

    fn execute(&self, state: S) -> BoxFuture<'_, GraphResult<S>> {
        (self.func)(state)
    }
}

impl<S: GraphState> Clone for NodeSpec<S> {
    fn clone(&self) -> Self {
        Self {
            name: self.name.clone(),
            func: Arc::clone(&self.func),
            metadata: self.metadata.clone(),
        }
    }
}

/// Helper macro to create a node from an async function
#[macro_export]
macro_rules! node {
    ($name:expr, $func:expr) => {
        $crate::langgraph::node::NodeSpec::new($name, $func)
    };
}
