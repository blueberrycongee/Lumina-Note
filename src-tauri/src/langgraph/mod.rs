//! LangGraph Rust Implementation
//!
//! A Rust port of the LangGraph framework for building stateful, multi-agent applications.
//!
//! ## Features
//!
//! - **State Graph**: Define nodes and edges for agent workflows
//! - **Conditional Routing**: Dynamic routing based on state
//! - **Interrupt/Resume**: Human-in-the-loop support
//! - **Metrics Collection**: Track latency, tokens, and success rates
//! - **Ablation Studies**: Analyze node contributions by masking
//! - **Evaluators**: Assess output quality with built-in or custom evaluators
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
//!
//! # Ablation Study Example
//! ```rust
//! use langgraph::prelude::*;
//!
//! // Create ablation configs
//! let configs = vec![
//!     AblationConfig::baseline("baseline"),
//!     AblationConfig::mask("without_planner", vec!["planner"]),
//!     AblationConfig::mask("without_researcher", vec!["researcher"]),
//! ];
//!
//! // Run study and generate report
//! let collector = MetricsCollector::new();
//! // ... run tests with different configs ...
//! let report = AblationReport::from_metrics(&collector, &configs);
//! println!("{}", report.to_markdown());
//! ```

// Core modules
pub mod constants;
pub mod error;
pub mod state;
pub mod node;
pub mod branch;
pub mod graph;
pub mod executor;
pub mod channel;

// Evaluation modules
pub mod metrics;
pub mod evaluator;
pub mod ablation;

/// Prelude - commonly used types
pub mod prelude {
    // Core types
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
    pub use crate::langgraph::executor::{
        CompiledGraph, Checkpoint, ExecutionResult, 
        ExecutionConfig, ExecutionResultWithMetrics
    };

    // Metrics and evaluation
    pub use crate::langgraph::metrics::{
        MetricsCollector, RunMetrics, RunMetricsBuilder,
        NodeMetrics, AggregateStats, NodeAggregateStats
    };
    pub use crate::langgraph::evaluator::{
        Evaluator, EvalResult, EvalContext, EvalDetail,
        ExactMatchEvaluator, ContainsEvaluator, 
        ToolCallEvaluator, LatencyEvaluator,
        TokenBudgetEvaluator, CompositeEvaluator,
        CustomEvaluator
    };
    pub use crate::langgraph::ablation::{
        AblationConfig, AblationReport, AblationStudyBuilder,
        TestCase, NodeOverride, NodeContribution, NodeRecommendation,
        ConfigResult, ConfigComparison
    };
}

pub use prelude::*;
