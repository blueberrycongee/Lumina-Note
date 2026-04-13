# Lumina Agent + Memory + Wiki Todo

## 产品方向

不再把 Lumina 只定义为“一个带 AI 的笔记软件”。

新的目标是：

- `Lumina = documented self`
- 用户越使用，系统越能沉淀可复用的 `memory`
- memory 不只是聊天摘要，而是逐渐形成“关于这个人的长期文档系统”
- 这个系统既能服务当前任务，也能反过来塑造 agent 的理解、建议、决策和主动性

可吸收的两条主线：

1. Claude Code 的 memory 维护思路
2. Karpathy 式 `agent wiki` 思路

---

## 核心认知

### Claude Code 值得借鉴的部分

基于本地源码观察，Claude Code 的 memory 不是单一机制，而是多层叠加：

- `Session Memory`
  - 后台周期性维护当前会话摘要
  - 使用 forked subagent 异步提炼，不打断主对话
  - 有阈值控制，不是每轮都更新
- `Auto Memories`
  - 在完整交互回合结束后，从对话中提炼 durable memories
  - 写入专门 memory 目录
  - 工具权限被严格限制在 memory 目录内
- `Agent Memory`
  - 按 `user / project / local` 分层持久化
  - agent 启动时自动加载对应记忆
- `Team Memory`
  - repo 范围同步共享知识

这说明 Claude Code 的记忆设计不是“把历史全塞回 prompt”，而是：

- 先提炼
- 再结构化
- 再分层存储
- 最后按场景注入

### Karpathy 式 agent wiki 值得借鉴的部分

这里更适合 Lumina 的不是“聊天历史越积越长”，而是把系统做成一套持续生长的 wiki：

- 用户的偏好是文档
- 用户的长期项目是文档
- 用户的关系网络是文档
- 用户常见任务模式是文档
- 用户世界模型的演化也是文档

因此 memory 的目标不应该只是“让 agent 记住聊天内容”，而应该是：

- 让 agent 逐步构建“关于这个用户的可维护知识库”
- 从会话流里抽取稳定知识，沉淀成 wiki 页面
- 让 wiki 成为 memory 的长期层

---

## 最终目标

构建三层能力：

1. `流程型 Agent`
   - 参考 Claude Code 的 `Coordinator + Explore + Plan + Execute + Verify`
2. `分层 Memory`
   - 会话记忆、长期记忆、项目记忆、身份记忆
3. `Agent Wiki`
   - 把用户逐渐“文档化”，形成可浏览、可编辑、可追踪演化的知识体系

---

## 总体路线

- 第一阶段：先完成 Claude Code 风格多 agent 流程
- 第二阶段：接入 session memory 和 durable memory
- 第三阶段：把 memory 升级成 wiki，不再只是 hidden prompt context
- 第四阶段：让 wiki 反向驱动 agent 的理解、规划、建议和主动服务

### 当前进度（2026-04-12）

- `Phase 1` 已完成第一版骨架
  - 已新增 `orchestrator.rs`
  - 已将 Agent 执行改成“先编排，再进入 Forge loop”
  - 已引入 `explore -> plan -> execute -> verify -> report` 阶段枚举和分阶段状态
  - 已保留 `legacy_single_agent` fallback
  - 已增加 Claude Code 风格的分层 prompt 组装，以及 `role prompt` 调试面板
- `Phase 2` 仅完成基础设施，尚未拆出真正独立的 `Explore / Plan / Verify` agent
- 旧 `Deep Research` 模式已移除，不再作为当前主线；若未来恢复研究工作流，将基于新的编排框架重建，而不是恢复旧实现

---

## Phase 1: 建立多角色流程骨架

- [x] 在 `src-tauri/src/agent/` 下新增统一编排入口，例如 `orchestrator.rs`
- [x] 将当前 `execute_task_inner` 从“直接进入主循环”改成“先编排，再执行”
- [x] 明确新的阶段枚举：`explore -> plan -> execute -> verify -> report`
- [x] 为每个阶段定义独立的数据结构，而不是把所有状态都堆进 `GraphState`
- [x] 保留当前单 Agent 模式作为 fallback，避免一次性替换全部流程

当前实现说明：

- 复杂任务已能切到编排路径，但 `Phase 1` 仍会在执行层安全收束到现有 Forge loop
- 提示词已改成 Claude Code 风格的分层结构，但目前只有通用执行角色 prompt，尚未拆成独立子 agent prompt

建议涉及文件：

- `src-tauri/src/agent/commands.rs`
- `src-tauri/src/agent/types.rs`
- `src-tauri/src/agent/forge_loop.rs`
- `src-tauri/src/agent/mod.rs`

---

## Phase 2: 引入 Explore / Plan / Verify 三类角色

当前状态：

- [ ] 尚未拆出 `explore.rs / plan.rs / verify.rs`（计划中新文件）
- [ ] 当前只有阶段状态、复杂任务模型路由、以及面向编排执行的 `role prompt`
- [ ] 也就是说“编排骨架已落地”，但“真正多角色 agent”仍未开始

### Explore Agent

- [ ] 新增 `ExploreAgent` 的只读角色定义
- [ ] 限制 Explore 只能调用只读工具：文件读取、检索、RAG、WikiLink 解析、目录浏览
- [ ] 让 Explore 输出结构化结果，例如：
  - 相关文件列表
  - 关键实现位置
  - 相似模式
  - 潜在风险点
  - 推荐后续切入文件
- [ ] 优先并发执行多个只读探索任务
- [ ] 把当前 `rag_results`、`resolved_links` 的预处理逻辑合并进 Explore 输出

### Plan Agent

- [ ] 新增 `PlanAgent`，只读，不允许编辑
- [ ] 输入为：用户任务 + `ExploreReport`
- [ ] 输出为结构化 `Plan`
- [ ] 将现有 `current_plan` 从“UI 展示结构”升级为“真实执行前计划”
- [ ] 给计划增加 `step id / role / status / expected artifacts`
- [ ] 为复杂任务启用“先计划再执行”，简单任务允许跳过计划阶段

### Verification Agent

- [ ] 新增 `VerificationAgent`
- [ ] 默认只读，不允许修改项目文件
- [ ] 输入为：
  - 原始用户目标
  - 实际修改文件列表
  - 执行阶段产物
  - 计划目标
- [ ] 输出明确 verdict：`pass / fail / partial`
- [ ] 根据任务类型决定验证策略
- [ ] 允许在必要时运行项目测试命令

建议涉及文件：

- `src-tauri/src/agent/orchestrator.rs`
- `src-tauri/src/agent/commands.rs`
- `src-tauri/src/agent/explore.rs`（待新增）
- `src-tauri/src/agent/plan.rs`（待新增）
- `src-tauri/src/agent/verify.rs`（待新增）
- `src-tauri/src/agent/types.rs`
- `src/stores/useRustAgentStore.ts`
- `src/components/chat/PlanCard.tsx`

---

## Phase 3: Session Memory

目标：
让系统像 Claude Code 一样，在后台维护当前会话的重要上下文，但不污染主对话体验。

参考点：

- Claude Code 的 `SessionMemory` 会周期性更新 markdown memory 文件
- 通过后台 subagent 提炼
- 受 token / tool-call 阈值控制
- 在需要 compact 或恢复上下文时再注入

在 Lumina 中建议做法：

- [ ] 新增 `Session Memory` 子系统
- [ ] 为每个会话维护一份 `session-memory.md`
- [ ] 更新策略不要按“每轮必写”，而采用阈值触发：
  - token 增量
  - 工具调用次数
  - 任务阶段结束
  - 用户离开 / 会话切换
- [ ] 使用后台只读/受限写入 subagent 提炼 session memory
- [ ] session memory 不直接替代消息历史，而是作为 compact 时的高质量摘要层
- [ ] 对 session memory 增加初始化模板，而不是从空文件裸写
- [ ] 增加“本轮是否已写入 memory”的互斥逻辑，避免重复提炼

建议新增文件：

- `src/services/memory/sessionMemory.ts`（待新增）
- `src/services/memory/sessionMemory.test.ts`（待新增）
- `src-tauri/src/agent/memory_extract.rs`（待新增）

建议数据结构：

- [ ] `SessionMemory`
- [ ] `SessionMemoryConfig`
- [ ] `SessionMemoryUpdateReason`
- [ ] `SessionMemorySnapshot`

---

## Phase 4: Durable Memory

目标：
从会话中抽取长期稳定知识，而不是只保留短期摘要。

参考 Claude Code：

- `extractMemories` 会在完整 query loop 后抽取 durable memories
- 写入专门 memory 目录
- 对工具权限做严格限制，只允许 memory 范围内的读写

在 Lumina 中建议做法：

- [ ] 新增 `durable memory extraction` 机制
- [ ] 在完整任务闭环后提炼长期价值内容
- [ ] durable memory 只写入 memory 空间，不直接修改普通笔记
- [ ] 区分“临时上下文”与“长期可信知识”
- [ ] 对 durable memory 的写入提供 dedupe / merge / versioning
- [ ] 增加 memory manifest，先让 agent 知道已有记忆全貌，再决定写哪里
- [ ] 对提炼结果做置信度标注，低置信信息不直接升级为长期事实

建议新增目录：

- `memory/session/`（待新增）
- `memory/durable/`（待新增）
- `memory/identity/`（待新增）
- `memory/projects/`（待新增）
- `memory/relationships/`（待新增）
- `memory/patterns/`（待新增）

建议数据结构：

- [ ] `MemoryEntry`
- [ ] `MemoryScope`
- [ ] `MemoryConfidence`
- [ ] `MemorySourceRef`
- [ ] `MemoryMergeResult`

---

## Phase 5: 分层 Memory 模型

目标：
借鉴 Claude Code 的 `user / project / local / team` 设计，把 Lumina 的 memory 做成真正分层体系。

建议分层：

- [ ] `Session`
  - 当前会话临时摘要
- [ ] `User Identity`
  - 用户身份、背景、长期偏好、价值观、沟通风格
- [ ] `Project`
  - 当前项目、长期目标、进行中的工作流
- [ ] `Local Context`
  - 设备、本地习惯、环境约束
- [ ] `Relationship`
  - 用户提及的重要人物、团队关系、协作上下文
- [ ] `Pattern`
  - 用户高频动作、常见决策模式、固定模板
- [ ] `Team / Shared`
  - 可共享的项目知识

设计任务：

- [ ] 定义 `MemoryScope` 枚举
- [ ] 定义每一层的写入规则和读取规则
- [ ] agent 启动时按任务类型选择性加载 memory，而不是全量注入
- [ ] 支持 scope 级别的隐私控制
- [ ] 支持用户查看、编辑、删除每层 memory

---

## Phase 6: 从 Memory 升级为 Agent Wiki

目标：
让记忆不只是隐藏在系统里的 prompt 附件，而是成长为一套可见、可导航、可编辑的 wiki。

核心原则：

- memory 是原子知识
- wiki 是组织过的知识空间
- memory 可以生成 wiki
- wiki 也可以反向修正 memory

建议 wiki 形态：

- [ ] `Me`
  - 用户自我画像
- [ ] `Timeline`
  - 最近阶段、重要演化
- [ ] `Projects`
  - 每个项目一组页面
- [ ] `People`
  - 人物与关系
- [ ] `Preferences`
  - 写作风格、工具偏好、习惯
- [ ] `Routines`
  - 重复流程与模板
- [ ] `Beliefs / Open Questions`
  - 仍不确定的事情、待验证认知

产品动作：

- [ ] 将 durable memory 自动映射到 wiki 页面
- [ ] 支持 wiki 页面之间的双链和引用
- [ ] 支持“该结论来自哪些对话/文档”
- [ ] 支持“这条记忆最近一次被验证是什么时候”
- [ ] 支持 stale memory 检测与重验证

建议新增目录或数据库：

- `Wiki/Me/`（待新增）
- `Wiki/Projects/`（待新增）
- `Wiki/People/`（待新增）
- `Wiki/Preferences/`（待新增）
- `Wiki/Patterns/`（待新增）

---

## Phase 7: 用户模型与“文档化的我”

目标：
让系统最终形成一个关于用户的动态模型，而不是单纯的资料仓库。

应沉淀的内容：

- [ ] 用户是谁
- [ ] 用户正在成为什么样的人
- [ ] 用户长期在做什么
- [ ] 用户如何做决定
- [ ] 用户如何表达
- [ ] 用户喜欢什么样的产出
- [ ] 用户不喜欢什么
- [ ] 用户目前有哪些 unresolved tensions

需要避免的误区：

- [ ] 不把所有聊天都当成事实
- [ ] 不把短期情绪误记为长期偏好
- [ ] 不把 agent 的推断直接当作已验证身份知识
- [ ] 不把“帮助记忆”做成“监控式记录”

需要增加：

- [ ] 用户可见的 memory 审核机制
- [ ] memory 的“确认 / 拒绝 / 修正”反馈回路
- [ ] 对身份类记忆增加更高写入门槛

---

## Phase 8: 前端可视化与操作面板

- [ ] 在 Agent UI 中显示当前阶段，而不只是消息流
- [ ] 在 `PlanCard` 中显示阶段来源：`Explore / Plan / Execute / Verify`
- [ ] 增加 memory 面板：
  - 最近提炼的 session memory
  - 新增 durable memory
  - 待确认记忆
  - 冲突记忆
- [ ] 增加 wiki 面板：
  - 我是谁
  - 我的项目
  - 我的人物关系
  - 我的工作模式
- [ ] 在消息流中区分：
  - 编排器消息
  - 探索摘要
  - 计划更新
  - 执行日志
  - 验证报告
  - memory 提炼报告
- [ ] 为失败阶段和错误记忆提供重试入口

建议涉及文件：

- `src/stores/useRustAgentStore.ts`
- `src/components/chat/PlanCard.tsx`
- `src/components/chat/AgentPanel.tsx`
- `src/components/layout/MainAIChatShell.tsx`
- `src/stores/useMemoryStore.ts`（待新增）
- `src/components/memory/*`（待新增）

---

## Phase 9: 与 Deep Research 融合

状态更新：

- [ ] 本阶段暂时冻结
- [ ] 旧 `Deep Research` 前后端实现已删除
- [ ] 如果未来需要研究工作流，应在新的 orchestrator 下作为“专用 workflow”重建
- [ ] 不再计划复用旧的 `deep_research/*` 模块和旧前端 store

重建时再考虑：

- [ ] 将 Research 视为同一多 Agent 框架下的特殊工作流
- [ ] 让研究流程复用统一的 `Explore / Plan / Execute / Verify`
- [ ] 让 Research 输出也能沉淀成 durable memory 和 wiki 页面
- [ ] 对研究结论增加“是否进入长期记忆”的判定逻辑

---

## Phase 10: 记忆写入守则

- [ ] 所有 memory 写入都要带 `source refs`
- [ ] 长期 memory 写入需要经过结构化提炼，而不是原文粘贴
- [ ] 高敏感记忆默认不自动写入
- [ ] 身份类记忆优先进入“待确认”区
- [ ] 提供 stale / contradiction / duplicate 检测
- [ ] 提供 memory GC，而不是无限增长
- [ ] 所有自动生成的 wiki 页面都允许用户编辑覆盖
- [ ] 用户修改后的内容优先级高于 agent 推断

---

## 建议新增类型

- [ ] `SubagentRole`
- [ ] `AgentPhase`
- [ ] `ExploreReport`
- [ ] `PlanArtifact`
- [ ] `ExecutionArtifact`
- [ ] `VerificationVerdict`
- [ ] `VerificationReport`
- [ ] `SessionMemory`
- [ ] `DurableMemory`
- [ ] `MemoryEntry`
- [ ] `MemoryScope`
- [ ] `MemoryEvidence`
- [ ] `MemoryConfidence`
- [ ] `MemoryConflict`
- [ ] `WikiNode`
- [ ] `WikiEdge`
- [ ] `UserModelSnapshot`

---

## MVP

先做下面这些，就能得到第一版“文档化的我”：

- [ ] `Coordinator -> Explore -> Plan -> Execute -> Verify` 的顺序编排
- [ ] Session memory 后台提炼
- [ ] Durable memory 的基本抽取
- [ ] `user / project / session` 三层 memory
- [ ] 最基础的 wiki 页面：
  - `Me`
  - `Projects`
  - `Preferences`
- [ ] UI 能看到最近新增的 memory
- [ ] 用户能手动确认或删除 memory

---

## 暂不处理

- [ ] 真实 tmux / remote agent / worktree 隔离
- [ ] 完整照搬 Claude Code 的 AgentTool / SendMessage 生态
- [ ] 一开始就做高度复杂的社交图谱
- [ ] 无边界的自动记忆采集
- [ ] 在没有审核机制前自动写入高敏感 identity memory

---

## 关键原则

- `不要把历史当记忆`
- `不要把摘要当知识`
- `不要把推断当事实`
- `不要把 memory 藏成黑盒`
- `不要把用户变成“笔记的作者”`
- `而要让系统成为“文档化的我”的共同维护者`

---

## 备注

当前 Lumina 已经具备不错的基础：

- `Plan` 结构已经存在
- `PlanCard` 已经存在
- 新的 `orchestrator` 与分阶段状态已经存在
- `Rust Agent` 已有统一事件流和工具执行循环
- `RAG` 已经能提供候选上下文

因此最优路线不是推翻重来，而是：

1. 先把 Agent 升级成编排器驱动的多角色流程
2. 再把 Claude Code 式 memory 分层接进来
3. 最后把 memory 升级成面向“文档化的我”的 wiki 系统
