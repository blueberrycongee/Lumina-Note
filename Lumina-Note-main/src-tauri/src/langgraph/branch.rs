//! Branch/conditional edge definitions for LangGraph
//!
//! Branches allow routing to different nodes based on state.

use std::collections::HashMap;
use std::sync::Arc;

use crate::langgraph::error::{GraphError, GraphResult};
use crate::langgraph::state::GraphState;

/// Branch function signature - takes state (cloned) and returns the next node name
///
/// The function receives an owned clone of the state to avoid lifetime issues
/// with async closures.
pub type BranchFn<S> = Arc<dyn Fn(S) -> GraphResult<String> + Send + Sync>;

/// Trait for branch implementations
pub trait Branch<S: GraphState>: Send + Sync {
    /// Get the branch name
    fn name(&self) -> &str;

    /// Evaluate the branch and return the next node
    ///
    /// Takes ownership of state clone for async safety
    fn evaluate(&self, state: &S) -> GraphResult<String>;

    /// Get the possible destinations
    fn destinations(&self) -> Option<&HashMap<String, String>>;
}

/// Branch specification
///
/// Represents a conditional routing decision in the graph.
pub struct BranchSpec<S: GraphState> {
    /// Branch name
    pub name: String,
    /// Branch function that determines the next node
    /// Takes cloned state for thread safety
    pub func: BranchFn<S>,
    /// Mapping from branch results to node names
    /// If None, the branch function returns node names directly
    pub path_map: Option<HashMap<String, String>>,
}

impl<S: GraphState> BranchSpec<S> {
    /// Create a new branch that returns node names directly
    ///
    /// # Arguments
    /// * `name` - Unique name for the branch
    /// * `func` - Synchronous function that takes state and returns next node name
    pub fn new<F>(name: impl Into<String>, func: F) -> Self
    where
        F: Fn(S) -> GraphResult<String> + Send + Sync + 'static,
    {
        Self {
            name: name.into(),
            func: Arc::new(func),
            path_map: None,
        }
    }

    /// Create a new branch with a path map
    ///
    /// # Arguments
    /// * `name` - Unique name for the branch
    /// * `func` - Function that returns a key to lookup in path_map
    /// * `path_map` - Mapping from keys to node names
    pub fn with_map<F>(name: impl Into<String>, func: F, path_map: HashMap<String, String>) -> Self
    where
        F: Fn(S) -> GraphResult<String> + Send + Sync + 'static,
    {
        Self {
            name: name.into(),
            func: Arc::new(func),
            path_map: Some(path_map),
        }
    }

    /// Create from a simple sync function (no Result wrapper)
    pub fn from_sync<F>(name: impl Into<String>, func: F) -> Self
    where
        F: Fn(&S) -> String + Send + Sync + 'static,
    {
        Self {
            name: name.into(),
            func: Arc::new(move |state: S| Ok(func(&state))),
            path_map: None,
        }
    }

    /// Resolve the branch result to a node name
    pub fn resolve(&self, result: &str) -> GraphResult<String> {
        match &self.path_map {
            Some(map) => map
                .get(result)
                .cloned()
                .ok_or_else(|| GraphError::BranchError {
                    node: self.name.clone(),
                    message: format!("Unknown branch result: '{}'", result),
                }),
            None => Ok(result.to_string()),
        }
    }
}

impl<S: GraphState> Branch<S> for BranchSpec<S> {
    fn name(&self) -> &str {
        &self.name
    }

    fn evaluate(&self, state: &S) -> GraphResult<String> {
        // Clone state for the function call
        (self.func)(state.clone())
    }

    fn destinations(&self) -> Option<&HashMap<String, String>> {
        self.path_map.as_ref()
    }
}

impl<S: GraphState> Clone for BranchSpec<S> {
    fn clone(&self) -> Self {
        Self {
            name: self.name.clone(),
            func: Arc::clone(&self.func),
            path_map: self.path_map.clone(),
        }
    }
}

/// Common routing patterns
pub mod patterns {
    use super::*;
    use crate::langgraph::constants::END;

    /// Route to END if a condition is true, otherwise to another node
    pub fn end_if<S, F>(
        condition: F,
        else_node: impl Into<String>,
    ) -> impl Fn(&S) -> String + Send + Sync + Clone + 'static
    where
        S: GraphState,
        F: Fn(&S) -> bool + Send + Sync + Clone + 'static,
    {
        let else_node = else_node.into();
        move |state: &S| {
            if condition(state) {
                END.to_string()
            } else {
                else_node.clone()
            }
        }
    }

    /// Route based on a match expression
    pub fn match_route<S, F, K>(
        key_fn: F,
        routes: HashMap<K, String>,
        default: impl Into<String>,
    ) -> impl Fn(&S) -> String + Send + Sync + Clone + 'static
    where
        S: GraphState,
        F: Fn(&S) -> K + Send + Sync + Clone + 'static,
        K: std::hash::Hash + Eq + Clone + Send + Sync + 'static,
    {
        let default = default.into();
        move |state: &S| {
            let key = key_fn(state);
            routes.get(&key).cloned().unwrap_or_else(|| default.clone())
        }
    }
}
