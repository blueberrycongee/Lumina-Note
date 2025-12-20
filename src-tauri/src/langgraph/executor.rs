//! Graph executor - runs the compiled graph
//! 
//! Supports interrupt/resume for human-in-the-loop workflows.

use std::collections::HashMap;
use serde::{Serialize, Deserialize};

use crate::langgraph::constants::{START, END, MAX_ITERATIONS};
use crate::langgraph::error::{GraphError, GraphResult, Interrupt, ResumeCommand};
use crate::langgraph::state::GraphState;
use crate::langgraph::graph::{StateGraph, Edge};
use crate::langgraph::node::{Node, NodeSpec};
use crate::langgraph::branch::{Branch, BranchSpec};

/// Configuration for graph execution
#[derive(Clone, Debug)]
pub struct ExecutionConfig {
    /// Maximum number of iterations
    pub max_iterations: usize,
    /// Enable debug logging
    pub debug: bool,
    /// Recursion limit
    pub recursion_limit: usize,
}

impl Default for ExecutionConfig {
    fn default() -> Self {
        Self {
            max_iterations: MAX_ITERATIONS,
            debug: false,
            recursion_limit: 25,
        }
    }
}

/// 检查点 - 保存中断时的执行状态
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Checkpoint<S> {
    /// 当前状态
    pub state: S,
    /// 下一个要执行的节点
    pub next_node: String,
    /// 待处理的中断
    pub pending_interrupts: Vec<Interrupt>,
    /// 已完成的迭代次数
    pub iterations: usize,
    /// 恢复值（来自用户输入）
    #[serde(default)]
    pub resume_values: HashMap<String, serde_json::Value>,
}

/// 执行结果 - 可能完成或被中断
#[derive(Debug)]
pub enum ExecutionResult<S> {
    /// 执行完成
    Complete(S),
    /// 被中断，需要人类输入
    Interrupted {
        checkpoint: Checkpoint<S>,
        interrupts: Vec<Interrupt>,
    },
}

/// A compiled graph ready for execution
pub struct CompiledGraph<S: GraphState> {
    /// Node definitions
    nodes: HashMap<String, NodeSpec<S>>,
    /// Edge definitions
    edges: HashMap<String, Vec<Edge>>,
    /// Branch definitions
    branches: HashMap<String, BranchSpec<S>>,
    /// Execution configuration
    config: ExecutionConfig,
}

impl<S: GraphState> CompiledGraph<S> {
    /// Create from a StateGraph
    pub(crate) fn new(graph: StateGraph<S>) -> Self {
        Self {
            nodes: graph.nodes,
            edges: graph.edges,
            branches: graph.branches,
            config: ExecutionConfig::default(),
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
    
    /// Execute the graph with the given initial state
    /// 
    /// Returns the final state after all nodes have been executed.
    pub async fn invoke(&self, initial_state: S) -> GraphResult<S> {
        let mut state = initial_state;
        let mut current_node = self.get_next_node(START, &state)?;
        let mut iterations = 0;
        
        while current_node != END && iterations < self.config.max_iterations {
            iterations += 1;
            
            if self.config.debug {
                println!("[LangGraph] Executing node: {}", current_node);
            }
            
            // Execute the node
            let node = self.nodes.get(&current_node)
                .ok_or_else(|| GraphError::NodeNotFound(current_node.clone()))?;
            
            state = node.execute(state).await?;
            
            // Determine next node
            current_node = self.get_next_node(&current_node, &state)?;
        }
        
        if iterations >= self.config.max_iterations {
            return Err(GraphError::MaxIterationsExceeded);
        }
        
        Ok(state)
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
            
            // Execute the node
            let node = self.nodes.get(&current_node)
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
            Some(edges) => {
                match &edges[0] {
                    Edge::Direct(to) => Ok(to.clone()),
                    Edge::Conditional(branch_name) => {
                        let branch = self.branches.get(branch_name)
                            .ok_or_else(|| GraphError::BranchError {
                                node: current.to_string(),
                                message: format!("Branch '{}' not found", branch_name),
                            })?;
                        
                        let result = branch.evaluate(state)?;
                        branch.resolve(&result)
                    }
                }
            }
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
    
    /// 执行图并支持中断
    /// 
    /// 如果节点返回 Interrupted 错误，会返回 ExecutionResult::Interrupted
    /// 包含检查点信息，可用于后续恢复执行。
    pub async fn invoke_resumable(&self, initial_state: S) -> GraphResult<ExecutionResult<S>> {
        self.run_with_checkpoint(initial_state, START.to_string(), 0, HashMap::new()).await
    }
    
    /// 从检查点恢复执行
    /// 
    /// 使用用户提供的恢复值继续执行被中断的图。
    pub async fn resume(&self, checkpoint: Checkpoint<S>, command: ResumeCommand) -> GraphResult<ExecutionResult<S>> {
        let mut resume_values = checkpoint.resume_values;
        
        // 添加新的恢复值
        if let Some(interrupt_id) = command.interrupt_id {
            resume_values.insert(interrupt_id, command.value);
        } else if let Some(interrupt) = checkpoint.pending_interrupts.first() {
            // 如果没有指定 ID，使用第一个中断的 ID
            resume_values.insert(interrupt.id.clone(), command.value);
        }
        
        self.run_with_checkpoint(
            checkpoint.state,
            checkpoint.next_node,
            checkpoint.iterations,
            resume_values,
        ).await
    }
    
    /// 内部执行方法，支持从任意点开始
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
                println!("[LangGraph] Executing node: {} (iteration {})", current_node, iterations);
            }
            
            // 检查是否有该节点的恢复值
            let has_resume = resume_values.contains_key(&current_node);
            
            // Execute the node
            let node = self.nodes.get(&current_node)
                .ok_or_else(|| GraphError::NodeNotFound(current_node.clone()))?;
            
            match node.execute(state.clone()).await {
                Ok(new_state) => {
                    state = new_state;
                }
                Err(GraphError::Interrupted(interrupts)) => {
                    // 如果有恢复值，跳过中断继续执行
                    if has_resume {
                        // 节点需要从 resume_values 中获取用户输入
                        // 这需要节点自己处理，这里只是继续执行
                        if self.config.debug {
                            println!("[LangGraph] Resuming from interrupt at node: {}", current_node);
                        }
                    } else {
                        // 没有恢复值，返回中断状态
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
