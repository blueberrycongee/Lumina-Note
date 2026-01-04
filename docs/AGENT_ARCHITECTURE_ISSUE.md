# Agent 架构重构计划

## 实施进度

| Phase | 内容 | 状态 | 完成日期 |
|-------|------|------|----------|
| Phase 1 | Rust 端工具审批机制 | ✅ 已完成 | 2026-01-04 |
| Phase 2 | 前端状态迁移 | ✅ 已完成 | 2026-01-04 |
| Phase 3 | SSE 稳定性增强 | ✅ 已完成 | 2026-01-04 |
| Phase 4 | 清理旧代码 | ✅ 已完成 | 2026-01-04 |
| Phase 5 | 测试验证 | ⏳ 待实施 | - |

### 已完成的工作 (Phase 1 ~ 4)

**Rust 后端:**
- ✅ 新增 `WaitingApproval`, `LlmRequestStart/End`, `Heartbeat` 事件类型
- ✅ 实现 `ApprovalManager` 全局单例（使用 `once_cell::Lazy`）
- ✅ 新增 `agent_approve_tool` Tauri 命令
- ✅ 定义 `DANGEROUS_TOOLS` 列表（edit_note, create_note, delete_note, move_note）
- ✅ 在 `ToolRegistry` 中实现 `wait_for_approval()` 异步等待逻辑
- ✅ 传递 `AppHandle` 和 `auto_approve` 到 `ToolRegistry`
- ✅ SSE 心跳机制（每 15 秒发送心跳事件）
- ✅ 流式调用指数退避重试（最多 3 次）
- ✅ 流超时检测（60 秒无数据自动断开）
- ✅ LLM 请求开始/结束事件

**前端:**
- ✅ 新增 `PendingToolApproval` 类型和 `pendingTool` 状态
- ✅ 实现 `approveTool()` / `rejectTool()` / `retryTimeout()` 方法
- ✅ 处理 `waiting_approval`, `llm_request_start/end`, `heartbeat` 事件
- ✅ 更新 `AgentPanel` 和 `MainAIChatShell` 使用 Rust Agent 审批功能
- ✅ 新增 `lastHeartbeat` 和 `connectionStatus` 状态
- ✅ 新增 `useHeartbeatMonitor` Hook（心跳监控）
- ✅ 移除所有组件对 `useAgentStore` 的引用
- ✅ 移除 `USE_RUST_AGENT` 开关，直接使用 Rust Agent

**待删除的旧代码（可选）:**
以下文件不再被引用，可以安全删除：
- `src/stores/useAgentStore.ts`
- `src/agent/core/AgentLoop.ts`
- `src/agent/core/StateManager.ts`
- `src/agent/core/MessageParser.ts`
- `src/agent/core/ToolOutputCache.ts`
- `src/agent/tools/*.ts`

---

## 问题概述

当前项目存在 **两套 Agent 实现并存** 的问题，导致功能断裂、代码混乱、维护困难。

## 现状：双轨并行的混乱架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端 UI 组件                                    │
│                     (AgentPanel / MainAIChatShell)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   USE_RUST_AGENT = true  (硬编码开关)                                        │
│                                                                             │
│   ┌─────────────────────────────┐      ┌─────────────────────────────┐     │
│   │     useRustAgentStore       │      │      useAgentStore          │     │
│   │     (Rust Agent 状态)        │      │   (TypeScript Agent 状态)   │     │
│   │                             │      │                             │     │
│   │  ✅ status                  │      │  ⚠️ pendingTool            │     │
│   │  ✅ messages                │      │  ⚠️ approve / reject       │     │
│   │  ✅ startTask               │      │  ⚠️ retry                  │     │
│   │  ✅ abort                   │      │  ⚠️ retryTimeout           │     │
│   │  ✅ streamingContent        │      │  ⚠️ llmRequestStartTime    │     │
│   │  ✅ currentPlan             │      │                             │     │
│   └──────────────┬──────────────┘      └──────────────┬──────────────┘     │
│                  │                                    │                     │
│                  │ 主要功能                            │ 部分功能仍在使用      │
│                  │                                    │ (但状态不同步!)      │
└──────────────────┼────────────────────────────────────┼─────────────────────┘
                   │                                    │
                   │ Tauri IPC                          │ 直接调用
                   ▼                                    ▼
┌──────────────────────────────────┐    ┌──────────────────────────────────┐
│         Rust Agent 后端          │    │      TypeScript AgentLoop        │
│         (实际执行任务)            │    │      (代码存在但基本不执行)        │
│                                  │    │                                  │
│  src-tauri/src/agent/            │    │  src/agent/core/AgentLoop.ts     │
│                                  │    │                                  │
│  ✅ agent_start_task             │    │  ❌ startTask() - 不被调用       │
│  ✅ call_stream() - 流式输出     │    │  ❌ callLLM() - 非流式          │
│  ✅ MessageChunk 事件            │    │  ✅ 工具审批逻辑 - 已实现        │
│  ✅ PlanUpdated 事件             │    │  ✅ 超时重试逻辑 - 已实现        │
│  ✅ 工具审批 - 已实现 ✨          │    │                                  │
│  ❌ 超时重试 - 未实现            │    │                                  │
└──────────────────────────────────┘    └──────────────────────────────────┘
```

## 具体问题

### 1. 功能断裂：工具审批不工作

**代码位置**: `src/components/chat/AgentPanel.tsx` 第 61 行

```typescript
// Rust Agent 暂不支持的功能，使用旧 store 的
const { pendingTool, approve, reject, retry, llmRequestStartTime, retryTimeout } = legacyStore;
```

**问题**:
- UI 从 `useAgentStore` (legacyStore) 读取 `pendingTool`
- 但实际任务由 Rust Agent 执行
- Rust Agent 不会更新 `useAgentStore` 的状态
- **结果**: 工具审批弹窗永远不会出现

### 2. 功能断裂：超时重试不工作

```typescript
const { llmRequestStartTime, retryTimeout } = legacyStore;
```

**问题**:
- `llmRequestStartTime` 由 TypeScript AgentLoop 设置
- Rust Agent 执行时不会更新这个值
- **结果**: 超时检测和重试功能失效

### 3. SSE 连接稳定性问题

Rust 后端的流式实现 (`src-tauri/src/agent/llm_client.rs`) 缺少：

- ❌ 心跳检测 (Heartbeat)
- ❌ 断点续传 (Last-Event-ID)
- ❌ 指数退避重试 (Exponential Backoff)
- ❌ 连接状态监控

---

## 解决方案：完善 Rust Agent，移除 TypeScript Agent

### 目标架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端 UI 组件                                    │
│                     (AgentPanel / MainAIChatShell)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                        useRustAgentStore                             │  │
│   │                        (唯一的 Agent 状态管理)                        │  │
│   │                                                                      │  │
│   │  ✅ status              ✅ pendingTool (新增)                        │  │
│   │  ✅ messages            ✅ approve / reject (新增)                   │  │
│   │  ✅ startTask           ✅ llmRequestStartTime (新增)                │  │
│   │  ✅ abort               ✅ retryTimeout (新增)                       │  │
│   │  ✅ streamingContent    ✅ retry (新增)                              │  │
│   │  ✅ currentPlan                                                      │  │
│   └──────────────────────────────────┬──────────────────────────────────┘  │
│                                      │                                      │
│                                      │ Tauri IPC                            │
│                                      ▼                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                         Rust Agent 后端                              │  │
│   │                         (完整功能实现)                                │  │
│   │                                                                      │  │
│   │  ✅ agent_start_task          ✅ WaitingApproval 事件 (新增)         │  │
│   │  ✅ call_stream()             ✅ agent_approve_tool (新增)           │  │
│   │  ✅ MessageChunk 事件         ✅ agent_reject_tool (新增)            │  │
│   │  ✅ PlanUpdated 事件          ✅ LLMRequestStart 事件 (新增)         │  │
│   │                               ✅ 心跳检测 (新增)                      │  │
│   │                               ✅ 指数退避重试 (新增)                  │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────┐
                    │      已删除的代码                    │
                    │                                     │
                    │  ❌ src/agent/core/AgentLoop.ts     │
                    │  ❌ src/agent/core/StateManager.ts  │
                    │  ❌ src/stores/useAgentStore.ts     │
                    │  ❌ src/agent/tools/*.ts            │
                    └─────────────────────────────────────┘
```

---

## 实施计划

### Phase 1: Rust 端工具审批机制 (1 天)

#### 1.1 新增事件类型

**文件**: `src-tauri/src/agent/types.rs`

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum AgentEvent {
    // ... 现有事件 ...
    
    /// 等待工具审批
    WaitingApproval { 
        tool: ToolCall,
        request_id: String,  // 用于匹配审批响应
    },
    
    /// LLM 请求开始（用于超时检测）
    LLMRequestStart {
        request_id: String,
        timestamp: u64,
    },
    
    /// LLM 请求结束
    LLMRequestEnd {
        request_id: String,
    },
}
```

#### 1.2 新增 Tauri 命令

**文件**: `src-tauri/src/agent/commands.rs`

```rust
/// 审批工具调用
#[tauri::command]
pub async fn agent_approve_tool(
    app: AppHandle,
    state: State<'_, AgentStateManager>,
    request_id: String,
    approved: bool,
) -> Result<(), String> {
    // 通过 channel 通知正在等待的 Agent
    // ...
}
```

#### 1.3 修改工具执行流程

**文件**: `src-tauri/src/agent/graph/nodes.rs`

在执行危险工具前：
1. 发送 `WaitingApproval` 事件
2. 等待 `agent_approve_tool` 命令
3. 根据结果继续或中止

### Phase 2: 前端状态迁移 (1 天)

#### 2.1 扩展 useRustAgentStore

**文件**: `src/stores/useRustAgentStore.ts`

```typescript
interface RustAgentState {
  // ... 现有状态 ...
  
  // 新增：工具审批
  pendingTool: ToolCall | null;
  pendingToolRequestId: string | null;
  
  // 新增：超时检测
  llmRequestStartTime: number | null;
  llmRequestId: string | null;
  
  // 新增：操作
  approveTool: () => Promise<void>;
  rejectTool: () => Promise<void>;
  retryTimeout: () => Promise<void>;
}
```

#### 2.2 处理新事件

```typescript
_handleEvent: (event) => {
  switch (event.type) {
    // ... 现有事件处理 ...
    
    case "waiting_approval":
      set({
        status: "waiting_approval",
        pendingTool: event.data.tool,
        pendingToolRequestId: event.data.request_id,
      });
      break;
      
    case "llm_request_start":
      set({
        llmRequestStartTime: event.data.timestamp,
        llmRequestId: event.data.request_id,
      });
      break;
      
    case "llm_request_end":
      set({
        llmRequestStartTime: null,
        llmRequestId: null,
      });
      break;
  }
}
```

#### 2.3 修改 UI 组件

**文件**: `src/components/chat/AgentPanel.tsx`

```typescript
// 删除这行
// const { pendingTool, approve, reject, ... } = legacyStore;

// 改为
const { 
  pendingTool, 
  approveTool, 
  rejectTool,
  llmRequestStartTime,
  retryTimeout,
} = useRustAgentStore();
```

**文件**: `src/components/layout/MainAIChatShell.tsx`

同样的修改。

### Phase 3: SSE 稳定性增强 (1 天)

#### 3.1 心跳机制

**文件**: `src-tauri/src/agent/llm_client.rs`

```rust
pub async fn call_stream(...) -> Result<String, String> {
    let heartbeat_interval = Duration::from_secs(15);
    let mut last_data_time = Instant::now();
    
    loop {
        tokio::select! {
            chunk = stream.next() => {
                // 处理数据
                last_data_time = Instant::now();
            }
            
            _ = tokio::time::sleep(heartbeat_interval) => {
                // 发送心跳事件
                app.emit("agent-event", AgentEvent::Heartbeat {
                    timestamp: SystemTime::now(),
                });
            }
        }
        
        // 检测假死
        if last_data_time.elapsed() > Duration::from_secs(60) {
            return Err("Stream timeout: no data for 60 seconds".to_string());
        }
    }
}
```

#### 3.2 指数退避重试

```rust
pub async fn call_with_retry(...) -> Result<LlmResponse, String> {
    let max_retries = 5;
    let base_delay = Duration::from_secs(1);
    
    for attempt in 0..max_retries {
        match self.call(...).await {
            Ok(response) => return Ok(response),
            Err(e) if is_retryable(&e) => {
                let delay = base_delay * 2u32.pow(attempt);
                let jitter = rand::random::<u64>() % 500;
                tokio::time::sleep(delay + Duration::from_millis(jitter)).await;
            }
            Err(e) => return Err(e),
        }
    }
    
    Err("Max retries exceeded".to_string())
}

fn is_retryable(error: &str) -> bool {
    error.contains("timeout") ||
    error.contains("connection") ||
    error.contains("5") // 5xx errors
}
```

#### 3.3 前端心跳监控

**文件**: `src/stores/useRustAgentStore.ts`

```typescript
// 心跳超时检测
useEffect(() => {
  if (status !== "running") return;
  
  const timer = setInterval(() => {
    const elapsed = Date.now() - lastHeartbeat;
    if (elapsed > 45000) { // 45秒无心跳
      set({ connectionStatus: "disconnected" });
    }
  }, 5000);
  
  return () => clearInterval(timer);
}, [status, lastHeartbeat]);
```

### Phase 4: 清理旧代码 (0.5 天)

#### 4.1 删除文件

```
src/agent/core/AgentLoop.ts
src/agent/core/StateManager.ts
src/agent/core/MessageParser.ts
src/agent/core/ToolOutputCache.ts
src/agent/tools/*.ts (所有工具实现)
src/stores/useAgentStore.ts
```

#### 4.2 更新导入

搜索并删除所有对以下内容的引用：
- `useAgentStore`
- `getAgentLoop`
- `resetAgentLoop`
- `AgentLoop`

#### 4.3 移除开关

删除所有 `USE_RUST_AGENT` 相关代码，直接使用 Rust Agent。

### Phase 5: 测试验证 (0.5 天)

#### 5.1 功能测试

| 测试项 | 预期结果 |
|--------|----------|
| 普通对话 | 流式输出，打字机效果 |
| 工具调用（安全） | 自动执行，显示结果 |
| 工具调用（危险） | 弹出审批弹窗 |
| 审批通过 | 继续执行 |
| 审批拒绝 | 中止并提示 |
| LLM 超时 | 显示超时提示，可重试 |
| 网络断开 | 自动重连或提示 |

#### 5.2 回归测试

- Deep Research 功能正常
- AI Chat 功能正常
- 会话管理正常
- 设置保存正常

---

## 时间估算

| Phase | 内容 | 时间 |
|-------|------|------|
| Phase 1 | Rust 端工具审批 | 1 天 |
| Phase 2 | 前端状态迁移 | 1 天 |
| Phase 3 | SSE 稳定性增强 | 1 天 |
| Phase 4 | 清理旧代码 | 0.5 天 |
| Phase 5 | 测试验证 | 0.5 天 |
| **总计** | | **4 天** |

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Rust 端实现复杂 | 延期 | 先实现最小可用版本 |
| 旧代码有隐藏依赖 | 删除后报错 | 分步删除，每步验证 |
| SSE 稳定性难以测试 | 上线后出问题 | 添加详细日志，灰度发布 |

---

## 验收标准

- [ ] 工具审批弹窗正常显示
- [ ] 审批通过/拒绝功能正常
- [ ] LLM 超时有提示，可重试
- [ ] 流式输出稳定，无频繁断开
- [ ] 心跳检测正常工作
- [ ] 旧代码完全移除
- [ ] 无 TypeScript 编译错误
- [ ] 无运行时错误

---

*文档创建时间: 2026-01-04*
*状态: 待实施*
