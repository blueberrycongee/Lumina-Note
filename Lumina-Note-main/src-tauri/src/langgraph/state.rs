//! State trait and utilities for LangGraph
//!
//! The state is the shared data structure that nodes read from and write to.

use std::any::Any;

/// Trait for graph state
///
/// Implement this trait for your state type to use it with StateGraph.
/// The state should be cloneable and thread-safe.
///
/// # Example
/// ```rust,no_run
/// use lumina_note_lib::langgraph::state::GraphState;
///
/// #[derive(Clone, Default)]
/// struct MyState {
///     counter: i32,
///     messages: Vec<String>,
/// }
///
/// impl GraphState for MyState {
///     // Optional: override if you need custom routing logic
/// }
/// ```
pub trait GraphState: Clone + Send + Sync + 'static {
    /// Get the next node to execute (optional, used for internal routing)
    fn get_next(&self) -> Option<&str> {
        None
    }

    /// Set the next node to execute (optional, used for internal routing)
    fn set_next(&mut self, _next: Option<String>) {}

    /// Check if the state indicates completion
    fn is_complete(&self) -> bool {
        false
    }

    /// Mark the state as complete
    fn mark_complete(&mut self) {}

    /// Get a value by key (for channel-based state)
    fn get(&self, _key: &str) -> Option<&dyn Any> {
        None
    }

    /// Set a value by key (for channel-based state)
    fn set(&mut self, _key: &str, _value: Box<dyn Any + Send + Sync>) {}
}

/// A simple state that stores values in a HashMap
///
/// Useful for prototyping or when you don't need a custom state type.
#[derive(Clone, Default)]
pub struct DictState {
    values: std::collections::HashMap<String, Box<dyn CloneableAny + Send + Sync>>,
    next: Option<String>,
    complete: bool,
}

/// Trait for cloneable Any
pub trait CloneableAny: Any + Send + Sync {
    fn clone_box(&self) -> Box<dyn CloneableAny + Send + Sync>;
    fn as_any(&self) -> &dyn Any;
}

impl<T: Clone + Send + Sync + 'static> CloneableAny for T {
    fn clone_box(&self) -> Box<dyn CloneableAny + Send + Sync> {
        Box::new(self.clone())
    }
    fn as_any(&self) -> &dyn Any {
        self
    }
}

impl Clone for Box<dyn CloneableAny + Send + Sync> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}

impl DictState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_value<T: Clone + Send + Sync + 'static>(mut self, key: &str, value: T) -> Self {
        self.values.insert(key.to_string(), Box::new(value));
        self
    }

    pub fn get_value<T: Clone + 'static>(&self, key: &str) -> Option<&T> {
        self.values.get(key)?.as_any().downcast_ref::<T>()
    }

    pub fn set_value<T: Clone + Send + Sync + 'static>(&mut self, key: &str, value: T) {
        self.values.insert(key.to_string(), Box::new(value));
    }
}

impl GraphState for DictState {
    fn get_next(&self) -> Option<&str> {
        self.next.as_deref()
    }

    fn set_next(&mut self, next: Option<String>) {
        self.next = next;
    }

    fn is_complete(&self) -> bool {
        self.complete
    }

    fn mark_complete(&mut self) {
        self.complete = true;
    }
}

/// State update - represents partial updates to state
#[derive(Clone)]
pub struct StateUpdate<S: GraphState> {
    pub state: S,
    pub next: Option<String>,
}

impl<S: GraphState> StateUpdate<S> {
    pub fn new(state: S) -> Self {
        Self { state, next: None }
    }

    pub fn with_next(mut self, next: impl Into<String>) -> Self {
        self.next = Some(next.into());
        self
    }

    pub fn goto(mut self, node: impl Into<String>) -> Self {
        self.next = Some(node.into());
        self
    }
}
