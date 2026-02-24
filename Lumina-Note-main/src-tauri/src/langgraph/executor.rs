//! Graph executor - runs the compiled graph
//!
//! Supports:
//! - Interrupt/resume for human-in-the-loop workflows
//! - Node masking for ablation studies
//! - Metrics collection for performance analysis

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::langgraph::ablation::NodeOverride;
use crate::langgraph::branch::{Branch, BranchSpec};
use crate::langgraph::constants::{END, MAX_ITERATIONS, START};
use crate::langgraph::error::{GraphError, GraphResult, Interrupt, ResumeCommand};
use crate::langgraph::graph::{Edge, StateGraph};
use crate::langgraph::metrics::{MetricsCollector, RunMetrics, RunMetricsBuilder};
use crate::langgraph::node::{Node, NodeSpec};
use crate::langgraph::state::GraphState;

/// Configuration for graph execution
#[derive(Clone, Debug, Default)]
pub struct ExecutionConfig {
    /// Maximum number of iterations
    pub max_iterations: usize,
    /// Enable debug logging
    pub debug: bool,
    /// Recursion limit
    pub recursion_limit: usize,
    /// Nodes to skip (for ablation studies)
    pub masked_nodes: HashSet<String>,
    /// Node overrides (replace behavior)
    pub node_overrides: HashMap<String, NodeOverride>,
    /// Configuration ID for metrics grouping
    pub config_id: String,
    /// Enable metrics collection
    pub collect_metrics: bool,
}

impl ExecutionConfig {
    pub fn new() -> Self {
        Self {
            max_iterations: MAX_ITERATIONS,
            debug: false,
            recursion_limit: 25,
            masked_nodes: HashSet::new(),
            node_overrides: HashMap::new(),
            config_id: "default".to_string(),
            collect_metrics: false,
        }
    }

    /// Create config for ablation study
    pub fn for_ablation(config_id: impl Into<String>, masked: HashSet<String>) -> Self {
        Self {
            max_iterations: MAX_ITERATIONS,
            debug: false,
            recursion_limit: 25,
            masked_nodes: masked,
            node_overrides: HashMap::new(),
            config_id: config_id.into(),
            collect_metrics: true,
        }
    }

    /// Add a masked node
    pub fn mask_node(mut self, node: impl Into<String>) -> Self {
        self.masked_nodes.insert(node.into());
        self
    }

    /// Add multiple masked nodes
    pub fn mask_nodes(mut self, nodes: Vec<&str>) -> Self {
        for node in nodes {
            self.masked_nodes.insert(node.to_string());
        }
        self
    }

    /// Set config ID
    pub fn with_config_id(mut self, id: impl Into<String>) -> Self {
        self.config_id = id.into();
        self
    }

    /// Enable metrics collection
    pub fn with_metrics(mut self) -> Self {
        self.collect_metrics = true;
        self
    }

    /// Check if a node is masked
    pub fn is_masked(&self, node: &str) -> bool {
        self.masked_nodes.contains(node)
    }
}

/// Checkpoint - saves execution state at interrupt
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Checkpoint<S> {
    /// Current state
    pub state: S,
    /// Next node to execute
    pub next_node: String,
    /// Pending interrupts
    pub pending_interrupts: Vec<Interrupt>,
    /// Completed iterations
    pub iterations: usize,
    /// Resume values (from user input)
    #[serde(default)]
    pub resume_values: HashMap<String, serde_json::Value>,
}

/// Execution result - may complete or be interrupted
#[derive(Debug)]
pub enum ExecutionResult<S> {
    /// Execution completed successfully
    Complete(S),
    /// Execution interrupted, needs human input
    Interrupted {
        checkpoint: Checkpoint<S>,
        interrupts: Vec<Interrupt>,
    },
}

/// Result of execution with metrics
#[derive(Debug)]
pub struct ExecutionResultWithMetrics<S> {
    /// The execution result
    pub result: ExecutionResult<S>,
    /// Collected metrics (if enabled)
    pub metrics: Option<RunMetrics>,
}

/// A compiled graph ready for execution
pub struct CompiledGraph<S: GraphState> {
    /// Node definitions
    pub(crate) nodes: HashMap<String, NodeSpec<S>>,
    /// Edge definitions
    pub(crate) edges: HashMap<String, Vec<Edge>>,
    /// Branch definitions
    pub(crate) branches: HashMap<String, BranchSpec<S>>,
    /// Execution configuration
    config: ExecutionConfig,
    /// Metrics collector (shared across runs)
    metrics_collector: Option<Arc<MetricsCollector>>,
}

impl<S: GraphState> CompiledGraph<S> {
    /// Create from a StateGraph
    pub(crate) fn new(graph: StateGraph<S>) -> Self {
        Self {
            nodes: graph.nodes,
            edges: graph.edges,
            branches: graph.branches,
            config: ExecutionConfig::new(),
            metrics_collector: None,
        }
    }

    /// Set execution configuration
    pub fn with_config(mut self, config: ExecutionConfig) -> Self {
        self.config = config;
        self
    }

    /// Set max iterations
    pub fn with_max_iterations(mut self, max: usize) -> Self {
        self.config.max_iterations = max;
        self
    }

    /// Enable debug mode
    pub fn with_debug(mut self, debug: bool) -> Self {
        self.config.debug = debug;
        self
    }

    /// Set metrics collector for accumulating results
    pub fn with_metrics_collector(mut self, collector: Arc<MetricsCollector>) -> Self {
        self.metrics_collector = Some(collector);
        self.config.collect_metrics = true;
        self
    }

    /// Execute the graph with the given initial state
    pub async fn invoke(&self, initial_state: S) -> GraphResult<S> {
        let result = self.invoke_with_metrics(initial_state).await?;
        match result.result {
            ExecutionResult::Complete(state) => Ok(state),
            ExecutionResult::Interrupted { .. } => {
                Err(GraphError::Other("Unexpected interrupt".to_string()))
            }
        }
    }

    /// Execute and return metrics
    pub async fn invoke_with_metrics(
        &self,
        initial_state: S,
    ) -> GraphResult<ExecutionResultWithMetrics<S>> {
        let run_id = uuid::Uuid::new_v4().to_string();
        let mut metrics_builder = if self.config.collect_metrics {
            Some(RunMetricsBuilder::new(&run_id, &self.config.config_id))
        } else {
            None
        };

        let mut state = initial_state;
        let mut current_node = self.get_next_node(START, &state)?;
        let mut iterations = 0;

        while current_node != END && iterations < self.config.max_iterations {
            iterations += 1;

            if self.config.debug {
                println!("[LangGraph] Executing node: {}", current_node);
            }

            // Check if node is masked
            if self.config.is_masked(&current_node) {
                if self.config.debug {
                    println!("[LangGraph] Skipping masked node: {}", current_node);
                }
                if let Some(ref mut mb) = metrics_builder {
                    mb.skip_node(&current_node);
                }
                // Skip to next node without executing
                current_node = self.get_next_node(&current_node, &state)?;
                continue;
            }

            // Start timing
            if let Some(ref mut mb) = metrics_builder {
                mb.start_node(&current_node);
            }

            // Execute the node
            let node = self
                .nodes
                .get(&current_node)
                .ok_or_else(|| GraphError::NodeNotFound(current_node.clone()))?;

            match node.execute(state).await {
                Ok(new_state) => {
                    state = new_state;
                    // Record metrics (tokens would come from state if available)
                    if let Some(ref mut mb) = metrics_builder {
                        mb.end_node(0); // TODO: get tokens from state
                    }
                }
                Err(e) => {
                    if let Some(ref mut mb) = metrics_builder {
                        mb.error(&current_node, &e.to_string());
                    }
                    return Err(e);
                }
            }

            // Determine next node
            current_node = self.get_next_node(&current_node, &state)?;
        }

        if iterations >= self.config.max_iterations {
            return Err(GraphError::MaxIterationsExceeded);
        }

        // Finalize metrics
        let metrics = metrics_builder.map(|mb| {
            let m = mb.build(true);
            // Add to collector if present
            if let Some(ref collector) = self.metrics_collector {
                collector.add_run(m.clone());
            }
            m
        });

        Ok(ExecutionResultWithMetrics {
            result: ExecutionResult::Complete(state),
            metrics,
        })
    }

    /// Execute with streaming - yields state after each node
    pub async fn stream<F>(&self, initial_state: S, mut callback: F) -> GraphResult<S>
    where
        F: FnMut(&str, &S),
    {
        let mut state = initial_state;
        let mut current_node = self.get_next_node(START, &state)?;
        let mut iterations = 0;

        while current_node != END && iterations < self.config.max_iterations {
            iterations += 1;

            // Check if masked
            if self.config.is_masked(&current_node) {
                current_node = self.get_next_node(&current_node, &state)?;
                continue;
            }

            // Execute the node
            let node = self
                .nodes
                .get(&current_node)
                .ok_or_else(|| GraphError::NodeNotFound(current_node.clone()))?;

            state = node.execute(state).await?;

            // Callback with current state
            callback(&current_node, &state);

            // Determine next node
            current_node = self.get_next_node(&current_node, &state)?;
        }

        if iterations >= self.config.max_iterations {
            return Err(GraphError::MaxIterationsExceeded);
        }

        Ok(state)
    }

    /// Get the next node to execute
    fn get_next_node(&self, current: &str, state: &S) -> GraphResult<String> {
        // Check if state has explicit next
        if let Some(next) = state.get_next() {
            return Ok(next.to_string());
        }

        // Check edges
        let edges = self.edges.get(current);

        match edges {
            None => Ok(END.to_string()),
            Some(edges) if edges.is_empty() => Ok(END.to_string()),
            Some(edges) => match &edges[0] {
                Edge::Direct(to) => Ok(to.clone()),
                Edge::Conditional(branch_name) => {
                    let branch =
                        self.branches
                            .get(branch_name)
                            .ok_or_else(|| GraphError::BranchError {
                                node: current.to_string(),
                                message: format!("Branch '{}' not found", branch_name),
                            })?;

                    let result = branch.evaluate(state)?;
                    branch.resolve(&result)
                }
            },
        }
    }

    /// Get all node names
    pub fn get_nodes(&self) -> Vec<&str> {
        self.nodes.keys().map(|s| s.as_str()).collect()
    }

    /// Check if a node exists
    pub fn has_node(&self, name: &str) -> bool {
        self.nodes.contains_key(name)
    }

    /// Execute graph with interrupt/resume support
    pub async fn invoke_resumable(&self, initial_state: S) -> GraphResult<ExecutionResult<S>> {
        self.run_with_checkpoint(initial_state, START.to_string(), 0, HashMap::new())
            .await
    }

    /// Resume from checkpoint
    pub async fn resume(
        &self,
        checkpoint: Checkpoint<S>,
        command: ResumeCommand,
    ) -> GraphResult<ExecutionResult<S>> {
        let mut resume_values = checkpoint.resume_values;

        // Add new resume value
        if let Some(interrupt_id) = command.interrupt_id {
            resume_values.insert(interrupt_id, command.value);
        } else if let Some(interrupt) = checkpoint.pending_interrupts.first() {
            resume_values.insert(interrupt.id.clone(), command.value);
        }

        self.run_with_checkpoint(
            checkpoint.state,
            checkpoint.next_node,
            checkpoint.iterations,
            resume_values,
        )
        .await
    }

    /// Internal execution with checkpoint support
    async fn run_with_checkpoint(
        &self,
        initial_state: S,
        start_node: String,
        start_iterations: usize,
        resume_values: HashMap<String, serde_json::Value>,
    ) -> GraphResult<ExecutionResult<S>> {
        let mut state = initial_state;
        let mut current_node = if start_node == START {
            self.get_next_node(START, &state)?
        } else {
            start_node
        };
        let mut iterations = start_iterations;

        while current_node != END && iterations < self.config.max_iterations {
            iterations += 1;

            if self.config.debug {
                println!(
                    "[LangGraph] Executing node: {} (iteration {})",
                    current_node, iterations
                );
            }

            // Check if masked
            if self.config.is_masked(&current_node) {
                if self.config.debug {
                    println!("[LangGraph] Skipping masked node: {}", current_node);
                }
                current_node = self.get_next_node(&current_node, &state)?;
                continue;
            }

            // Check if we have a resume value for this node
            let has_resume = resume_values.contains_key(&current_node);

            // Execute the node
            let node = self
                .nodes
                .get(&current_node)
                .ok_or_else(|| GraphError::NodeNotFound(current_node.clone()))?;

            match node.execute(state.clone()).await {
                Ok(new_state) => {
                    state = new_state;
                }
                Err(GraphError::Interrupted(interrupts)) => {
                    if has_resume {
                        if self.config.debug {
                            println!(
                                "[LangGraph] Resuming from interrupt at node: {}",
                                current_node
                            );
                        }
                    } else {
                        // No resume value, return interrupted state
                        return Ok(ExecutionResult::Interrupted {
                            checkpoint: Checkpoint {
                                state,
                                next_node: current_node,
                                pending_interrupts: interrupts.clone(),
                                iterations,
                                resume_values,
                            },
                            interrupts,
                        });
                    }
                }
                Err(e) => return Err(e),
            }

            // Determine next node
            current_node = self.get_next_node(&current_node, &state)?;
        }

        if iterations >= self.config.max_iterations {
            return Err(GraphError::MaxIterationsExceeded);
        }

        Ok(ExecutionResult::Complete(state))
    }

    // ============ Ablation Study Methods ============

    /// Run ablation study with multiple configurations
    pub async fn run_ablation<F>(
        &self,
        test_inputs: Vec<S>,
        configs: Vec<ExecutionConfig>,
        _state_factory: F,
    ) -> Vec<(String, RunMetrics)>
    where
        F: FnMut() -> S,
        S: Clone,
    {
        let collector = Arc::new(MetricsCollector::new());
        let mut results = Vec::new();

        for config in configs {
            let config_id = config.config_id.clone();

            for input in &test_inputs {
                // Create a new graph with this config
                let graph = CompiledGraph {
                    nodes: self.nodes.clone(),
                    edges: self.edges.clone(),
                    branches: self.branches.clone(),
                    config: config.clone(),
                    metrics_collector: Some(collector.clone()),
                };

                // Run and collect metrics
                let _ = graph.invoke_with_metrics(input.clone()).await;
            }

            // Get aggregated metrics for this config
            let runs = collector.get_runs_by_config(&config_id);
            for run in runs {
                results.push((config_id.clone(), run));
            }
        }

        results
    }

    /// Get current config
    pub fn config(&self) -> &ExecutionConfig {
        &self.config
    }

    /// Get metrics collector
    pub fn metrics_collector(&self) -> Option<&Arc<MetricsCollector>> {
        self.metrics_collector.as_ref()
    }
}

// Need to implement Clone for CompiledGraph to support ablation studies
impl<S: GraphState> Clone for CompiledGraph<S> {
    fn clone(&self) -> Self {
        Self {
            nodes: self.nodes.clone(),
            edges: self.edges.clone(),
            branches: self.branches.clone(),
            config: self.config.clone(),
            metrics_collector: self.metrics_collector.clone(),
        }
    }
}

/// Execution trace for debugging
#[derive(Clone, Debug)]
pub struct ExecutionTrace {
    pub steps: Vec<TraceStep>,
}

#[derive(Clone, Debug)]
pub struct TraceStep {
    pub node: String,
    pub timestamp: std::time::Instant,
    pub duration_ms: u64,
}

impl ExecutionTrace {
    pub fn new() -> Self {
        Self { steps: Vec::new() }
    }

    pub fn add_step(&mut self, node: String, duration_ms: u64) {
        self.steps.push(TraceStep {
            node,
            timestamp: std::time::Instant::now(),
            duration_ms,
        });
    }
}

impl Default for ExecutionTrace {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execution_config() {
        let config = ExecutionConfig::new()
            .mask_node("planner")
            .mask_node("researcher")
            .with_config_id("test_config")
            .with_metrics();

        assert!(config.is_masked("planner"));
        assert!(config.is_masked("researcher"));
        assert!(!config.is_masked("executor"));
        assert_eq!(config.config_id, "test_config");
        assert!(config.collect_metrics);
    }

    #[test]
    fn test_ablation_config() {
        let masked: HashSet<String> = vec!["planner".to_string()].into_iter().collect();
        let config = ExecutionConfig::for_ablation("no_planner", masked);

        assert!(config.is_masked("planner"));
        assert!(config.collect_metrics);
    }
}
