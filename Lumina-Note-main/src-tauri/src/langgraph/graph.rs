//! StateGraph - the main graph builder
//!
//! StateGraph is used to define nodes, edges, and compile the graph for execution.

use std::collections::{HashMap, HashSet};
use std::future::Future;

use crate::langgraph::branch::{Branch, BranchSpec};
use crate::langgraph::constants::{has_reserved_chars, is_reserved_name, END, START};
use crate::langgraph::error::{GraphError, GraphResult};
use crate::langgraph::executor::CompiledGraph;
use crate::langgraph::node::NodeSpec;
use crate::langgraph::state::GraphState;

/// Edge type
#[derive(Clone, Debug)]
pub enum Edge {
    /// Direct edge to a specific node
    Direct(String),
    /// Conditional edge with a branch
    Conditional(String), // branch name
}

/// StateGraph builder
///
/// Use this to define your graph structure, then compile it for execution.
///
/// # Example
/// ```rust,no_run
/// use lumina_note_lib::langgraph::constants::START;
/// use lumina_note_lib::langgraph::prelude::{GraphError, StateGraph, END};
/// use lumina_note_lib::langgraph::state::GraphState;
///
/// #[derive(Clone, Default)]
/// struct MyState {
///     counter: usize,
/// }
///
/// impl GraphState for MyState {}
///
/// async fn process_fn(state: MyState) -> Result<MyState, GraphError> {
///     Ok(state)
/// }
///
/// async fn validate_fn(state: MyState) -> Result<MyState, GraphError> {
///     Ok(state)
/// }
///
/// fn router_fn(_state: MyState) -> Result<String, GraphError> {
///     Ok("validate".to_string())
/// }
///
/// # async fn run() -> Result<(), GraphError> {
/// let mut graph = StateGraph::<MyState>::new();
///
/// // Add nodes
/// graph.add_node("process", process_fn);
/// graph.add_node("validate", validate_fn);
///
/// // Add edges
/// graph.add_edge(START, "process");
/// graph.add_conditional_edges("process", router_fn, None);
/// graph.add_edge("validate", END);
///
/// // Compile and use
/// let compiled = graph.compile()?;
/// let _result = compiled.invoke(MyState::default()).await?;
/// # Ok(())
/// # }
/// ```
pub struct StateGraph<S: GraphState> {
    /// Registered nodes
    pub(crate) nodes: HashMap<String, NodeSpec<S>>,
    /// Edges from each node
    pub(crate) edges: HashMap<String, Vec<Edge>>,
    /// Conditional branches
    pub(crate) branches: HashMap<String, BranchSpec<S>>,
    /// Whether the graph has been compiled
    compiled: bool,
}

impl<S: GraphState> StateGraph<S> {
    /// Create a new empty graph
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            edges: HashMap::new(),
            branches: HashMap::new(),
            compiled: false,
        }
    }

    /// Add a node to the graph
    ///
    /// # Arguments
    /// * `name` - Unique name for the node
    /// * `func` - Async function that processes state
    ///
    /// # Example
    /// ```rust,no_run
    /// use lumina_note_lib::langgraph::prelude::{GraphError, StateGraph};
    /// use lumina_note_lib::langgraph::state::GraphState;
    ///
    /// #[derive(Clone, Default)]
    /// struct MyState;
    ///
    /// impl GraphState for MyState {}
    ///
    /// let mut graph = StateGraph::<MyState>::new();
    /// graph.add_node("my_node", |state| async move {
    ///     // Process state
    ///     Ok::<_, GraphError>(state)
    /// });
    /// ```
    pub fn add_node<F, Fut>(&mut self, name: impl Into<String>, func: F) -> &mut Self
    where
        F: Fn(S) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = GraphResult<S>> + Send + 'static,
    {
        let name = name.into();

        if is_reserved_name(&name) {
            panic!("Node name '{}' is reserved", name);
        }
        if has_reserved_chars(&name) {
            panic!("Node name '{}' contains reserved characters", name);
        }
        if self.nodes.contains_key(&name) {
            panic!("Node '{}' already exists", name);
        }

        self.nodes.insert(name.clone(), NodeSpec::new(name, func));
        self
    }

    /// Add a node with a NodeSpec
    pub fn add_node_spec(&mut self, spec: NodeSpec<S>) -> &mut Self {
        let name = spec.name.clone();

        if is_reserved_name(&name) {
            panic!("Node name '{}' is reserved", name);
        }
        if self.nodes.contains_key(&name) {
            panic!("Node '{}' already exists", name);
        }

        self.nodes.insert(name, spec);
        self
    }

    /// Add a direct edge between nodes
    ///
    /// # Arguments
    /// * `from` - Source node (use `START` for entry point)
    /// * `to` - Destination node (use `END` for exit point)
    pub fn add_edge(&mut self, from: impl Into<String>, to: impl Into<String>) -> &mut Self {
        let from = from.into();
        let to = to.into();

        if from == END {
            panic!("END cannot be a source node");
        }
        if to == START {
            panic!("START cannot be a destination node");
        }

        self.edges.entry(from).or_default().push(Edge::Direct(to));
        self
    }

    /// Add conditional edges from a node
    ///
    /// # Arguments
    /// * `from` - Source node
    /// * `path` - Function that determines the next node (receives cloned state)
    /// * `path_map` - Optional mapping from function results to node names
    pub fn add_conditional_edges<F>(
        &mut self,
        from: impl Into<String>,
        path: F,
        path_map: Option<HashMap<String, String>>,
    ) -> &mut Self
    where
        F: Fn(S) -> GraphResult<String> + Send + Sync + 'static,
    {
        let from = from.into();
        let branch_name = format!("branch_{}", self.branches.len());

        let branch = match path_map {
            Some(map) => BranchSpec::with_map(&branch_name, path, map),
            None => BranchSpec::new(&branch_name, path),
        };

        self.branches.insert(branch_name.clone(), branch);
        self.edges
            .entry(from)
            .or_default()
            .push(Edge::Conditional(branch_name));
        self
    }

    /// Add conditional edges with a simple sync router function
    ///
    /// This is a convenience method that wraps the function to return GraphResult
    pub fn add_conditional_edges_sync<F>(
        &mut self,
        from: impl Into<String>,
        path: F,
        path_map: Option<HashMap<String, String>>,
    ) -> &mut Self
    where
        F: Fn(&S) -> String + Send + Sync + 'static,
    {
        self.add_conditional_edges(from, move |state: S| Ok(path(&state)), path_map)
    }

    /// Set the entry point of the graph
    ///
    /// Equivalent to `add_edge(START, node)`
    pub fn set_entry_point(&mut self, node: impl Into<String>) -> &mut Self {
        self.add_edge(START, node)
    }

    /// Set a conditional entry point
    pub fn set_conditional_entry_point<F>(
        &mut self,
        path: F,
        path_map: Option<HashMap<String, String>>,
    ) -> &mut Self
    where
        F: Fn(S) -> GraphResult<String> + Send + Sync + 'static,
    {
        self.add_conditional_edges(START, path, path_map)
    }

    /// Set a finish point for the graph
    ///
    /// Equivalent to `add_edge(node, END)`
    pub fn set_finish_point(&mut self, node: impl Into<String>) -> &mut Self {
        self.add_edge(node, END)
    }

    /// Add a sequence of nodes that execute in order
    pub fn add_sequence<I, F, Fut>(&mut self, nodes: I) -> &mut Self
    where
        I: IntoIterator<Item = (String, F)>,
        F: Fn(S) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = GraphResult<S>> + Send + 'static,
    {
        let nodes: Vec<_> = nodes.into_iter().collect();

        if nodes.is_empty() {
            return self;
        }

        let mut prev_name: Option<String> = None;

        for (name, func) in nodes {
            self.add_node(&name, func);

            if let Some(prev) = prev_name {
                self.add_edge(prev, &name);
            }

            prev_name = Some(name);
        }

        self
    }

    /// Validate the graph structure
    pub fn validate(&self) -> GraphResult<()> {
        // Check for entry point
        if !self.edges.contains_key(START) {
            return Err(GraphError::NoEntryPoint);
        }

        // Collect all source nodes
        let all_sources: HashSet<&str> = self.edges.keys().map(|s| s.as_str()).collect();

        // Validate source nodes exist
        for source in &all_sources {
            if *source != START && !self.nodes.contains_key(*source) {
                return Err(GraphError::NodeNotFound((*source).to_string()));
            }
        }

        // Collect all target nodes
        let mut all_targets: HashSet<String> = HashSet::new();
        for edges in self.edges.values() {
            for edge in edges {
                match edge {
                    Edge::Direct(to) => {
                        all_targets.insert(to.clone());
                    }
                    Edge::Conditional(branch_name) => {
                        if let Some(branch) = self.branches.get(branch_name) {
                            if let Some(map) = branch.destinations() {
                                for target in map.values() {
                                    all_targets.insert(target.clone());
                                }
                            }
                        }
                    }
                }
            }
        }

        // Validate target nodes exist
        for target in &all_targets {
            if target != END && !self.nodes.contains_key(target) {
                return Err(GraphError::NodeNotFound(target.clone()));
            }
        }

        Ok(())
    }

    /// Compile the graph for execution
    pub fn compile(mut self) -> GraphResult<CompiledGraph<S>> {
        self.validate()?;
        self.compiled = true;
        Ok(CompiledGraph::new(self))
    }
}

impl<S: GraphState> Default for StateGraph<S> {
    fn default() -> Self {
        Self::new()
    }
}
