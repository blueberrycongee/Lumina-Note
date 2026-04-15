# Lumina-Note → LLM Wiki 改造计划

## Context

将 Lumina-Note（本地优先 AI 笔记应用）改造为受 Karpathy "LLM Wiki" 理念启发的个人知识库系统。

**核心哲学**：Wiki 是一种**指导性理念**，不是产品形态的硬性约束。Vault 本身就是 wiki —— 整个工作空间就是一个由 LLM 协助维护的知识网络。Agent 保持通用灵活性，但天然具备 wiki 意识：理解知识结构、维护交叉引用、编译知识是 agent 的内在行为，不是被限死的操作模式。

**与原版 Karpathy 方案的区别**：
- 不把 agent 限定为 Ingest/Query/Lint 三种模式 —— 这些是**快捷路径**，不是唯一入口
- Agent 在任何交互中都可以自然地读取/更新 wiki、维护引用、标记矛盾
- 用户可以自由对话、自由操作，wiki 意识作为背景行为融入所有交互

Lumina-Note 70-80% 的基础设施可复用（Markdown 编辑器、WikiLinks、Agent 编排系统、Durable Memory、多 LLM 提供商、知识图谱），但需要重新组织数据模型并增强 agent 的知识意识。

---

## Phase 0: 清理瘦身（降低复杂度）

**目标**：删除与 LLM Wiki 无关的功能模块，减少维护面积。清理后应用仍可编译运行。

### 前端删除

| 删除目标 | 路径 |
|---------|------|
| 闪卡系统 | `src/components/flashcard/`, `src/services/flashcard/`, `src/stores/useFlashcardStore.ts` |
| 数据库/看板 | `src/components/database/`, `src/stores/useDatabaseStore.ts` 及相关 filter/formula 文件 |
| 视频笔记 | `src/components/video/` |
| 卡片流 | `src/components/cardflow/` |
| Codex 模式 | `src/components/codex/`, `src/stores/useCodexPanelDock.ts` |
| 浏览器视图 | `src/components/browser/`, `src/stores/useBrowserStore.ts` |
| 团队协作 | `src/components/team/`, `src/services/team/`, `src/stores/useOrgStore.ts` |

**修改 `src/App.tsx`**：移除上述组件的 import 和 tab 路由分支（`VideoNoteView`, `DatabaseView`, `FlashcardView`, `CardFlowView`, `CodexPanelHost`, `BrowserView`, `AgentEvalPanel`, `CodexVscodeHostPanel`）。

### Rust 后端删除

| 删除目标 | 路径 |
|---------|------|
| Codex 扩展 | `src-tauri/src/codex_extension.rs`, `src-tauri/src/codex_vscode_host.rs` |
| 移动网关 | `src-tauri/src/mobile_gateway.rs` |

**修改 `src-tauri/src/main.rs`**：移除相关 mod 声明和 invoke_handler 注册。
**修改 `src-tauri/src/lib.rs`**：移除相关 re-export。

### 依赖清理

**`package.json`**：移除 `gantt-task-react`, `@schedule-x/*`, 以及 Yjs/协作相关包。
**`src-tauri/Cargo.toml`**：评估移除 mobile_gateway 相关依赖。

---

## Phase 1: 三层数据模型

**目标**：建立 raw/wiki/schema 三层 vault 结构。

### 1A. Vault 目录结构

```
workspace/
  WIKI.md                      ← Schema 层：wiki 规则、命名约定
  raw/                         ← 不可变原料层（人控制）
    articles/                  网页文章
    papers/                    论文/PDF
    bookmarks/                 书签
    transcripts/               视频/播客转录
    notes/                     旧笔记迁移
  wiki/                        ← Wiki 层（LLM 控制）
    index.md                   总目录（LLM 导航入口）
    log.md                     时间线（append-only）
    concepts/                  概念页
    entities/                  实体页（人物/组织/项目）
    summaries/                 原料摘要页
```

### 1B. Wiki 页面格式

```markdown
---
title: Attention Mechanism
type: concept
sources:
  - raw/papers/vaswani-2017.md
related:
  - wiki/concepts/transformer.md
  - wiki/entities/openai.md
created: 2024-03-15
updated: 2024-03-20
confidence: high
---

# Attention Mechanism

[编译后的知识内容...]

## Key Claims
- 某个论断 → 来源 [[raw/papers/vaswani-2017.md]]

## Cross-References
- [[Transformer]] — 基于自注意力的架构
- [[OpenAI]] — 大规模使用注意力机制

## Open Questions
- Ring attention 如何扩展到超长上下文？
```

### 1C. Rust 新模块：`vault.rs`

**创建** `src-tauri/src/agent/vault.rs`

核心类型：
```rust
pub enum VaultLayer { Raw, Wiki, Schema }

pub struct VaultConfig {
    pub root_path: PathBuf,
    pub raw_dir: String,      // "raw"
    pub wiki_dir: String,     // "wiki"
    pub schema_file: String,  // "WIKI.md"
}

pub struct RawSource {
    pub id: String,
    pub source_type: RawSourceType,  // Article, Paper, Pdf, Bookmark, Transcript, Note
    pub title: String,
    pub file_path: String,
    pub ingested: bool,
    pub metadata: RawSourceMetadata,
}

pub struct WikiPage {
    pub path: String,
    pub title: String,
    pub page_type: WikiPageType,  // Index, Concept, Entity, Summary, Collection
    pub cross_refs: Vec<String>,
    pub source_refs: Vec<String>,
    pub last_updated: u64,
}

pub struct WikiIndex {
    pub pages: Vec<WikiPageEntry>,
    pub last_updated: u64,
}
```

### 1D. 前端 Vault Store

**创建** `src/stores/useVaultStore.ts`

```typescript
interface VaultState {
  rawSources: RawSource[];
  wikiPages: WikiPageEntry[];
  wikiIndex: WikiIndex | null;
  currentLayer: 'raw' | 'wiki' | 'schema';
  
  initializeVault: (workspacePath: string) => Promise<void>;
  loadWikiIndex: () => Promise<void>;
  addRawSource: (source: RawSourceInput) => Promise<void>;
}
```

### 1E. Durable Memory 迁移

**修改** `src-tauri/src/agent/durable_memory.rs`

现有 durable_memory 已有 wiki-based 存储（`WIKI_SECTIONS` 7 个分区，manifest.json + YAML 文件）。迁移策略：
- `Me` → `wiki/entities/me.md`
- `Projects` → 拆分为独立 `wiki/entities/{project}.md`
- `People` → 拆分为独立 `wiki/entities/{person}.md`
- `Preferences` → `wiki/meta/preferences.md`
- `Timeline` → 条目成为 wiki 页面的 source-refs
- 旧数据移入 `raw/memory-archive/`（不删除）
- 从迁移后的条目生成 `wiki/index.md`

### 1F. Schema 层：WIKI.md 模板

**创建** vault.rs 中的模板生成器，产出默认 `WIKI.md`，定义：
- 命名约定（概念页 `wiki/concepts/{kebab-case}.md`，实体页 `wiki/entities/{kebab-case}.md`）
- Ingest 规则（提取概念、双向交叉引用、标记矛盾）
- 质量标准（每页至少一个 source-ref、无孤立页面）

---

## Phase 2: Agent = 精简版 Coding Agent + Wiki Prompt

**目标**：agent 就是一个砍掉部分工具的 coding agent，system prompt 调整为 wiki 导向。没有特殊执行管线，没有 Ingest/Query/Lint 模块分离。

### 设计哲学

跟 Claude Code 操作代码仓库一模一样的模式——只是这个 agent 操作的是知识库（markdown 文件）。

### 2A. 工具集精简

**修改** `src-tauri/src/forge_runtime/tools/mod.rs`

保留的工具：
| 工具 | 用途 |
|------|------|
| `read` | 读取 wiki 页面、raw source、index.md |
| `write` | 创建新 wiki 页面 |
| `edit` | 更新现有 wiki 页面 |
| `glob` | 按模式查找文件（`wiki/concepts/*.md`） |
| `grep` | 在知识库中搜索内容 |
| `list` | 列出目录结构 |
| `fetch` | 抓取网页内容（用于导入 raw source） |

砍掉或限制的工具：
| 工具 | 处理方式 |
|------|---------|
| `bash` | 移除或严格限制（知识库操作不需要 shell 执行） |

### 2B. System Prompt 改造

**修改** `src-tauri/src/agent/commands.rs`

Agent 的 system prompt 核心内容：

```
你工作在一个知识库（vault）中。vault 结构：
- raw/：不可变的原始资料（文章、论文、书签等），你读取但通常不修改
- wiki/：你编译和维护的知识页面，用 markdown + YAML frontmatter
- wiki/index.md：总目录，你的导航入口
- WIKI.md：操作规则和命名约定

你的工作方式：
- 用户给你原料时，读取它，提取知识，创建/更新 wiki 页面，维护交叉引用，更新 index.md
- 用户问你问题时，先查 index.md 定位相关页面，读取后回答，引用来源
- 保持 [[wikilinks]] 双向交叉引用
- 发现矛盾时标记在 Open Questions 中
- 遵循 WIKI.md 中的具体规则
```

在构建消息时，自动注入：
1. WIKI.md 内容（如果存在）
2. wiki/index.md 内容（如果存在）

```rust
fn build_wiki_system_prompt(workspace_path: &str) -> String {
    let wiki_md = read_file_if_exists(workspace_path, "WIKI.md");
    let index_md = read_file_if_exists(workspace_path, "wiki/index.md");
    // 拼接为 system prompt
}
```

### 2C. 简化执行管线

现有 Explore→Plan→Execute→Verify 管线**大幅简化**：

- **移除** `src-tauri/src/agent/explore.rs`（Explore 阶段）— 不需要预扫描，agent 通过 glob/grep 自主探索
- **移除** `src-tauri/src/agent/plan.rs`（Plan 阶段）— 不需要任务分解，agent 自主规划
- **移除** `src-tauri/src/agent/verify.rs`（Verify 阶段）— 不需要验证阶段
- **移除** `src-tauri/src/agent/orchestrator.rs` 中的复杂度检测和模式选择 — 所有任务走同一条路径

**保留核心**：
- `forge_loop.rs` — 执行引擎（LLM + 工具调用循环）
- `llm_client.rs` — LLM 通信
- `commands.rs` — Tauri 命令入口（简化）
- `types.rs` — 类型定义（精简）

执行路径变为：
```
用户输入 → 构建 system prompt（含 WIKI.md + index.md）→ forge_loop（LLM + 工具） → 返回结果
```

没有 Explore/Plan/Execute/Verify 阶段，没有 Legacy/Orchestrated 模式选择。一条路径。

### 2D. 移除 RAG

纯 agent，不接入任何 RAG。

**删除**：
- `src/services/rag/`（vectorStore, chunker, embedder, reranker）
- `src/stores/useRAGStore.ts`
- `src-tauri/src/vector_db/`（整个目录）
- `src-tauri/src/main.rs` 中 vector_db 相关 commands
- `package.json` 中 `@langchain/*` 依赖

**修改**：
- `src-tauri/src/agent/types.rs`：移除 `RagResult`, `ResolvedLink`, `TaskContext.rag_results`, `TaskContext.resolved_links`
- `src/stores/useRustAgentStore.ts`：移除 RAG 相关逻辑
- `src/App.tsx`：移除 `useRAGStore` import 和初始化

### 2E. 移除 Durable Memory 系统

现有 durable_memory.rs 的功能被 wiki 层本身取代。wiki 页面就是持久记忆。

**删除**：
- `src-tauri/src/agent/durable_memory.rs`（2131 行）
- `src-tauri/src/agent/memory_extract.rs`
- `src/services/memory/durableMemory.ts`
- `src/services/memory/sessionMemory.ts`
- `src/stores/useMemoryStore.ts`
- `src/components/memory/MemoryReviewPanel.tsx`

**修改**：
- `src-tauri/src/agent/commands.rs`：移除所有 `agent_*_durable_memory_*` 和 `agent_*_session_memory_*` 命令
- `src-tauri/src/main.rs`：从 invoke_handler 移除内存相关命令
- `src/stores/useRustAgentStore.ts`：移除 memory extraction 逻辑

Agent 需要"记住"什么？写进 wiki 页面。需要了解用户偏好？读 `wiki/entities/me.md`。这就是 wiki 哲学。

### 2F. Lint（唯一独立功能）

**创建** `src-tauri/src/agent/lint.rs`

结构 lint 是纯 Rust，不需要 LLM，独立于 agent：

```rust
pub struct LintReport {
    pub checked_pages: usize,
    pub broken_links: Vec<BrokenLink>,
    pub orphaned_pages: Vec<String>,
    pub stale_pages: Vec<String>,
    pub overall_health: f32,
}

pub fn run_structural_lint(workspace_path: &str) -> LintReport {
    // 1. glob wiki/**/*.md
    // 2. 解析 frontmatter，提取 cross-refs 和 source-refs
    // 3. 验证 [[wikilinks]] 有效
    // 4. 检测孤立页面
    // 5. 检测过期页面
}
```

语义 lint（矛盾检测等）不需要独立实现——直接让 agent 做就行："帮我检查 wiki 有没有矛盾"。

---

## Phase 3: 前端 UI 改造

**目标**：从笔记 UI 转变为 Source Manager + Wiki Browser + Query Interface。

### 3A. 侧边栏改造

**创建** `src/components/layout/VaultSidebar.tsx`（替换现有 Sidebar 内容）

三个折叠区域：
1. **Raw Sources** — `raw/` 目录树，按类型分组，每个 source 显示 ingest 状态图标
2. **Wiki** — `wiki/` 目录树，index.md 置顶，按类型分组（concepts/entities/summaries）
3. **Quick Actions** — "Ingest Source"、"Ask Question"、"Run Lint" 按钮

### 3B. Raw Source 管理器

**创建** `src/components/raw/`：
- `RawSourceList.tsx` — 列表视图 + 元数据
- `RawSourceImporter.tsx` — 导入对话框（文件选择、URL 输入、拖拽、剪贴板）
- `IngestButton.tsx` — "Ingest into Wiki" 操作

### 3C. Wiki 浏览器

复用现有 CodeMirror 编辑器（`src/editor/Editor.tsx`），增强：
- Wiki 页面默认只读模式（LLM owns wiki/）
- "Source Trail" 面板：显示该 wiki 页引用了哪些 raw source
- "Cross-References" 面板：显示入链/出链

现有 `useNoteIndexStore.ts` 已有 `[[wikilink]]` 提取和 backlink 缓存，直接复用。

### 3D. Agent 对话面板

简化现有聊天面板（`src/components/chat/AgentPanel.tsx`）：
- 移除 "Chat" / "Agent" 双模式 — 只有一种模式：agent
- 移除 `MainAIChatShell.tsx` 中的简单 chat 模式（useAIStore 路径）
- 保留 agent 工具调用展示（read/write/edit 的执行过程可视化）
- 当 agent 引用 wiki 页面路径时，渲染为可点击链接（跳转到编辑器打开）

### 3E. Lint 仪表盘

**创建** `src/components/lint/`：
- `LintDashboard.tsx` — wiki 健康指标（总页数、过期数、孤立数、矛盾数、健康分）
- `LintIssueList.tsx` — 可排序/过滤的问题列表
- `ContradictionCard.tsx` — 矛盾对比展示

### 3F. 知识图谱增强

**修改** `src/components/effects/KnowledgeGraph.tsx`：
- 按层着色：raw source（蓝色）、wiki concept（绿色）、wiki entity（琥珀色）
- 边类型区分：wiki 交叉引用 vs raw source 引用
- 过滤控件：按层/按页面类型

### 3G. Tab 类型简化

**修改** `src/stores/useFileStore.ts`，`TabType` 精简为：
```typescript
type TabType = "file" | "pdf" | "graph" | "query" | "lint" | "schema" | "diagram" | "image-manager"
```

### 3H. Store 精简

移除 `useAIStore.ts`（简单 chat store，被 agent 统一取代）。

`useRustAgentStore.ts` 大幅简化：
- 移除 Explore/Plan/Verify 阶段相关状态（`exploreReport`, `currentPlan`, `verificationReport`）
- 移除 memory 相关状态和操作
- 移除 RAG 相关逻辑
- 保留核心：`messages`, `status`, `streamingContent`, `pendingTool`（工具审批）, `startTask`, `abort`

**创建** `src/stores/useLintStore.ts`（轻量）：

```typescript
interface LintState {
  lintReport: LintReport | null;
  isRunning: boolean;
  runLint: () => Promise<void>;
}
```

---

## Phase 4: Source 导入器

**目标**：构建 raw/ 层内容导入管线。

### 4A. Web Clipper
**创建** `src-tauri/src/agent/importers/web_clipper.rs`
- 复用 forge_runtime 的 `fetch` 工具
- 下载 URL → 提取正文（readability 算法）→ 保存为 `raw/articles/{date}-{title}.md`

### 4B. PDF 提取
复用现有 PDF 基础设施（`src/components/pdf/PDFViewer.tsx`）
- Rust 端文本提取 → 保存为 `raw/papers/{filename}.md`（原始 PDF 保留在旁边）

### 4C. 书签导入
**创建** `src-tauri/src/agent/importers/bookmark.rs`
- 导入浏览器书签 HTML → 按文件夹分组为 `raw/bookmarks/{category}.md`

### 4D. 导入器模块注册
**创建** `src-tauri/src/agent/importers/mod.rs`
```rust
pub trait SourceImporter {
    async fn import(&self, input: ImportInput) -> Result<RawSource, String>;
}
```

---

## Phase 5: 收尾与迁移

### 5A. 清理遗留代码
- 清理 Phase 0/2 删除模块遗留的 dead imports 和 unused dependencies
- 确认所有 RAG 相关代码已在 Phase 2 彻底移除

### 5B. 迁移工具
**创建** `src-tauri/src/agent/migrate.rs`
- 检测旧 `.lumina/memory/` 结构
- 现有笔记移入 `raw/notes/`
- Durable memory 条目转为 wiki 页面
- 生成初始 `wiki/index.md` 和 `WIKI.md`
- 迁移后运行 lint 展示健康度

### 5C. Welcome 改造
**修改** `src/components/onboarding/WelcomeScreen.tsx`
- 介绍三层模型
- 提供 "Import existing notes" / "Start fresh" 路径

---

## 关键决策

1. **Agent = 精简版 coding agent** — 跟 Claude Code 操作代码仓库一样，这个 agent 操作知识库。工具集砍到只剩 read/write/edit/glob/grep/list/fetch，system prompt 换成 wiki 导向
2. **Vault 即 wiki** — 整个工作空间就是知识库，三层结构（raw/wiki/schema）是组织方式，不是访问限制
3. **index.md 是唯一导航** — 纯 agent，不接 RAG。LLM 通过 index.md + 交叉引用 + read/glob/grep 工具自主导航
4. **一条执行路径** — 没有 Explore/Plan/Execute/Verify 分阶段，没有 Legacy/Orchestrated 模式选择。用户输入 → system prompt + 工具 → 结果
5. **wiki 即记忆** — 不需要独立的 durable memory 系统。agent 要记什么就写进 wiki 页面
6. **结构 lint 是唯一独立功能** — 纯 Rust 链接检查，不需要 LLM。语义 lint 直接让 agent 做

## 风险缓解

1. **index.md 过大** → 两级索引（index.md → category-index），LLM 先读顶层索引再跳转分类索引
2. **LLM wiki 维护质量** → WIKI.md 约束行为，structural lint 自动捕获问题
3. **迁移数据丢失** → 迁移工具从不删除旧数据，仅复制到新结构
4. **功能回归** → Markdown 编辑器、知识图谱、PDF 阅读器不变，只是组织模型变化
5. **过度设计** → Phase 2 做的是大量删除 + 一个 system prompt，不引入新抽象

## 验证方式

1. Phase 0 后：`npm run build` + `cargo build` 成功
2. Phase 1 后：打开 workspace，确认 raw/wiki/ 目录正确创建，index.md 可读
3. Phase 2 后：agent 对话中自然引用 wiki 页面，ingest 快捷路径正确生成 wiki 页面
4. Phase 3 后：UI 展示三层结构，图谱着色，lint 仪表盘可用
5. Phase 5 后：旧 workspace 迁移后 lint 健康分 > 0.8
