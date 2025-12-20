# LangGraph Rust 框架文档

> 基于 LangGraph 官方设计理念的 Rust 实现，用于构建有状态的多智能体应用。

## 目录

- [1. 概述](#1-概述)
- [2. 与官方 LangGraph 对比](#2-与官方-langgraph-对比)
- [3. 快速开始](#3-快速开始)
- [4. API 参考](#4-api-参考)
- [5. 高级用法](#5-高级用法)
- [6. 迁移指南](#6-迁移指南)

---

## 1. 概述

### 1.1 什么是 LangGraph Rust？

LangGraph Rust 是 [LangGraph](https://github.com/langchain-ai/langgraph) 的 Rust 实现，提供了构建有状态、多步骤 AI 应用的能力。它允许你将复杂的 AI 工作流定义为图结构，其中：

- **节点 (Node)**: 执行具体操作的函数
- **边 (Edge)**: 定义节点间的执行顺序
- **状态 (State)**: 在节点间共享的数据

### 1.2 为什么选择 Rust 实现？

| 优势 | 说明 |
|------|------|
| **性能** | Rust 的零成本抽象和内存安全，适合高性能场景 |
| **Tauri 集成** | 原生支持 Tauri 应用，无需跨语言调用 |
| **类型安全** | 编译时检查，减少运行时错误 |
| **无 GC** | 无垃圾回收暂停，响应更稳定 |

### 1.3 适用场景

- ✅ Tauri 桌面应用中的 AI Agent
- ✅ 需要高性能的图执行引擎
- ✅ 简单到中等复杂度的工作流
- ⚠️ 不适合需要 Checkpointer、Time Travel 等高级功能的场景

---

## 2. 与官方 LangGraph 对比

### 2.1 功能对比表

| 功能 | 官方 LangGraph (Python) | langgraph-rust | 状态 |
|------|------------------------|----------------|------|
| **核心功能** | | | |
| StateGraph 构建器 | ✅ `StateGraph(schema)` | ✅ `StateGraph::<S>::new()` | ✅ 完整 |
| START/END 常量 | ✅ | ✅ | ✅ 完整 |
| add_node() | ✅ 支持函数/Runnable | ✅ 支持 async fn | ✅ 完整 |
| add_edge() | ✅ | ✅ | ✅ 完整 |
| add_conditional_edges() | ✅ 支持 path_map | ✅ 支持 path_map | ✅ 完整 |
| add_sequence() | ✅ | ✅ | ✅ 完整 |
| set_entry_point() | ✅ | ✅ | ✅ 完整 |
| set_finish_point() | ✅ | ✅ | ✅ 完整 |
| compile() | ✅ | ✅ | ✅ 完整 |
| **执行方式** | | | |
| invoke() | ✅ 同步 | ✅ async | ✅ 完整 |
| ainvoke() | ✅ 异步 | - (Rust 原生 async) | ✅ 等效 |
| stream() | ✅ 多种 mode | ✅ 基础 callback | ⚠️ 简化 |
| astream() | ✅ 异步流 | - | ⚠️ 待实现 |
| batch() | ✅ 批量执行 | ❌ | ❌ 缺失 |
| **状态管理** | | | |
| GraphState trait | ✅ TypedDict | ✅ trait | ✅ 完整 |
| Channels (LastValue) | ✅ | ✅ | ✅ 完整 |
| Channels (BinaryOp) | ✅ reducer | ✅ | ✅ 完整 |
| Channels (Topic/Append) | ✅ | ✅ AppendChannel | ✅ 完整 |
| **高级功能** | | | |
| Checkpointer (持久化) | ✅ Memory/SQLite/Postgres | ⚠️ 内存 Checkpoint | ⚠️ 简化 |
| Interrupt (中断) | ✅ interrupt() | ✅ interrupt() | ✅ 完整 |
| Send (Map-Reduce) | ✅ 并行执行 | ❌ | ❌ 缺失 |
| Command (控制流) | ✅ goto/resume | ✅ ResumeCommand | ✅ 完整 |
| RetryPolicy | ✅ 完整配置 | ✅ 基础版 | ⚠️ 简化 |
| CachePolicy | ✅ TTL+自定义 | ❌ | ❌ 缺失 |
| **调试与监控** | | | |
| StreamMode | ✅ 7种模式 | ❌ | ❌ 缺失 |
| StateSnapshot | ✅ 状态快照 | ❌ | ❌ 缺失 |
| Time Travel | ✅ 回退重放 | ❌ | ❌ 缺失 |
| Debug mode | ✅ | ✅ 基础 println | ⚠️ 简化 |
| **子图与组合** | | | |
| Subgraphs | ✅ 嵌套图 | ❌ | ❌ 缺失 |
| Human-in-the-loop | ✅ 人工介入 | ✅ interrupt/resume | ✅ 完整 |

### 2.2 完成度评估

```
核心功能:    ████████████████████ 100%
执行方式:    ████████████░░░░░░░░  60%
状态管理:    ████████████████████ 100%
高级功能:    ████████████░░░░░░░░  60%  ← interrupt/resume 已实现
调试监控:    ████░░░░░░░░░░░░░░░░  20%
子图组合:    ████████░░░░░░░░░░░░  50%  ← human-in-the-loop 已实现
────────────────────────────────────
总体完成:    ████████████████░░░░  65%
```

### 2.3 API 风格对比

**Python (官方)**:
```python
from langgraph.graph import StateGraph, START, END
from typing import TypedDict

class State(TypedDict):
    messages: list[str]
    count: int

def process(state: State) -> dict:
    return {"count": state["count"] + 1}

graph = StateGraph(State)
graph.add_node("process", process)
graph.add_edge(START, "process")
graph.add_edge("process", END)

compiled = graph.compile()
result = compiled.invoke({"messages": [], "count": 0})
```

**Rust (本实现)**:
```rust
use crate::langgraph::prelude::*;

#[derive(Clone, Default)]
struct State {
    messages: Vec<String>,
    count: i32,
}

impl GraphState for State {}

async fn process(mut state: State) -> GraphResult<State> {
    state.count += 1;
    Ok(state)
}

let mut graph = StateGraph::<State>::new();
graph.add_node("process", process);
graph.add_edge(START, "process");
graph.add_edge("process", END);

let compiled = graph.compile()?;
let result = compiled.invoke(State::default()).await?;
```

---

## 3. 快速开始

### 3.1 目录结构

```
src-tauri/src/langgraph/
├── mod.rs          # 模块入口 + prelude
├── constants.rs    # START, END 等常量
├── error.rs        # GraphError 错误类型
├── state.rs        # GraphState trait
├── node.rs         # Node trait + NodeSpec
├── branch.rs       # Branch trait + BranchSpec（条件路由）
├── graph.rs        # StateGraph 构建器
├── executor.rs     # CompiledGraph 执行器
└── channel.rs      # Channel 状态聚合（可选）
```

### 3.2 基础示例

```rust
use crate::langgraph::prelude::*;

// 1. 定义状态
#[derive(Clone, Default)]
struct AgentState {
    task: String,
    result: String,
    step_count: i32,
}

impl GraphState for AgentState {}

// 2. 定义节点
async fn analyze(mut state: AgentState) -> GraphResult<AgentState> {
    state.step_count += 1;
    println!("Analyzing task: {}", state.task);
    Ok(state)
}

async fn execute(mut state: AgentState) -> GraphResult<AgentState> {
    state.step_count += 1;
    state.result = format!("Completed: {}", state.task);
    Ok(state)
}

// 3. 构建图
fn build_graph() -> GraphResult<CompiledGraph<AgentState>> {
    let mut graph = StateGraph::<AgentState>::new();
    
    graph.add_node("analyze", analyze);
    graph.add_node("execute", execute);
    
    graph.add_edge(START, "analyze");
    graph.add_edge("analyze", "execute");
    graph.add_edge("execute", END);
    
    graph.compile()
}

// 4. 执行
async fn run() -> GraphResult<()> {
    let graph = build_graph()?;
    
    let initial_state = AgentState {
        task: "Write a report".to_string(),
        ..Default::default()
    };
    
    let result = graph.invoke(initial_state).await?;
    println!("Result: {}", result.result);
    println!("Steps: {}", result.step_count);
    
    Ok(())
}
```

### 3.3 条件路由示例

```rust
use crate::langgraph::prelude::*;
use std::collections::HashMap;

#[derive(Clone, Default)]
struct RouterState {
    intent: String,
    response: String,
}

impl GraphState for RouterState {}

async fn coordinator(mut state: RouterState) -> GraphResult<RouterState> {
    // 分析意图
    state.intent = if state.response.contains("edit") {
        "edit".to_string()
    } else {
        "chat".to_string()
    };
    Ok(state)
}

async fn editor(mut state: RouterState) -> GraphResult<RouterState> {
    state.response = "Editing...".to_string();
    Ok(state)
}

async fn chatter(mut state: RouterState) -> GraphResult<RouterState> {
    state.response = "Hello!".to_string();
    Ok(state)
}

fn build_router_graph() -> GraphResult<CompiledGraph<RouterState>> {
    let mut graph = StateGraph::<RouterState>::new();
    
    graph.add_node("coordinator", coordinator);
    graph.add_node("editor", editor);
    graph.add_node("chatter", chatter);
    
    graph.add_edge(START, "coordinator");
    
    // 条件路由
    graph.add_conditional_edges_sync(
        "coordinator",
        |state: &RouterState| {
            match state.intent.as_str() {
                "edit" => "editor".to_string(),
                _ => "chatter".to_string(),
            }
        },
        None,
    );
    
    graph.add_edge("editor", END);
    graph.add_edge("chatter", END);
    
    graph.compile()
}
```

---

## 4. API 参考

### 4.1 StateGraph

图构建器，用于定义节点和边。

```rust
impl<S: GraphState> StateGraph<S> {
    /// 创建新的空图
    pub fn new() -> Self;
    
    /// 添加节点
    pub fn add_node<F, Fut>(&mut self, name: &str, func: F) -> &mut Self
    where
        F: Fn(S) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = GraphResult<S>> + Send + 'static;
    
    /// 添加直接边
    pub fn add_edge(&mut self, from: &str, to: &str) -> &mut Self;
    
    /// 添加条件边
    pub fn add_conditional_edges<F>(
        &mut self,
        from: &str,
        path: F,
        path_map: Option<HashMap<String, String>>,
    ) -> &mut Self
    where
        F: Fn(S) -> GraphResult<String> + Send + Sync + 'static;
    
    /// 添加条件边（简化版，无需 Result）
    pub fn add_conditional_edges_sync<F>(
        &mut self,
        from: &str,
        path: F,
        path_map: Option<HashMap<String, String>>,
    ) -> &mut Self
    where
        F: Fn(&S) -> String + Send + Sync + 'static;
    
    /// 设置入口点（等同于 add_edge(START, node)）
    pub fn set_entry_point(&mut self, node: &str) -> &mut Self;
    
    /// 设置结束点（等同于 add_edge(node, END)）
    pub fn set_finish_point(&mut self, node: &str) -> &mut Self;
    
    /// 编译图
    pub fn compile(self) -> GraphResult<CompiledGraph<S>>;
}
```

### 4.2 GraphState

状态 trait，你的状态类型需要实现它。

```rust
pub trait GraphState: Clone + Send + Sync + 'static {
    /// 获取下一个节点（可选，用于内部路由）
    fn get_next(&self) -> Option<&str> { None }
    
    /// 设置下一个节点
    fn set_next(&mut self, next: Option<String>) {}
    
    /// 检查是否完成
    fn is_complete(&self) -> bool { false }
    
    /// 标记完成
    fn mark_complete(&mut self) {}
}
```

**基础实现示例**:

```rust
#[derive(Clone, Default)]
struct MyState {
    data: String,
    count: i32,
}

// 最简实现：只需 derive Clone 即可
impl GraphState for MyState {}
```

### 4.3 CompiledGraph

编译后的图，用于执行。

```rust
impl<S: GraphState> CompiledGraph<S> {
    /// 执行图
    pub async fn invoke(&self, initial_state: S) -> GraphResult<S>;
    
    /// 流式执行，每个节点完成后调用回调
    pub async fn stream<F>(&self, initial_state: S, callback: F) -> GraphResult<S>
    where
        F: FnMut(&str, &S);
    
    /// 设置最大迭代次数
    pub fn with_max_iterations(self, max: usize) -> Self;
    
    /// 启用调试模式
    pub fn with_debug(self, debug: bool) -> Self;
    
    /// 获取所有节点名
    pub fn get_nodes(&self) -> Vec<&str>;
    
    /// 检查节点是否存在
    pub fn has_node(&self, name: &str) -> bool;
}
```

### 4.4 常量

```rust
/// 入口节点标记
pub const START: &str = "__start__";

/// 出口节点标记
pub const END: &str = "__end__";
```

### 4.5 错误类型

```rust
pub enum GraphError {
    NodeNotFound(String),
    NodeAlreadyExists(String),
    InvalidNodeName(String),
    InvalidEdge { from: String, to: String, reason: String },
    NoEntryPoint,
    ValidationError(String),
    MaxIterationsExceeded,
    ExecutionError { node: String, message: String },
    BranchError { node: String, message: String },
    NotCompiled,
    CompilationError(String),
    Interrupted(Vec<Interrupt>),  // 🆕 中断等待人类输入
    Other(String),
}

pub type GraphResult<T> = Result<T, GraphError>;
```

### 4.6 中断类型 (Human-in-the-loop)

```rust
/// 中断信息
pub struct Interrupt {
    pub value: serde_json::Value,  // 要显示给用户的数据（问题、选项等）
    pub id: String,                 // 中断 ID，用于恢复
    pub node: String,               // 触发中断的节点名
}

/// 恢复命令
pub struct ResumeCommand {
    pub value: serde_json::Value,   // 用户提供的输入
    pub interrupt_id: Option<String>, // 要恢复的中断 ID（可选）
}

/// 检查点，保存中断时的执行状态
pub struct Checkpoint<S> {
    pub state: S,                   // 当前状态
    pub next_node: String,          // 下一个要执行的节点
    pub pending_interrupts: Vec<Interrupt>,
    pub iterations: usize,
    pub resume_values: HashMap<String, serde_json::Value>,
}

/// 执行结果
pub enum ExecutionResult<S> {
    Complete(S),
    Interrupted {
        checkpoint: Checkpoint<S>,
        interrupts: Vec<Interrupt>,
    },
}

/// 在节点中触发中断的便捷函数
pub fn interrupt<T, V: Serialize>(value: V, node: &str) -> GraphResult<T>;
```

**CompiledGraph 新增方法**：

```rust
impl<S: GraphState> CompiledGraph<S> {
    /// 执行图，支持中断
    pub async fn invoke_resumable(&self, initial_state: S) -> GraphResult<ExecutionResult<S>>;
    
    /// 从检查点恢复执行
    pub async fn resume(&self, checkpoint: Checkpoint<S>, command: ResumeCommand) 
        -> GraphResult<ExecutionResult<S>>;
}
```

---

## 5. 高级用法

### 5.1 使用 Path Map

当路由函数返回的值需要映射到不同节点名时：

```rust
use std::collections::HashMap;

let mut path_map = HashMap::new();
path_map.insert("high".to_string(), "priority_handler".to_string());
path_map.insert("low".to_string(), "normal_handler".to_string());

graph.add_conditional_edges(
    "classifier",
    |state: MyState| {
        if state.score > 80 {
            Ok("high".to_string())
        } else {
            Ok("low".to_string())
        }
    },
    Some(path_map),
);
```

### 5.2 流式执行与回调

```rust
let result = graph.stream(initial_state, |node_name, state| {
    println!("Node '{}' completed", node_name);
    println!("Current state: {:?}", state);
    
    // 可以在这里发送事件到前端
    // app.emit("graph-progress", { node: node_name, ... });
}).await?;
```

### 5.3 错误处理

```rust
async fn risky_node(state: MyState) -> GraphResult<MyState> {
    if state.data.is_empty() {
        return Err(GraphError::ExecutionError {
            node: "risky_node".to_string(),
            message: "Data cannot be empty".to_string(),
        });
    }
    Ok(state)
}

// 执行时捕获错误
match graph.invoke(state).await {
    Ok(result) => println!("Success: {:?}", result),
    Err(GraphError::ExecutionError { node, message }) => {
        println!("Node '{}' failed: {}", node, message);
    }
    Err(e) => println!("Other error: {}", e),
}
```

### 5.4 Channel 状态聚合

用于复杂的状态更新逻辑：

```rust
use crate::langgraph::channel::{LastValue, AppendChannel, BinaryOpChannel, reducers};

// LastValue - 只保留最新值
let counter = LastValue::<i32>::new("counter");

// AppendChannel - 累积到列表
let messages = AppendChannel::<String>::new("messages");

// BinaryOpChannel - 使用自定义 reducer
let sum = BinaryOpChannel::new("sum", reducers::add::<i32>);
```

---

## 6. 迁移指南

### 6.1 从现有 Agent 系统迁移

现有的 Agent 系统位于 `src-tauri/src/agent/`，可以逐步迁移到 LangGraph Rust：

**迁移前（直接实现）**:
```rust
// src-tauri/src/agent/graph/executor.rs
pub async fn run(&self, app: &AppHandle, state: GraphState) -> Result<GraphState, String> {
    let mut current_node = "coordinator";
    while current_node != "end" {
        let result = match current_node {
            "coordinator" => coordinator_node(app, &self.llm, state.clone()).await?,
            "planner" => planner_node(app, &self.llm, state.clone()).await?,
            // ...
        };
        current_node = result.next_node.unwrap_or("end");
        state = result.state;
    }
    Ok(state)
}
```

**迁移后（使用 LangGraph）**:
```rust
use crate::langgraph::prelude::*;

fn build_agent_graph(llm: LlmClient) -> GraphResult<CompiledGraph<AgentState>> {
    let mut graph = StateGraph::<AgentState>::new();
    
    // 节点定义更清晰
    graph.add_node("coordinator", move |s| coordinator(s, &llm));
    graph.add_node("planner", move |s| planner(s, &llm));
    graph.add_node("editor", move |s| editor(s, &llm));
    graph.add_node("reporter", move |s| reporter(s, &llm));
    
    // 边定义集中管理
    graph.set_entry_point("coordinator");
    graph.add_conditional_edges_sync("coordinator", |s| {
        match s.intent {
            Intent::Chat => "reporter",
            Intent::Edit => "editor",
            Intent::Complex => "planner",
            _ => END,
        }.to_string()
    }, None);
    graph.add_edge("editor", "reporter");
    graph.add_edge("planner", "executor");
    graph.set_finish_point("reporter");
    
    graph.compile()
}
```

### 6.2 迁移检查清单

- [ ] 定义 `AgentState` 并实现 `GraphState`
- [ ] 将每个节点函数改为返回 `GraphResult<State>`
- [ ] 创建 `StateGraph` 并添加节点
- [ ] 定义边和条件路由
- [ ] 替换原有的执行循环为 `compiled.invoke()`
- [ ] 更新错误处理逻辑
- [ ] 测试所有路径

---

## 附录

### A. 完整示例项目结构

```
src-tauri/src/
├── langgraph/           # 框架（不修改）
│   ├── mod.rs
│   ├── state.rs
│   ├── node.rs
│   ├── branch.rs
│   ├── graph.rs
│   └── executor.rs
│
└── agent/               # 业务实现
    ├── mod.rs
    ├── state.rs         # AgentState 定义
    ├── nodes/           # 节点实现
    │   ├── coordinator.rs
    │   ├── planner.rs
    │   ├── editor.rs
    │   └── reporter.rs
    ├── router.rs        # 路由逻辑
    └── builder.rs       # 图构建
```

### B. 常见问题

**Q: 为什么没有 Checkpointer？**

A: Checkpointer 需要序列化/反序列化状态和持久化存储，这在 Rust 中实现较复杂。对于 Tauri 应用，可以使用前端状态管理（如 Zustand）配合 localStorage 实现类似功能。

**Q: 如何实现 Human-in-the-loop？**

A: 使用 `interrupt()` 函数暂停执行，等待用户输入后用 `resume()` 继续：

```rust
use crate::langgraph::prelude::*;

// 1. 在节点中触发中断
async fn clarify_node(state: MyState) -> GraphResult<MyState> {
    if state.needs_clarification {
        // 中断执行，向用户提问
        return interrupt(
            serde_json::json!({
                "question": "请问您想搜索什么主题？",
                "options": ["技术", "生活", "其他"]
            }),
            "clarify"
        );
    }
    Ok(state)
}

// 2. 执行图（可能被中断）
let result = graph.invoke_resumable(initial_state).await?;

match result {
    ExecutionResult::Complete(state) => {
        println!("执行完成: {:?}", state);
    }
    ExecutionResult::Interrupted { checkpoint, interrupts } => {
        // 保存 checkpoint，发送 interrupts 到前端
        println!("需要用户输入: {:?}", interrupts[0].value);
        
        // 前端用户输入后，恢复执行
        let user_input = "技术";
        let resume_cmd = ResumeCommand::new(user_input);
        let final_result = graph.resume(checkpoint, resume_cmd).await?;
    }
}
```

**Q: 如何调试图执行？**

A: 使用 `with_debug(true)` 启用调试输出，或使用 `stream()` 方法监控每个节点的执行。

---

## 7. 实际重构记录

### 7.1 重构状态

✅ **已完成重构** - Agent 系统已成功迁移到 langgraph-rust 框架

### 7.2 实际目录结构

```
src-tauri/src/
├── langgraph/              # 框架层（通用，不含业务逻辑）
│   ├── README.md           # 本文档
│   ├── mod.rs              # 模块入口
│   ├── constants.rs        # START, END 常量
│   ├── error.rs            # GraphError 类型
│   ├── state.rs            # GraphState trait
│   ├── node.rs             # Node trait
│   ├── branch.rs           # Branch 条件路由
│   ├── graph.rs            # StateGraph 构建器
│   ├── executor.rs         # CompiledGraph 执行器
│   └── channel.rs          # Channel 状态聚合
│
└── agent/                  # 业务层（使用框架实现）
    ├── mod.rs
    ├── types.rs            # GraphState + 业务类型
    ├── llm_client.rs       # LLM API 调用
    ├── commands.rs         # Tauri 命令（含执行切换）
    ├── tools/              # 工具定义和执行
    └── graph/
        ├── mod.rs
        ├── nodes.rs        # 节点实现
        ├── router.rs       # 路由逻辑
        ├── executor.rs     # 旧执行器（保留兼容）
        └── builder.rs      # 🆕 使用 langgraph-rust 构建图
```

### 7.3 关键改动

1. **GraphState 实现 LangGraphState trait**
   ```rust
   // src-tauri/src/agent/types.rs
   impl LangGraphState for GraphState {
       fn get_next(&self) -> Option<&str> { ... }
       fn set_next(&mut self, next: Option<String>) { ... }
       fn is_complete(&self) -> bool { ... }
       fn mark_complete(&mut self) { ... }
   }
   ```

2. **AgentContext 封装执行依赖**
   ```rust
   // src-tauri/src/agent/graph/builder.rs
   pub struct AgentContext {
       pub app: AppHandle,
       pub llm: Arc<LlmClient>,
       pub config: AgentConfig,
   }
   ```

3. **build_agent_graph() 构建图**
   ```rust
   pub fn build_agent_graph(ctx: AgentContext) -> GraphResult<CompiledGraph<GraphState>> {
       let mut graph = StateGraph::<GraphState>::new();
       
       // 添加节点
       graph.add_node("coordinator", |state| { ... });
       graph.add_node("planner", |state| { ... });
       // ...
       
       // 定义边
       graph.set_entry_point("coordinator");
       graph.add_conditional_edges_sync("coordinator", router_fn, None);
       // ...
       
       graph.compile()
   }
   ```

4. **执行切换开关**
   ```rust
   // src-tauri/src/agent/commands.rs
   const USE_LANGGRAPH: bool = true;  // 切换执行方式
   
   // true  -> 使用 langgraph-rust 框架
   // false -> 使用旧的直接实现
   ```

### 7.4 图结构

```
    ┌─────────────┐
    │   START     │
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │ coordinator │ ─── 分析用户意图
    └──────┬──────┘
           │
     ┌─────┴─────┬─────────┬─────────┬─────────┐
     ▼           ▼         ▼         ▼         ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌─────────┐ ┌────────┐
│ editor │ │ writer │ │research│ │organizer│ │planner │
└────┬───┘ └────┬───┘ └────┬───┘ └────┬────┘ └────┬───┘
     │          │          │          │           │
     │          │          │          │           ▼
     │          │          │          │     ┌──────────┐
     │          │          │          │     │ executor │
     │          │          │          │     └────┬─────┘
     │          │          │          │          │
     └──────────┴──────────┴──────────┴──────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  reporter   │ ─── 汇总结果
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    END      │
                    └─────────────┘
```

---

*最后更新: 2024-12-13*

---

## 8. Interrupt/Resume 使用指南

### 8.1 基本流程

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  节点 A  │ ──▶ │ 澄清节点 │ ──▶ │  节点 B  │
└──────────┘     └────┬─────┘     └──────────┘
                      │
                      │ interrupt()
                      ▼
              ┌───────────────┐
              │ 返回 Checkpoint│
              │ + Interrupts  │
              └───────┬───────┘
                      │
                      │ 等待用户输入
                      ▼
              ┌───────────────┐
              │   前端 UI     │
              │ 显示问题/选项 │
              └───────┬───────┘
                      │
                      │ 用户输入
                      ▼
              ┌───────────────┐
              │ resume() +    │
              │ ResumeCommand │
              └───────┬───────┘
                      │
                      │ 继续执行
                      ▼
              ┌───────────────┐
              │   节点 B...   │
              └───────────────┘
```

### 8.2 完整示例

```rust
use crate::langgraph::prelude::*;

#[derive(Clone, Default)]
struct ResearchState {
    query: String,
    clarified_query: Option<String>,
    results: Vec<String>,
}

impl GraphState for ResearchState {}

// 分析节点：判断是否需要澄清
async fn analyze(state: ResearchState) -> GraphResult<ResearchState> {
    // 简单的意图检测
    if state.query.len() < 5 {
        // 查询太短，需要澄清
        return interrupt(
            serde_json::json!({
                "type": "clarification",
                "message": "您的查询比较简短，请提供更多细节：",
                "suggestions": [
                    "请描述您想搜索的具体内容",
                    "可以提供一些关键词吗？"
                ]
            }),
            "analyze"
        );
    }
    Ok(state)
}

// 搜索节点
async fn search(mut state: ResearchState) -> GraphResult<ResearchState> {
    let query = state.clarified_query.as_ref().unwrap_or(&state.query);
    state.results = vec![format!("搜索结果: {}", query)];
    Ok(state)
}

// 构建图
fn build_graph() -> GraphResult<CompiledGraph<ResearchState>> {
    let mut graph = StateGraph::<ResearchState>::new();
    
    graph.add_node("analyze", analyze);
    graph.add_node("search", search);
    
    graph.add_edge(START, "analyze");
    graph.add_edge("analyze", "search");
    graph.add_edge("search", END);
    
    graph.compile()
}

// 执行
async fn run_research(query: String) -> GraphResult<ResearchState> {
    let graph = build_graph()?;
    
    let initial = ResearchState {
        query,
        ..Default::default()
    };
    
    let result = graph.invoke_resumable(initial).await?;
    
    match result {
        ExecutionResult::Complete(state) => Ok(state),
        ExecutionResult::Interrupted { checkpoint, interrupts } => {
            // 这里应该发送到前端，等待用户输入
            // 简化示例：直接恢复
            let user_input = "用户提供的详细查询";
            
            let mut state = checkpoint.state.clone();
            state.clarified_query = Some(user_input.to_string());
            
            let resumed = Checkpoint {
                state,
                ..checkpoint
            };
            
            let cmd = ResumeCommand::new(user_input);
            
            match graph.resume(resumed, cmd).await? {
                ExecutionResult::Complete(state) => Ok(state),
                _ => Err(GraphError::Other("Unexpected interrupt".to_string())),
            }
        }
    }
}
```

### 8.3 与 Tauri 前端集成

```rust
// Tauri 命令
#[tauri::command]
async fn start_research(app: AppHandle, query: String) -> Result<String, String> {
    let graph = build_graph().map_err(|e| e.to_string())?;
    
    let result = graph.invoke_resumable(ResearchState { query, ..Default::default() })
        .await
        .map_err(|e| e.to_string())?;
    
    match result {
        ExecutionResult::Complete(state) => {
            Ok(serde_json::to_string(&state.results).unwrap())
        }
        ExecutionResult::Interrupted { checkpoint, interrupts } => {
            // 保存 checkpoint（可以存到内存或序列化）
            CHECKPOINTS.lock().unwrap().insert("current", checkpoint);
            
            // 发送中断事件到前端
            app.emit("research-interrupt", &interrupts).ok();
            
            Err("INTERRUPTED".to_string())
        }
    }
}

#[tauri::command]
async fn resume_research(app: AppHandle, user_input: String) -> Result<String, String> {
    let checkpoint = CHECKPOINTS.lock().unwrap().remove("current")
        .ok_or("No checkpoint found")?;
    
    let graph = build_graph().map_err(|e| e.to_string())?;
    let cmd = ResumeCommand::new(user_input);
    
    match graph.resume(checkpoint, cmd).await.map_err(|e| e.to_string())? {
        ExecutionResult::Complete(state) => {
            Ok(serde_json::to_string(&state.results).unwrap())
        }
        ExecutionResult::Interrupted { .. } => {
            Err("Multiple interrupts not supported yet".to_string())
        }
    }
}
```

### 8.4 前端处理

```typescript
// React 组件
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

function ResearchComponent() {
    const [interrupts, setInterrupts] = useState<any[]>([]);
    const [isWaiting, setIsWaiting] = useState(false);
    
    useEffect(() => {
        const unlisten = listen('research-interrupt', (event) => {
            setInterrupts(event.payload as any[]);
            setIsWaiting(true);
        });
        return () => { unlisten.then(f => f()); };
    }, []);
    
    const handleResume = async (userInput: string) => {
        setIsWaiting(false);
        const result = await invoke('resume_research', { userInput });
        console.log('研究完成:', result);
    };
    
    if (isWaiting && interrupts.length > 0) {
        return (
            <div>
                <p>{interrupts[0].value.message}</p>
                <input onKeyDown={(e) => {
                    if (e.key === 'Enter') handleResume(e.currentTarget.value);
                }} />
            </div>
        );
    }
    
    return <div>...</div>;
}
```
