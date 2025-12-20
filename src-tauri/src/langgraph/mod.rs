//! LangGraph Rust Implementation
//! 
//! A Rust port of the LangGraph framework for building stateful, multi-agent applications.
//! 
//! # Example
//! ```rust
//! use langgraph::prelude::*;
//! 
//! #[derive(Clone, Default)]
//! struct MyState {
//!     messages: Vec<String>,
//!     next: Option<String>,
//! }
//! 
//! impl GraphState for MyState {
//!     fn get_next(&self) -> Option<&str> { self.next.as_deref() }
//!     fn set_next(&mut self, next: Option<String>) { self.next = next; }
//! }
//! 
//! async fn node_a(state: MyState) -> Result<MyState, GraphError> {
//!     let mut state = state;
//!     state.messages.push("Hello from A".to_string());
//!     Ok(state)
//! }
//! 
//! let mut graph = StateGraph::<MyState>::new();
//! graph.add_node("a", node_a);
//! graph.add_edge(START, "a");
//! graph.add_edge("a", END);
//! 
//! let compiled = graph.compile()?;
//! let result = compiled.invoke(MyState::default()).await?;
//! ```

pub mod constants;
pub mod error;
pub mod state;
pub mod node;
pub mod branch;
pub mod graph;
pub mod executor;
pub mod channel;

pub mod prelude {
    //! Re-exports commonly used types
    pub use crate::langgraph::constants::{START, END};
    pub use crate::langgraph::error::{
        GraphError, GraphResult, 
        Interrupt, ResumeCommand, 
        interrupt, interrupt_all
    };
    pub use crate::langgraph::state::GraphState;
    pub use crate::langgraph::node::{Node, NodeSpec};
    pub use crate::langgraph::branch::{Branch, BranchSpec};
    pub use crate::langgraph::graph::StateGraph;
    pub use crate::langgraph::executor::{CompiledGraph, Checkpoint, ExecutionResult, ExecutionConfig};
}

pub use prelude::*;
