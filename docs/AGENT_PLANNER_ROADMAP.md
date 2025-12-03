# 多 Agent Planner 落地 Roadmap

> 目标：在 Lumina Note 中实现一个稳定、可扩展的 Planner + 多 Agent 协同执行体系，让上层只和一个 Orchestrator 对话，下游由多个专长 Agent 协作完成复杂任务。

---

## 阶段 0：现状梳理 & 能力盘点

### 0.1 现状调研

- **目标**：搞清当前单 Agent / 工具体系的边界与痛点，为后续拆分提供依据。
- **任务**：
  - 梳理 `src/agent` 目录下现有：
    - `AgentLoop` 工作方式（如何读取上下文、调用 LLM、调用 tools）。
    - `ToolRegistry` 注册了哪些工具，如何执行（同步/异步、错误处理）。
    - `prompts/PromptBuilder` 里是否已有“工具调用意图”相关模板。
  - 盘点 `src/services/llm` 中：
    - 目前接入了哪些 LLM Provider（OpenAI / 本地模型等）。
    - 是否已有 JSON 输出约束的封装（例如 `jsonMode`、`response_format`）。
  - 盘点 `src/stores` 内与 Agent 相关的状态：
    - `useAgentStore` 目前存了哪些信息（当前模式、对话历史、工具结果等）。

### 0.2 问题识别

- **目标**：明确为什么要引入 Planner + 多 Agent。
- **关注点**：
  - 单一 Agent 在长任务 / 复杂任务上的局限（如推理错误率高、上下文丢失、任务分解不稳定）。
  - 工具使用是否混乱：
    - LLM 直接“自由发挥”调用工具，缺乏显式、可观测的“任务计划”。
  - 缺少统一的“任务级别”抽象（只有一堆 message 和 tool 调用）。
  - 是否存在难以 debug 的情况：不知道某个复杂任务到底是怎么一步步完成/失败的。

### 0.3 产出物

- `docs/AGENT_PLANNER_ROADMAP.md`（当前文档）。
- 一份简要的 **现状笔记**（可追加到 `docs/AGENT_DEVELOPMENT.md` 或新建 `AGENT_ARCHITECTURE_CURRENT.md`）：
  - 当前 Agent 调用流程时序图。
  - 目前工具列表（按职责分类：DB、RAG、PDF、Note 编辑等）。

---

## 阶段 1：抽象设计（概念 & 类型层面）

### 1.1 定义核心概念

- **Planner**：负责从“用户意图 + 上下文” -> 输出结构化 `Plan` 的 LLM 层。
- **Plan**：任务级别的、可执行的结构化计划；包含多个 `PlanStep`。
- **Execution Engine (PlanExecutor)**：负责解析 Plan，按步骤调度下游 Agent / Tools 并维护执行状态。
- **Specialist Agent / Tool**：具有明确输入/输出 schema 的下游能力单元（如 `DBAgent`、`RAGAgent`、`PDFAgent` 等）。
- **Task State / Memory**：跨步骤共享的任务级状态（包括 Plan 本身、每个 step 的结果、错误信息等）。

### 1.2 设计 TypeScript 类型（只做接口，不实现逻辑）

- **文件建议**：`src/agent/types.ts` / 新增 `src/agent/core/planTypes.ts`
- 需定义的核心类型：
  - `Plan` / `PlanStep`：
    - `Plan` 字段：
      - `taskId: string`
      - `goal: string`
      - `steps: PlanStep[]`
      - `metadata?: { confidence?: number; estimatedCost?: number; }`
    - `PlanStep` 字段：
      - `id: string`
      - `title: string`
      - `description?: string`
      - `agent: string`（如 "db" | "rag" | "note_edit" | "pdf" 等）
      - `input: unknown`（后续可用泛型或细分联合类型）
      - `dependsOn?: string[]`
      - `retry?: { maxAttempts: number }`
      - `stopOnFailure?: boolean`
  - `StepResult` / `ExecutionStatus`：
    - `status: "pending" | "running" | "success" | "failed"`
    - `output?: unknown`
    - `error?: { message: string; code?: string }`
    - `attempts: number`
    - 时间戳、耗时等（可选）。
  - `TaskExecutionState`：
    - `plan: Plan`
    - `stepResults: Record<string, StepResult>`
    - `overallStatus: "pending" | "running" | "success" | "failed" | "cancelled"`

### 1.3 设计 Planner / Executor 接口

- **Planner 接口**（例如 `src/agent/core/Planner.ts`）：

  ```ts
  export interface Planner {
    createPlan(input: PlannerInput, ctx: PlannerContext): Promise<Plan>;
  }
  ```

  - `PlannerInput`：
    - 用户自然语言请求。
    - 当前会话摘要。
    - 当前模式、选中文本、文档信息等。
  - `PlannerContext`：
    - 支持的 Agent 列表及其能力描述（供 prompt 使用）。

- **PlanExecutor 接口**（例如 `src/agent/core/PlanExecutor.ts`）：

  ```ts
  export interface PlanExecutor {
    execute(plan: Plan, ctx: ExecutionContext): Promise<TaskExecutionState>;
  }
  ```

  - `ExecutionContext`：
    - AgentRegistry 实例。
    - TaskStateManager。
    - 当前会话相关信息。

### 1.4 Specialist Agent 抽象

- 在 `src/agent/tools` 基础上扩展/统一：
  - 定义 `IAgent` / `IAgentTool` 接口：
    ```ts
    export interface AgentTool<I = unknown, O = unknown> {
      name: string; // "db" | "rag" | ...
      run(input: I, ctx: AgentContext): Promise<O>;
    }
    ```
  - 现有 Tool 可以按需适配/包装成 `AgentTool`。

### 1.5 产出物

- 已合并到代码中的类型定义（不包含业务逻辑），可选放在：
  - `src/agent/types.ts`
  - `src/agent/core/planTypes.ts`
- 文档：在本 roadmap 里补充“类型已完成”的链接或代码片段引用。

---

## 阶段 2：Planner LLM 封装（只生成 Plan，不执行）

### 2.1 选择 Planner 使用的模型 & 配置

- 目标：在 `src/services/llm` 中为 Planner 提供一个稳定的 JSON 输出能力。
- 任务：
  - 在 `config.ts` 中定义 Planner 专用的 LLM 配置（如模型名、温度、max_tokens、是否强制 JSON 输出）。
  - 如果底层 provider 支持 `json_mode` / `response_format: { type: "json_object" }`，优先启用。

### 2.2 Prompt 设计

- 在 `src/agent/prompts/` 新增 `PlannerPromptBuilder.ts` 或在现有 `PromptBuilder` 中增加 Planner 模板：
  - **系统提示**：
    - 清晰列出可以使用的 Agent 名称及其职责。
    - 提供 Plan JSON 的 schema 说明与 2~3 个示例。
    - 明确要求：
      - 严格输出 JSON，不能有额外文本。
      - `agent` 字段只能在给定列表中选择。
      - `dependsOn` 只能引用已出现的 step id。
  - **用户提示**：
    - 包含：用户请求摘要 + 当前上下文（会话摘要、模式、选中内容等）。

### 2.3 Planner 调用实现（不挂到 UI，只写服务层）

- 在 `src/agent/core/Planner.ts` 实现：
  - 使用 `services/llm` 的封装调用 LLM，拿到原始字符串响应。
  - 解析 JSON：
    - `try/catch` 解析失败时：
      - 尝试使用简单的正则/截断从文本中提取 JSON 片段。
      - 若仍失败，返回 PlannerError（后续可触发 UI 提示或回退方案）。
  - 调用 Plan 校验逻辑：
    - 字段完整性检查。
    - `agent` 和 `dependsOn` 合法性检查。
    - 对小问题可尝试自动修正（如自动生成缺失的 `id`）。

### 2.4 单元测试 / 离线测试

- 在不接入 UI 的前提下：
  - 写几个 mock prompt -> mock LLM 响应 -> 解析为 `Plan` 的测试用例。
  - 保证 planner 解析/校验逻辑稳健。

### 2.5 产出物

- 完整的 `Planner` 实现（接口 + LLM 调用 + JSON 解析 + 校验）。
- 文档：在本 roadmap 中补充 “Planner 已完成” 部分链接。

---

## 阶段 3：Execution Engine & TaskState 管理

### 3.1 TaskStateManager 设计

- 新建 `src/agent/core/TaskStateManager.ts`（或扩展 `StateManager.ts`）：
  - 提供对任务级 Plan 和 step 状态的读写 API：
    - `initTask(plan: Plan): TaskExecutionState`
    - `updateStepResult(taskId, stepId, result: StepResult): void`
    - `getTaskState(taskId): TaskExecutionState`
- 设计存储位置：
  - 初版可以放在内存（store / 全局对象）。
  - 未来可选：持久化到本地 DB（便于中断恢复和历史回溯）。

### 3.2 PlanExecutor V1（线性执行 + 无并行）

- 在 `src/agent/core/PlanExecutor.ts` 实现：
  - 输入：`plan: Plan`, `ctx: ExecutionContext`。
  - 执行策略：
    - 简化为按 `steps` 数组顺序一个一个执行（忽略 `dependsOn`，只校验其合法性）。
    - 每步流程：
      1. 解析/填充 step 输入（解析 `dependsOn` 引用、注入上游结果等）。
      2. 通过 `AgentRegistry` 找到对应 Agent：`registry.get(step.agent)`。
      3. 调用 `agent.run(input, ctx)`，捕获异常。
      4. 将结果写入 `TaskStateManager`。
      5. 根据 `retry` / `stopOnFailure` 决定是否重试或终止任务。
- 暂不支持：
  - 并行执行。
  - 增量 replanning（Planner 二次介入）。

### 3.3 AgentRegistry & Specialist Agent 接入

- 梳理现有 `src/agent/tools`：
  - 将合适的工具按 `AgentTool` 接口封装：
    - `RAGAgentTool`：检索 + 总结。
    - `NoteEditAgentTool`：对当前 note 做结构化编辑。
    - （后续）`DBAgentTool`、`PDFAgentTool` 等。
- 新建 / 扩展 `ToolRegistry.ts`：
  - 支持按 `name` 获取 AgentTool。
  - 给 Planner 提供一份“Agent 能力清单”（可选，供文档或自动生成系统 prompt）。

### 3.4 Debug & Logging

- 为 Execution Engine 增加详细日志：
  - 每个 step 的输入、输出、耗时、状态。
  - 失败原因、重试次数。
- 可以为 debug 准备一个简单的 “开发者模式 UI”（后续阶段实现）：
  - 显示当前任务的 Plan 树、每个 step 的状态和结果。

### 3.5 产出物

- `TaskStateManager` 初版实现。
- `PlanExecutor` V1 实现（顺序执行版）。
- 若干现有工具适配到 `AgentTool` 接口。

---

## 阶段 4：与现有 AgentLoop/前端集成（最小可用）

### 4.1 集成点选择

- 决定在哪个层面引入 Planner：
  - 方案 A：在现有 `AgentLoop` 中增加一个“planner 模式”：
    - 对于需要多步推理/多工具协作的请求，走 Planner + Executor 流程。
    - 对于简单请求，继续走原来的单步工具调用流程。
  - 方案 B：新建一个 `OrchestratorAgent`：
    - 顶层 UI 始终和 `OrchestratorAgent` 交互。
    - Orchestrator 决定是否使用 Planner。
- 建议：先选方案 A，侵入性更小。

### 4.2 最小可用场景定义

- 选择 1~2 个典型使用场景作为 MVP：
  - 示例 1：
    - 用户：“帮我在当前笔记里整理出一个大纲，并补充缺失的小节。”
    - Planner 计划：
      1. 调用 `rag` 查找相关知识补充上下文（可选）。
      2. 调用 `note_edit` 对当前文档结构化重排。
  - 示例 2：
    - 用户：“阅读这篇 PDF，帮我先生成三条问题，然后在笔记里创建一个问答区。”
    - Planner 计划：
      1. 调用 `pdf` 提取 PDF 中指定页或选区的内容。
      2. 调用 `rag` 或 `llm` 生成问题。
      3. 调用 `note_edit` 在当前笔记插入问答区块。

### 4.3 UI & 状态展示（简版）

- 在 `useAgentStore` 或新增 `useTaskStore`：
  - 存储当前任务 id、Plan 概要、步骤状态。
- 在 `MainAIChatShell` 或相应组件中：
  - 显示一个简单的“执行进度条”：
    - 步骤列表：`Step 1/2/3...` + 状态 icon。
    - 当前正在执行的 step 描述。

### 4.4 整体串联流程

- 用户发出请求 -> AgentLoop：
  1. 判断是否走 Planner 模式（基于简单规则 / LLM 分类 / 用户手动切换）。
  2. 调用 Planner 生成 Plan。
  3. 初始化 TaskState（记录 Plan）。
  4. 调用 PlanExecutor 顺序执行。
  5. 在执行过程中，通过 store 更新 UI。
  6. 执行完毕，反馈任务总结给用户（可以由 LLM 对 step 结果进行汇总）。

### 4.5 产出物

- Planner + Executor 与 `AgentLoop` 的集成代码。
- 简单的 UI 进度展示。
- 至少 1 个 end-to-end demo 场景跑通。

---

## 阶段 5：能力扩展（DBAgent、PDFAgent 等）

### 5.1 DBAgent 设计与接入

- 职责：统一处理所有结构化数据库操作，避免各处直接写 SQL/DB 调用。
- 任务：
  - 抽象 DB 层：对现有 `useDatabaseStore` / 相关服务进行梳理。
  - 定义 `DBAgentInput` / `DBAgentOutput` 类型：
    - 操作类型：`"query" | "insert" | "update" | "delete" | ...`
    - 条件：按业务抽象（如 noteId / tag / folder），不直接暴露 SQL。
  - 编写 `DBAgentTool`：
    - 将结构化输入翻译为实际 DB 操作，并返回结构化结果。
  - 在 Planner 系统 prompt 中加入 `db` 能力说明。

### 5.2 PDFAgent 设计与接入

- 职责：负责 PDF 结构解析、文本/片段抽取，对其他 Agent 屏蔽 PDF 细节。
- 任务：
  - 梳理 `usePDFStore`、`pdfWorker.ts`、`services/pdf` 等现有逻辑。
  - 定义 `PDFAgentInput` / `PDFAgentOutput`：
    - 输入：文档 id、页码范围、区域坐标、是否需要结构化大纲等。
    - 输出：规范化的文本片段、层级结构等。
  - 实现 `PDFAgentTool` 并注册到 `AgentRegistry`。

### 5.3 RAGAgent 与 NoteEditAgent 增强

- 任务：
  - 对现有检索/笔记编辑相关工具进行二次封装，使其：
    - 输入更结构化、与 Planner 描述更贴近。
    - 输出更适合作为下游 step 的输入（例如标准化的“片段数组”、“编辑操作列表”）。

### 5.4 Planner Prompt 升级

- 为新增 Agent 更新 Planner 的系统提示与 JSON 示例。
- 增加更多场景级示例，以指导 Planner 正确拆分任务。

### 5.5 产出物

- `DBAgentTool` / `PDFAgentTool` / 增强版 `RAGAgentTool` / `NoteEditAgentTool`。
- Planner prompt 文档更新。
- 新增若干端到端用例（尤其是跨 DB / PDF / Note 的复杂任务）。

---

## 阶段 6：高级特性（Replanning、并行、回退机制）

### 6.1 增量 Replanning（动态计划调整）

- 场景：执行中发现某些假设不成立，或用户中途修改需求。
- 设计：
  - 当 Execution Engine 遇到：
    - 关键 step 失败（如 DB 无数据 / PDF 页不存在）。
    - Planner 计划明显不合理（可根据 heuristics 判断）。
  - 则：
    1. 汇总当前已执行 step 的结果与错误。
    2. 构造一个“任务中间状态”提示，调用 Planner 生成“补充 Plan”或“修正版 Plan”。
    3. 在 `TaskState` 中合并新 Plan（追加 steps 或替换后续 steps）。

### 6.2 并行执行

- 针对无 `dependsOn` 或仅依赖已完成 steps 的步骤，允许并行执行：
  - PlanExecutor 增加简单的并行调度：
    - 控制最大并发数（防止打爆 LLM/API）。
  - TaskStateManager 支持并发写入（注意状态竞争）。

### 6.3 回退机制 & 单 Agent 兜底

- 为避免 Planner 模式降低可用性：
  - 提供 feature flag：`usePlannerMode: boolean`。
  - 当 Planner 多次失败或 PlanExecutor 遇到严重错误时：
    - 回退到现有“单 Agent + 工具调用”模式（可选仅在开发/调试时启用）。
  - 在 UI 上为开发者提供一个“显示 Plan 细节 / 关闭 Planner 模式”的开关。

### 6.4 观测与评估

- 收集 Planner 模式下的：
  - 成功/失败任务比例。
  - 平均 step 数量、平均耗时。
- 做 A/B 测试（如果合适）：
  - 同一类任务在 planner 模式和旧模式下效果对比。

### 6.5 产出物

- 支持 replanning 的 Planner + Executor。
- 简单的并行执行能力。
- 回退机制 + feature flag。
- 监控与评估指标（至少在日志层面）。

---

## 阶段 7：文档化 & 开发者体验

### 7.1 开发者文档

- 在 `docs` 中补充：
  - `AGENT_PLANNER_ROADMAP.md`（本文件）。
  - `AGENT_PLANNER_DESIGN.md`：
    - 核心类型说明：Plan / PlanStep / TaskState 等。
    - Planner prompt 模板说明与示例。
    - Execution Engine 时序图（文字版或 UML 图）。
  - `AGENT_PLANNER_EXTENDING.md`：
    - 如何新增一个 Specialist Agent。
    - 如何让 Planner 学会使用新 Agent（更新系统 prompt 示例）。

### 7.2 调试工具

- 提供：
  - 控制台/日志里的“Plan 可视化打印”。
  - UI 中的“开发者面板”，展示：
    - 当前 Plan JSON。
    - 每步 step 的状态、输入、输出。

### 7.3 内部 Best Practices

- 约定：
  - 新增能力尽量做成 Specialist Agent，而不是在 Planner 里直接“写死流程”。
  - Planner 只做计划，不做实际资源操作（DB 写入、文件系统操作等）。
  - 下游 Agent 输入输出尽量结构化，避免过度依赖“纯自然语言中间结果”。

---

## 阶段 8：持续迭代 & 场景扩展

### 8.1 扩展到更多场景

- 对每个新的高价值场景（如视频学习、代码阅读、科研笔记等）：
  - 设计专门的 Planner 示例案例（few-shot）。
  - 智能或手动选择场景策略（在 Planner 系统 prompt 中附带“当前场景”）。

### 8.2 性能与成本优化

- 对 Planner 模型与步骤执行：
  - 按任务类型选择不同尺寸的模型（小模型做 Planner，大模型做复杂推理）。
  - 合理控制 Plan 粒度，避免“过细步骤导致大量 LLM 调用”。

### 8.3 用户体验打磨

- 将 Plan 的思考过程以合适形式暴露给用户：
  - 类似“任务执行时间线”：让用户看到 AI 正在做什么。
  - 提供“中断任务”“修改任务目标重新规划”等交互。

---

## 优先级建议

1. **必做（先完成再说）**

   - Plan / PlanStep 类型定义 + Planner/Executor 接口（阶段 1）。
   - Planner LLM 封装 + JSON 解析校验（阶段 2）。
   - PlanExecutor V1（顺序执行） + 简单 TaskState 管理（阶段 3）。
   - 与现有 AgentLoop 的最小集成 + 至少 1 个 MVP 场景（阶段 4）。

2. **增强（提升上限）**

   - DBAgent / PDFAgent / 增强版 RAGAgent/NoteEditAgent（阶段 5）。
   - Replanning / 并行 / 回退机制（阶段 6）。

3. **体验 & 生态（降复杂度、提高可扩展性）**

   - 完整文档与开发者指南（阶段 7）。
   - 多场景扩展 + 性能优化 + 用户体验打磨（阶段 8）。

---

> 后续如果你希望，我可以根据这个 roadmap，先从“阶段 1 + 2 的 TypeScript 接口和 Planner 封装”开始，在 `src/agent/core` 里给出一套具体代码草稿。
