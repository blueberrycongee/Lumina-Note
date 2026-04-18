# Lumina Note v2：完全迁移到 Electron + TS Agent + LLM Wiki

**日期**：2026-04-17
**状态**：已对齐，待执行（替代 `2026-04-11-lumina-v2-electron-llm-wiki-plan.md`）

本文档是后续所有迁移工作的**唯一真源**。每一条 item 对应一个原子 commit / PR，执行时严格按依赖顺序推进，main 在每条之间都保持可发布。本期不排期，持续推进至全部完成。

---

## 1. 产品定位

Lumina Note 收敛为 **「LLM Agent + 文本笔记」** 场景的桌面应用：用户用它沉淀知识（丢文档、记录想法、提取想法），所有知识加工都交给 agent 完成。

- **不做 RAG / 向量检索**：agent 自己用 filesystem 工具浏览 vault 获取上下文
- **BYOK 模式**：用户自带 API key，软件只是壳
- **完全跑在 Electron 上**：Tauri 彻底退场，`src-tauri/` 删除

## 2. 产品边界

### 保留（核心）
- 文本编辑器、文件树、工作区管理
- Agent runtime + 工具 + 工具审批
- Skills（agent 能力扩展，读 `vault/.skills/*.md`）
- MCP（agent 工具源，走官方 TS SDK）
- LLM Wiki（agent 触发式合成，可禁用）
- WebDAV 云同步（承载"丢文档"入口）
- 设置 / i18n / 主题

### 删除
- Typesetting / PDF 导出（整个 `src-tauri/src/typesetting/` + 前端）
- 视频笔记 / Bilibili / danmaku / 嵌入浏览器 Tab（`commands/*webview*`、`*bilibili*`、相关前端）
- RAG / 向量库 / embedding（`useRAGStore` 残留、Rust 里的 `rusqlite` 向量存储、embedding 调用）
- Forge 及 `forge_runtime/`（Rust 自写 langgraph 依赖）
- 残留死代码：database / flashcard / task / team / codex / video-note 等已删模块的散落引用

### 插件化（**本期不实现插件架构，仅从 core 移除代码**）
- 视频笔记：本期彻底删除，未来有插件架构后再以插件形式回归

## 3. 技术架构

### 3.1 进程布局

```
Electron main (Node)
 └── AgentRuntime
      ├─ Provider 层 (Vercel AI SDK)
      ├─ ToolRegistry ── FS / Shell / MCP tools
      ├─ MCPClient (@modelcontextprotocol/sdk) → stdio subprocess
      ├─ SkillLoader (vault/.skills/*.md)
      ├─ MemoryStore (JSONL turn log + summary markdown)
      ├─ ApprovalGate (通过 IPC 问用户决定高危 tool call)
      └─ DebugLog (NDJSON 落盘)

Streaming: webContents.send('agent:event', ...) → Renderer

Renderer (React)
 └─ 现有前端 99% 保留，useRustAgentStore 接到新 IPC channel
```

### 3.2 Provider 层：基于 Vercel AI SDK

**决策**：舍弃现有 10 个手写 HTTP provider，切到 Vercel AI SDK (`ai` + `@ai-sdk/*`)。

**理由**：
1. 当前手写 provider 的 tool use 只有类型占位，实际没实现——agent 架构的核心能力缺失
2. Reasoning stream / multimodal / structured output / usage 归一化，AI SDK 全部原生提供
3. 各家 API 变迁（Anthropic messages API 更新、OpenAI Responses API、Gemini 3 tool 改版）由 SDK 跟进，升级 npm 包即可
4. 对比 Cherry Studio（业界参考）也是 AI SDK 路线，14+ `@ai-sdk/*` 包覆盖全部主流 provider

**不做**：不照搬 Cherry 那套 `ProviderExtension` / `PluginEngine` / `middleware chain`——过度设计，我们只需要简单的 `Map<providerId, (settings) => LanguageModel>`。

**首批依赖**：
```
ai
@ai-sdk/anthropic
@ai-sdk/openai
@ai-sdk/openai-compatible    // Moonshot / Zhipu / Qwen / DeepSeek-OpenAI兼容 / 自建 vLLM / ollama 走这条
@ai-sdk/google
@ai-sdk/deepseek             // DeepSeek 原生（reasoning 更好）
@ai-sdk/groq
@openrouter/ai-sdk-provider
ollama-ai-provider-v2
```

**保留**：现有 `PROVIDER_REGISTRY` 里的**模型元数据表**（model id / context window / vision / thinking 标签）作为纯数据，不再绑实现。

**兜底通道**：一条 "OpenAI Compatible" 通配 provider，让用户填 `baseUrl + apiKey + model`，覆盖任何未内建的小厂。

### 3.3 Agent Loop

**自研**，不用 LangGraph JS / LangChain JS。

核心是一个 while 循环：
```
while (not done && turns < max) {
  stream = streamText({ model, messages, tools })
  for chunk in stream:
    emit('agent:event', chunk)  // token 流到 renderer
  if stream.toolCalls:
    for each toolCall:
      await approvalGate(toolCall)  // 可能弹 UI
      result = await toolRegistry.execute(toolCall)
      messages.push(toolResultMessage)
  else:
    done = true
}
```

**Agent 跑在 Electron main 进程**，不用 utility process。工具执行需要 FS 和 `child_process` 权限，main 最自然。等 agent 变复杂再拆。

### 3.4 MCP

- 用 `@modelcontextprotocol/sdk`（Anthropic 官方 TS SDK）
- Main process 里做 MCP client manager：spawn stdio subprocess、健康检查、stderr 收集、自动重启
- MCP tool 带 server 前缀注入 agent runtime（避免与内建工具冲突）

### 3.5 Memory

**极简版**：
- 每会话一份 `JSONL turn log`（所有 message + tool call + tool result）
- 每会话结束后，agent 自己写一份 `summary markdown`
- 不分层、不做 vector、不做 reranker

前一轮代码里 phase 2/3/4/6 的 "layered durable memory" 一并简化掉。

### 3.6 Skills

零改动。Rust 端 `agent_list_skills` / `agent_read_skill` 搬到 Node：
```ts
const skills = await fs.readdir(`${vault}/.skills`)
const content = await fs.readFile(`${vault}/.skills/${name}.md`)
```

### 3.7 LLM Wiki

**触发策略**（用户定的规则）：

每份笔记维护三个状态：
- `lastModifiedAt`（chokidar 文件变更时更新）
- `lastSyncedAt`（wiki agent 完成后更新）
- `lastSyncedHash`（内容 hash，判断"真的改过"）

进入"需同步"状态 ⇔
```
contentHash !== lastSyncedHash        (有内容变更)
AND now - lastModifiedAt >= 静默期   (确实停止修改了)
AND now - lastSyncedAt >= 冷却期    (离上次合成足够久)
AND wikiAgent.enabled === true       (用户没关掉)
```

**用户配置**（Settings → Wiki）：
- `wikiAgent.enabled`（**默认 false**，BYOK 下不替用户烧 token，首次打开时引导解释）
- `wikiAgent.quietPeriodMinutes`（静默期）
- `wikiAgent.cooldownMinutes`（冷却期）
- `wikiAgent.excludeGlobs`

**手动触发**：
- 命令 palette：`Rebuild wiki`
- 单文件右键：`Synthesize to wiki`
- 运行中可停止

**实现**：触发后让 agent 用 FS tool **自己**浏览 `vault/wiki/` 做整合；不做向量检索、不做相关性 rerank，全部靠 context window 本身。

### 3.8 BYOK 与零 key 体验

- API key 走已有的 `secure_store_*`，永不落到 localStorage / settings.json 明文
- 前端 AI Settings 按 provider 分块，每块有"测试连接"按钮
- **用户没配 key 时**：agent 面板显示引导卡片"去 Settings 配置 AI provider"，只保留纯笔记编辑功能（不内置演示 key）

## 4. 执行清单

按依赖关系排序。每条 = 一个原子 commit / PR。main 在每条之间均可发布。

### Phase 0 — Scope 收敛（纯删代码）

- **0.1** 删除 `src-tauri/src/typesetting/` + 5 个 `typesetting_*` 命令 + 前端 `TypesettingDocumentPane` 及相关测试、字体 fixture、docs
- **0.2** 删除 `src-tauri/src/commands/` 中所有 `browser_webview_*` / `create_*_webview` / `close_*_webview` / `*_video_*` 命令 + 前端 TabBar / Ribbon / useFileStore 中视频和嵌入浏览器的分支
- **0.3** 删除 Bilibili & danmaku：`get_bilibili_cid` / `get_bilibili_danmaku` / `setup_danmaku_autofill` / `fill_danmaku_prefix` + 前端
- **0.4** 删除 `src-tauri/src/forge_runtime/` + `Cargo.toml` 里 `forge` git 依赖 + 前端 forge 相关 store、`verify:forge-runtime` 脚本
- **0.5** 删除 RAG：`useRAGStore` 残留、Rust 里 `rusqlite` 向量部分（保留 `rusqlite` 如果 WebDAV sync 还用，否则一并删）、embedding 调用点、相关前端 UI
- **0.6** 清理 TypeScript 死代码：`Ribbon` / `TabBar` / `useFileStore` / `AnnotationPopover` / `WelcomeSection` / `TypesettingDocumentPane.test` / `CitationCard` / `LintDashboard` / `plugins/runtime` 等上次 `tsc --noEmit` 报的 20 条错误全部消除

### Phase 1 — TS Agent 骨架（Electron main）

- **1.1** 新建 `electron/main/agent/` 目录结构：`runtime.ts` / `session.ts` / `event-bus.ts` / `types.ts`
- **1.2** 定义 agent 事件协议（renderer ↔ main），保留现有 `useRustAgentStore` 前端 API 不变（preload 做字符串路由）
- **1.3** `AgentRuntime` 核心 loop：消息栈、turn 状态机、中止信号、turn 上限、错误恢复
- **1.4** `ApprovalGate`：把需审批的 tool call 通过 IPC 送到 renderer 等用户决策
- **1.5** `DebugLog`：NDJSON 落盘 + `agent_get_debug_log_path` 等价 IPC
- **1.6** `MemoryStore` 最小实现：每会话一个 JSONL turn log + 一份 agent 写的 summary markdown

### Phase 2 — Provider 层（Vercel AI SDK）

- **2.1** 加依赖：`ai` + `@ai-sdk/anthropic` + `@ai-sdk/openai` + `@ai-sdk/openai-compatible` + `@ai-sdk/google` + `@ai-sdk/deepseek` + `@ai-sdk/groq` + `@openrouter/ai-sdk-provider` + `ollama-ai-provider-v2`
- **2.2** 新建 `electron/main/agent/providers/registry.ts`：简单 `Map<ProviderId, (settings) => LanguageModel>`，静态注册，不做动态加载
- **2.3** 迁移模型元数据：现有 `src/services/llm/providers/index.ts` 里的 `PROVIDER_REGISTRY` 保留为纯数据（模型列表 / contextWindow / vision / thinking），不绑实现
- **2.4** Agent runtime 对外唯一入口：`streamText({ model, messages, tools, ... })`，直接使用 AI SDK
- **2.5** 删除 `src/services/llm/providers/*.ts` 所有手写 HTTP 实现、`llmFetchJson`、`invoke('llm_fetch'/'llm_fetch_stream')`、`src-tauri/src/llm.rs`
- **2.6** 自定义通配通道："OpenAI Compatible" provider，用户填 `baseUrl + apiKey + model`
- **2.7** API key 存储走 `secure_store_*`（沿用）；前端 `src/components/settings/ai/` 结构保留，底层换成 AI SDK
- **2.8** 每 provider 的"测试连接"按钮：发 1-token 请求验证

### Phase 3 — Tools

- **3.1** FS tools：`read` / `write` / `list` / `grep` / `stat`，用 Zod schema 声明参数
- **3.2** Shell tool：`exec`，**默认需要审批**，提供用户可配 allowlist
- **3.3** Tool 审批 UI 改造：沿用现有前端 `agent_approve_tool` 入口，改接 Electron IPC channel
- **3.4** Skills loader：扫 `vault/.skills/*.md`，解析 frontmatter 声明的触发词 / 允许工具，按需注入 runtime

### Phase 4 — MCP

- **4.1** 集成 `@modelcontextprotocol/sdk`
- **4.2** MCP client manager：spawn stdio subprocess、健康检查、stderr 收集、自动重启
- **4.3** MCP tool 注入 agent runtime（带 server 前缀，避免与内建工具碰撞）
- **4.4** MCP settings UI：服务列表 / 启停 / 查看 tools / 测试 tool / 查看日志
- **4.5** 删除 `src-tauri/src/mcp/` 及 8 个 `mcp_*` 命令

### Phase 5 — 前端切换到 Electron runtime

- **5.1** `useRustAgentStore` 的 invoke 调用走新的 IPC channel（preload 层把 `agent_*` / `vault_*` / `mcp_*` 等字符串路由到新 runtime）
- **5.2** 移除 `src/electron-shims/tauri/` 里不再需要的桥接
- **5.3** Agent eval 套件:CLI runner (`tests/agent-eval/runner.ts`) 从未存在,三个 npm script 是死配置;直接删除 script。`src/tests/agent-eval/AgentEvalPanel.tsx` 是应用内 dev 面板,不属于 CI,Phase 5 UI 改造时再决定保留/重写
- **5.4** 所有 agent 相关单元测试改成 mock Provider（fake `streamText` 返回预设事件流）

### Phase 6 — LLM Wiki 合成器

- **6.1** WikiState 持久化：每份笔记记录 `lastModifiedAt` / `lastSyncedAt` / `lastSyncedHash`，落 `vault/.lumina/wiki-state.json`
- **6.2** 触发器：chokidar + 定时扫描，按 §3.7 状态机判定"需同步"集合
- **6.3** WikiSynthesizer：特殊 system prompt 的 agent，允许 FS 工具自主浏览 `vault/wiki/`，产出 `vault/wiki/*.md` 修改
- **6.4** Settings → Wiki 面板：启用开关 / 静默期 / 冷却期 / 排除 glob
- **6.5** 命令：`Rebuild wiki` / 单文件 `Synthesize to wiki` / 停止合成
- **6.6** 前端 viewer：沿用现有 Wiki 入口,展示产物 + 跳转源文档。Wiki 产物落 `vault/wiki/*.md`,frontmatter 有 `title` / `page_type` / `summary` / `source_paths`(每个 source_path 是源 note 相对路径,viewer 可以 click-through)。`vault_load_index` IPC 扫这些文件返回 `WikiIndex`(useVaultStore 期待的 shape);`vault_run_lint` 当前返回零 issue 占位,真正 lint 留后续

### Phase 7 — 搬剩下的 Tauri 命令到 Node

- **7.1** WebDAV：用 `webdav` npm 包重写 14 个 `webdav_*` 命令
- **7.2** Proxy：`set_proxy_config` / `get_proxy_config` / `test_proxy_connection` → `session.setProxy`
- **7.3** Updater：4 个 `update_*` 命令 → `electron-updater`
- **7.4** Diagnostics：`export_diagnostics` → Node fs 打包系统信息 + 日志
- **7.5** Plugins 读取：`plugin_list` / `plugin_read_entry` / `plugin_get_workspace_dir` / `plugin_scaffold_*` → 纯 Node 实现
- **7.6** Cloud Relay（如果保留）：`cloud_relay_*` 5 个命令走 Node HTTP / WebSocket；否则删除
- **7.7** DocTools：`doc_tools_get_status` / `doc_tools_install_latest` 如仍需保留则用 Node 重写；否则一并删

### Phase 8 — 发版链路切换 & 拆除 Tauri

- **8.1** `electron-builder.yml` 配置：mac (universal) / win (x64) / linux (AppImage)
- **8.2** 代码签名 & 自动更新 feed：迁移到 `electron-updater` 的 GitHub Releases provider
- **8.3** `.github/workflows/release.yml` 重写：去掉 `tauri-action`，改用 electron-builder；`check-changelog` 保留
- **8.4** 移除 `package.json` 里所有 `@tauri-apps/*` 依赖、`tauri` / `pretauri` 脚本、`@tauri-apps/cli`
- **8.5** 删除 `src/electron-shims/tauri/`；`src/lib/tauri.ts` 改名 `src/lib/host.ts`
- **8.6** 删除 `src-tauri/` 整个目录、`tauri.conf.json`、`tauri.macos.conf.json`、`scripts/sync_version.mjs` 中 Tauri 同步部分
- **8.7** README / docs 全量改写：引用 Tauri 的地方换成 Electron，架构图更新，徽章换 Electron
- **8.8** 启动性能 / 包体对照验证（before/after），报告提交到 `docs/`

### Phase 9 — 发版 2.0.0

- **9.1** `chore(release): bump version to 2.0.0` + CHANGELOG 明确 breaking
- **9.2** Tag 推送，跑新 release workflow 出产物
- **9.3** 数据迁移说明：v1 → v2 用户的 vault 结构兼容性声明（理论上 vault 本身是纯文件，零迁移成本，写清楚让用户放心即可）

---

## 5. 决策备忘

| 问题 | 决策 |
|---|---|
| Wiki Agent 默认开关 | **关闭**，BYOK 下不替用户烧 token，首次打开时引导解释 |
| 无 key 时的 Agent 面板 | 引导卡片指 Settings，不内置演示 key，纯笔记功能仍可用 |
| Provider 首批范围 | Anthropic / OpenAI / Google / DeepSeek / Groq / OpenRouter / Ollama + OpenAI-Compatible 通配 |
| Agent 进程位置 | Electron main，不拆 utility process |
| Agent loop 框架 | 自研 300 行，不用 LangGraph JS |
| Memory 形态 | 每会话 JSONL + markdown summary，不分层 |
| Wiki 上下文策略 | agent 自己用 FS 工具浏览 vault，**不做 RAG** |
| Forge 依赖 | 删除 |
| Typesetting | 删除（用户决策：不属于核心场景） |
| 视频笔记 | 删除（未来插件化，本期不实现插件架构） |
| 是否用 `@anthropic-ai/claude-agent-sdk` | 待评估，本期不强依赖 |
| 是否套 `@cherrystudio/*` 或 langchain-js | **不用**，过度设计 |

## 6. 开放项

- **DocTools 去留**：`doc_tools_get_status` / `doc_tools_install_latest` 之前是为 typesetting 服务的，typesetting 删了后大概率不需要，Phase 7.7 决定
- **Cloud Relay 去留**：同上，`cloud_relay_*` 如果只服务于已删功能，一并删
- **macOS traffic lights 原生效果**：现在用 `objc2` 做了窗口控件居中 / 缩放同步，切到 Electron 后退化为 Electron 自带能力，有视觉差异但不是阻塞项，在 Phase 8.8 记录
- **Mobile 端**：`mobile/` 目录和 `mobile_*` 命令如不再维护，建议在 Phase 0 一并删除（等和用户确认再定）

## 7. 参考

- Cherry Studio：`thirdparty/cherry-studio`（本仓库 gitignore），provider 架构参考
- 废弃旧计划：`docs/plans/2026-04-11-lumina-v2-electron-llm-wiki-plan.md`（wuu sidecar / typesetting sidecar / RAG 合成方案，已作废）

## 8. 执行约定

- 每条 item 独立 commit，提交信息前缀遵循 `feat / fix / refactor / chore / test / docs / style / build / ci`
- 每条 item 完成后本地 `npm run test:run` 必须绿，`npm run build` 必须过
- 每条 item push 到 main 前 `check-changelog` 不涉及（只在版本 tag 时才跑）
- 禁止跳过 hooks，禁止 `--no-verify`
- Push 到 main 无需逐条询问（已授权），但**发 2.0.0 tag 前必须确认**
