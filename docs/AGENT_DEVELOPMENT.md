# Lumina Note Agent 开发文档

> **最后更新**: 2024-11-29
> **当前阶段**: Phase 2 已完成 ✅

---

## 开发进度总览

### ✅ Phase 1: 基础 Agent 框架 (已完成)

| 模块 | 状态 | 说明 |
|------|------|------|
| Agent 核心循环 | ✅ 完成 | `src/agent/core/AgentLoop.ts` |
| 状态管理 | ✅ 完成 | `src/agent/core/StateManager.ts` |
| 消息解析 | ✅ 完成 | `src/agent/core/MessageParser.ts` |
| System Prompt | ✅ 完成 | `src/agent/prompts/PromptBuilder.ts` |
| 多模式系统 | ✅ 完成 | `src/agent/modes/index.ts` (4种模式) |
| LLM 提供商 | ✅ 完成 | `src/agent/providers/index.ts` |
| 工具注册表 | ✅ 完成 | `src/agent/tools/ToolRegistry.ts` |
| Agent UI | ✅ 完成 | `src/components/AgentPanel.tsx` |
| 状态 Store | ✅ 完成 | `src/stores/useAgentStore.ts` |

**已实现工具**:
- ✅ `read_note` - 读取笔记
- ✅ `edit_note` - 编辑笔记  
- ✅ `write_note` - 创建笔记
- ✅ `list_notes` - 列出笔记
- ✅ `move_note` - 移动笔记
- ✅ `search_notes` - 语义搜索 (RAG)
- ✅ `attempt_completion` - 任务完成

### ✅ Phase 2: RAG 搜索系统 (已完成)

- [x] Embedding 服务 (`src/services/rag/embedder.ts`)
- [x] 向量存储 (SQLite + Rust 后端)
- [x] 索引系统 (Markdown 分块器 + RAG Manager)
- [x] `search_notes` 工具

### ⏳ Phase 3: 高级功能 (待开发)

- [ ] `organize` 工具
- [ ] 流式响应
- [ ] 历史记录持久化

---

## ⚠️ 注意事项

### 已知问题

1. **消息历史保留**: 已实现跨任务保留历史，但清空按钮会清除所有

2. **工具审批**: 默认需要用户审批写操作，可在设置中开启自动审批

### 代码结构

```
src/agent/                    # ← Phase 1 新增
├── types.ts                  # 核心类型定义
├── index.ts                  # 模块导出
├── core/
│   ├── AgentLoop.ts          # 🔑 Agent 主循环
│   ├── StateManager.ts       # 状态管理
│   └── MessageParser.ts      # XML 解析
├── prompts/
│   └── PromptBuilder.ts      # System Prompt 构建
├── modes/
│   └── index.ts              # 4 种 Agent 模式
├── providers/
│   └── index.ts              # LLM 调用封装
└── tools/
    ├── ToolRegistry.ts       # 工具注册
    ├── definitions/          # 工具定义 (给 LLM)
    └── executors/            # 工具执行器
        ├── ReadNoteTool.ts
        ├── EditNoteTool.ts
        ├── WriteNoteTool.ts
        ├── ListNotesTool.ts
        ├── MoveNoteTool.ts
        ├── SearchNotesTool.ts    # ← Phase 2 新增
        └── AttemptCompletionTool.ts

src/services/rag/             # ← Phase 2 新增
├── types.ts                  # RAG 类型定义
├── index.ts                  # 模块导出
├── embedder.ts               # Embedding 服务 (OpenAI/Ollama)
├── chunker.ts                # Markdown 分块器
├── vectorStore.ts            # 向量存储 (Tauri wrapper)
└── manager.ts                # RAG 管理器

src-tauri/src/vector_db/      # ← Phase 2 新增
├── mod.rs                    # 向量数据库核心
└── commands.rs               # Tauri 命令
```

### UI 集成

- Agent 面板集成在右侧栏 "AI" 标签页
- 通过顶部切换按钮在 `Agent` 和 `对话` 模式间切换
- Agent 模式支持工具调用可折叠卡片显示
- AI 回复支持 Markdown 渲染

---

## 1. 项目愿景

将 Lumina Note 打造成一个 **AI 驱动的智能笔记管理系统**，类似于 Cursor/Roo-Code 对代码的处理方式，但专注于 Markdown 笔记的：

- **智能编辑** - AI 辅助修改、优化笔记内容
- **知识整理** - 自动分类、关联、重构笔记结构  
- **语义搜索** - 基于内容理解的笔记检索 (RAG)
- **批量操作** - 跨文件的批量修改和重组
- **工作流自动化** - 支持多步骤的复杂笔记处理任务

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Lumina Note                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Editor    │  │  Chat Panel │  │  File Tree  │    Frontend  │
│  │  (Tiptap)   │  │   (React)   │  │   (React)   │    (React)   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
├─────────┼────────────────┼────────────────┼─────────────────────┤
│         └────────────────┼────────────────┘                      │
│                    ┌─────▼─────┐                                 │
│                    │   Agent   │         Core Agent              │
│                    │   Core    │                                 │
│                    └─────┬─────┘                                 │
│         ┌────────────────┼────────────────┐                      │
│    ┌────▼────┐    ┌──────▼──────┐   ┌─────▼─────┐               │
│    │  Tools  │    │   Prompts   │   │   State   │               │
│    │ System  │    │   Builder   │   │  Manager  │               │
│    └────┬────┘    └─────────────┘   └───────────┘               │
├─────────┼───────────────────────────────────────────────────────┤
│    ┌────▼────────────────────────────────────────┐              │
│    │               Tool Implementations           │    Tools     │
│    ├──────────┬──────────┬──────────┬────────────┤              │
│    │read_note │edit_note │search    │list_notes  │              │
│    │write_note│move_note │organize  │create_note │              │
│    └──────────┴──────────┴──────────┴────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│    ┌─────────────────────────────────────────────┐              │
│    │              RAG System                      │   Services   │
│    ├─────────────┬─────────────┬─────────────────┤              │
│    │  Embedder   │VectorStore  │  SearchService  │              │
│    └─────────────┴─────────────┴─────────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│                    Tauri Backend (Rust)                          │
│    ┌─────────────┬─────────────┬─────────────────┐              │
│    │  File Sys   │   SQLite    │  File Watcher   │              │
│    └─────────────┴─────────────┴─────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
src/
├── agent/                      # Agent 核心
│   ├── core/
│   │   ├── AgentLoop.ts        # Agent 主循环
│   │   ├── StateManager.ts     # 状态管理
│   │   └── MessageParser.ts    # LLM 响应解析
│   │
│   ├── prompts/
│   │   ├── system.ts           # System Prompt 组装
│   │   ├── sections/           # Prompt 各部分
│   │   │   ├── role.ts         # 角色定义
│   │   │   ├── tools.ts        # 工具描述
│   │   │   ├── rules.ts        # 行为规则
│   │   │   ├── capabilities.ts # 能力说明
│   │   │   └── context.ts      # 上下文注入
│   │   └── responses.ts        # 错误响应模板
│   │
│   ├── tools/
│   │   ├── index.ts            # 工具注册表
│   │   ├── definitions/        # 工具定义 (给 LLM 看)
│   │   │   ├── read-note.ts
│   │   │   ├── edit-note.ts
│   │   │   ├── write-note.ts
│   │   │   ├── search-notes.ts
│   │   │   ├── list-notes.ts
│   │   │   ├── move-note.ts
│   │   │   ├── organize.ts
│   │   │   └── attempt-completion.ts
│   │   └── executors/          # 工具执行器
│   │       ├── ReadNoteTool.ts
│   │       ├── EditNoteTool.ts
│   │       ├── WriteNoteTool.ts
│   │       ├── SearchNotesTool.ts
│   │       ├── ListNotesTool.ts
│   │       ├── MoveNoteTool.ts
│   │       └── OrganizeTool.ts
│   │
│   └── modes/                  # 多模式支持
│       ├── index.ts
│       ├── editor.ts           # 编辑模式
│       ├── organizer.ts        # 整理模式
│       └── researcher.ts       # 研究模式
│
├── services/
│   ├── rag/                    # RAG 系统
│   │   ├── manager.ts          # RAG 管理器
│   │   ├── embedder.ts         # Embedding 服务
│   │   ├── vectorStore.ts      # 向量存储
│   │   ├── indexer.ts          # 索引构建
│   │   └── searcher.ts         # 语义搜索
│   │
│   └── ai/                     # AI 服务
│       ├── providers/          # 多 Provider 支持
│       │   ├── anthropic.ts
│       │   ├── openai.ts
│       │   ├── moonshot.ts
│       │   └── ollama.ts
│       └── streaming.ts        # 流式响应处理
│
├── stores/
│   └── useAgentStore.ts        # Agent 状态 Store
│
└── components/
    ├── AgentPanel.tsx          # Agent 面板
    ├── ToolApproval.tsx        # 工具审批 UI
    └── DiffView.tsx            # 编辑预览
```

---

## 3. 核心模块设计

### 3.1 Agent 循环 (AgentLoop.ts)

参考 Roo-Code 的实现，Agent 循环是整个系统的心脏：

```typescript
// src/agent/core/AgentLoop.ts

interface AgentState {
  status: "idle" | "running" | "waiting_approval" | "completed" | "error";
  messages: Message[];
  currentTask: string | null;
  pendingTool: ToolCall | null;
  consecutiveErrors: number;
}

export class AgentLoop {
  private state: AgentState;
  private abortController: AbortController | null = null;

  constructor(
    private llmProvider: LLMProvider,
    private toolRegistry: ToolRegistry,
    private promptBuilder: PromptBuilder
  ) {
    this.state = {
      status: "idle",
      messages: [],
      currentTask: null,
      pendingTool: null,
      consecutiveErrors: 0,
    };
  }

  /**
   * 启动 Agent 任务
   */
  async startTask(userMessage: string, context: TaskContext): Promise<void> {
    this.state.status = "running";
    this.state.currentTask = userMessage;
    this.abortController = new AbortController();

    // 构建初始消息
    const systemPrompt = this.promptBuilder.build(context);
    const userContent = this.buildUserContent(userMessage, context);

    this.state.messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ];

    // 进入主循环
    await this.runLoop();
  }

  /**
   * Agent 主循环 - 持续运行直到完成或中止
   */
  private async runLoop(): Promise<void> {
    while (this.state.status === "running" && !this.abortController?.signal.aborted) {
      try {
        // 1. 调用 LLM
        const response = await this.llmProvider.chat(this.state.messages, {
          signal: this.abortController?.signal,
        });

        // 2. 解析响应，提取工具调用
        const parsedResponse = this.parseResponse(response);

        // 3. 添加 assistant 消息
        this.state.messages.push({
          role: "assistant",
          content: response.content,
        });

        // 4. 处理工具调用
        if (parsedResponse.toolCalls.length > 0) {
          await this.handleToolCalls(parsedResponse.toolCalls);
        } else if (parsedResponse.isCompletion) {
          // 任务完成
          this.state.status = "completed";
          break;
        } else {
          // 没有工具调用也没有完成标记 - 提示 LLM
          this.state.consecutiveErrors++;
          if (this.state.consecutiveErrors >= 3) {
            this.state.status = "error";
            break;
          }
          this.state.messages.push({
            role: "user",
            content: this.getNoToolUsedPrompt(),
          });
        }
      } catch (error) {
        this.handleError(error);
      }
    }
  }

  /**
   * 处理工具调用
   */
  private async handleToolCalls(toolCalls: ToolCall[]): Promise<void> {
    for (const toolCall of toolCalls) {
      // 检查是否需要用户审批
      if (this.requiresApproval(toolCall)) {
        this.state.status = "waiting_approval";
        this.state.pendingTool = toolCall;
        // 等待用户审批
        const approved = await this.waitForApproval();
        if (!approved) {
          this.state.messages.push({
            role: "user",
            content: `用户拒绝了工具调用: ${toolCall.name}`,
          });
          continue;
        }
      }

      // 执行工具
      const result = await this.executeTool(toolCall);

      // 将结果添加到消息
      this.state.messages.push({
        role: "user",
        content: this.formatToolResult(toolCall, result),
      });

      this.state.consecutiveErrors = 0;
    }

    this.state.status = "running";
  }

  /**
   * 判断工具是否需要用户审批
   */
  private requiresApproval(toolCall: ToolCall): boolean {
    const safeTools = ["read_note", "list_notes", "search_notes"];
    return !safeTools.includes(toolCall.name);
  }

  // ... 其他方法
}
```

### 3.2 System Prompt 构建 (prompts/system.ts)

模块化组装 System Prompt：

```typescript
// src/agent/prompts/system.ts

export class PromptBuilder {
  constructor(
    private mode: AgentMode,
    private tools: ToolDefinition[]
  ) {}

  build(context: TaskContext): string {
    return `${this.getRoleDefinition()}

${this.getToolUseSection()}

${this.getToolsCatalog()}

${this.getCapabilitiesSection()}

${this.getRulesSection()}

${this.getContextSection(context)}

${this.getObjectiveSection()}`;
  }

  private getRoleDefinition(): string {
    return `你是 Lumina，一个专业的智能笔记助手，专注于帮助用户管理、整理和优化他们的 Markdown 笔记。

你的专长：
- 深入理解笔记内容和结构
- 优化 Markdown 格式和排版
- 整理和重构笔记组织
- 发现笔记间的关联和知识图谱
- 批量处理和迁移笔记内容`;
  }

  private getToolUseSection(): string {
    return `====

TOOL USE

你可以使用一组工具来完成用户的任务。每条消息必须包含且仅包含一个工具调用。
你需要逐步使用工具，每次工具调用都基于上一次的结果。

# 工具调用格式

使用 XML 标签格式调用工具：

<tool_name>
<param1>value1</param1>
<param2>value2</param2>
</tool_name>

请始终使用实际的工具名称作为 XML 标签名。`;
  }

  private getToolsCatalog(): string {
    return this.tools.map(tool => tool.definition).join("\n\n");
  }

  private getRulesSection(): string {
    return `====

RULES

- 笔记库根目录是: ${this.context.workspacePath}
- 所有文件路径必须相对于此目录
- 修改文件前必须先读取确认当前内容
- 不要询问不必要的信息，直接根据上下文行动
- 你的目标是完成任务，而不是进行对话
- 完成任务后必须使用 attempt_completion 工具
- 禁止以 "好的"、"当然"、"没问题" 等寒暄开头
- 每次工具调用后必须等待结果确认`;
  }

  private getContextSection(context: TaskContext): string {
    let section = `====

CONTEXT

笔记库路径: ${context.workspacePath}
当前打开的笔记: ${context.activeNote || "无"}
`;

    if (context.fileTree) {
      section += `\n笔记目录结构:\n${context.fileTree}`;
    }

    if (context.recentNotes) {
      section += `\n\n最近编辑的笔记:\n${context.recentNotes.join("\n")}`;
    }

    return section;
  }
}
```

### 3.3 工具定义示例

#### read_note 工具

```typescript
// src/agent/tools/definitions/read-note.ts

export function getReadNoteDefinition(): string {
  return `## read_note
描述: 读取一个或多个笔记文件的内容。返回带行号的内容，便于后续编辑时定位。

参数:
- paths: (必需) 要读取的笔记路径列表，相对于笔记库根目录

用法:
<read_note>
<paths>["notes/daily/2024-01-15.md", "notes/projects/idea.md"]</paths>
</read_note>

注意:
- 可以一次读取多个文件
- 返回内容带行号，格式如 "1 | # 标题"
- 如果文件不存在会返回错误信息`;
}
```

#### edit_note 工具

```typescript
// src/agent/tools/definitions/edit-note.ts

export function getEditNoteDefinition(): string {
  return `## edit_note
描述: 对笔记进行精确的查找替换修改。使用 SEARCH/REPLACE 块格式。

参数:
- path: (必需) 要编辑的笔记路径
- edits: (必需) 编辑操作数组，每个操作包含:
  - search: 要查找的原始内容 (必须与文件内容完全匹配)
  - replace: 替换后的新内容

用法:
<edit_note>
<path>notes/daily/2024-01-15.md</path>
<edits>[
  {
    "search": "## 待办事项\\n- [ ] 任务1",
    "replace": "## 待办事项\\n- [x] 任务1"
  }
]</edits>
</edit_note>

重要:
- search 内容必须与文件中的内容完全一致
- 可以进行多处修改，按顺序应用
- 修改前请先用 read_note 确认当前内容`;
}
```

#### search_notes 工具 (RAG 搜索)

```typescript
// src/agent/tools/definitions/search-notes.ts

export function getSearchNotesDefinition(): string {
  return `## search_notes
描述: 语义搜索笔记库。基于内容相似性找到相关笔记，而不是简单的关键词匹配。

参数:
- query: (必需) 搜索查询，用自然语言描述你要找的内容
- directory: (可选) 限定搜索范围的目录
- limit: (可选) 返回结果数量，默认 10

用法:
<search_notes>
<query>机器学习的反向传播算法</query>
<directory>notes/tech</directory>
<limit>5</limit>
</search_notes>

返回:
- 相关笔记列表，包含路径、相关度分数、相关片段`;
}
```

#### organize 工具

```typescript
// src/agent/tools/definitions/organize.ts

export function getOrganizeDefinition(): string {
  return `## organize
描述: 分析并建议笔记的组织结构优化。可以重命名、移动、合并或拆分笔记。

参数:
- scope: (必需) 组织范围，可以是目录路径或 "all"
- action: (必需) 操作类型: "analyze" | "rename" | "move" | "merge" | "split"
- options: (可选) 具体操作参数

用法:
<organize>
<scope>notes/inbox</scope>
<action>analyze</action>
</organize>

<organize>
<scope>notes/daily</scope>
<action>rename</action>
<options>{"pattern": "YYYY-MM-DD", "prefix": "daily-"}</options>
</organize>`;
}
```

---

## 4. RAG 系统设计

### 4.1 索引架构

```typescript
// src/services/rag/manager.ts

export class RAGManager {
  private embedder: Embedder;
  private vectorStore: VectorStore;
  private indexer: Indexer;
  private watcher: FileWatcher;

  constructor(config: RAGConfig) {
    this.embedder = new Embedder(config.embeddingProvider);
    this.vectorStore = new VectorStore(config.vectorDbPath);
    this.indexer = new Indexer(this.embedder, this.vectorStore);
    this.watcher = new FileWatcher();
  }

  /**
   * 初始化索引
   */
  async initialize(workspacePath: string): Promise<void> {
    await this.vectorStore.initialize();

    // 检查是否需要重建索引
    const hasIndex = await this.vectorStore.hasData();
    
    if (!hasIndex) {
      // 全量索引
      await this.indexer.fullIndex(workspacePath);
    } else {
      // 增量索引 - 只处理变更
      await this.indexer.incrementalIndex(workspacePath);
    }

    // 启动文件监听
    this.watcher.watch(workspacePath, async (event) => {
      if (event.type === "create" || event.type === "modify") {
        await this.indexer.indexFile(event.path);
      } else if (event.type === "delete") {
        await this.indexer.removeFile(event.path);
      }
    });
  }

  /**
   * 语义搜索
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    // 1. 生成查询向量
    const queryVector = await this.embedder.embed(query);

    // 2. 向量搜索
    const results = await this.vectorStore.search(queryVector, {
      limit: options?.limit || 10,
      minScore: options?.minScore || 0.7,
      filter: options?.directory ? { directory: options.directory } : undefined,
    });

    return results;
  }
}
```

### 4.2 笔记分块策略

针对 Markdown 笔记的特殊分块：

```typescript
// src/services/rag/chunker.ts

export class MarkdownChunker {
  /**
   * 将 Markdown 文档分割为语义块
   */
  chunk(content: string, filePath: string): Chunk[] {
    const chunks: Chunk[] = [];
    const lines = content.split("\n");
    
    let currentChunk: string[] = [];
    let currentHeading = "";
    let startLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 检测标题 (# ## ###)
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      
      if (headingMatch) {
        // 保存当前块
        if (currentChunk.length > 0) {
          chunks.push(this.createChunk(
            currentChunk.join("\n"),
            filePath,
            currentHeading,
            startLine,
            i
          ));
        }
        
        // 开始新块
        currentHeading = headingMatch[2];
        currentChunk = [line];
        startLine = i + 1;
      } else {
        currentChunk.push(line);
        
        // 块大小限制 (约 500 tokens)
        if (currentChunk.join("\n").length > 2000) {
          chunks.push(this.createChunk(
            currentChunk.join("\n"),
            filePath,
            currentHeading,
            startLine,
            i + 1
          ));
          currentChunk = [];
          startLine = i + 2;
        }
      }
    }

    // 最后一块
    if (currentChunk.length > 0) {
      chunks.push(this.createChunk(
        currentChunk.join("\n"),
        filePath,
        currentHeading,
        startLine,
        lines.length
      ));
    }

    return chunks;
  }

  private createChunk(
    content: string,
    filePath: string,
    heading: string,
    startLine: number,
    endLine: number
  ): Chunk {
    return {
      id: `${filePath}:${startLine}-${endLine}`,
      content,
      metadata: {
        filePath,
        heading,
        startLine,
        endLine,
      },
    };
  }
}
```

### 4.3 向量存储 (轻量级本地方案)

使用 SQLite + JSON 存储向量，适合本地笔记场景：

```typescript
// src/services/rag/vectorStore.ts

import { invoke } from "@tauri-apps/api/core";

export class VectorStore {
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    await invoke("init_vector_db", { path: this.dbPath });
  }

  async upsert(chunks: ChunkWithVector[]): Promise<void> {
    await invoke("upsert_vectors", {
      chunks: chunks.map(c => ({
        id: c.id,
        vector: Array.from(c.vector),
        metadata: c.metadata,
        content: c.content,
      })),
    });
  }

  async search(
    queryVector: Float32Array,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    return await invoke("search_vectors", {
      vector: Array.from(queryVector),
      limit: options.limit,
      minScore: options.minScore,
      filter: options.filter,
    });
  }

  async delete(ids: string[]): Promise<void> {
    await invoke("delete_vectors", { ids });
  }
}
```

对应的 Rust 后端实现 (Tauri)：

```rust
// src-tauri/src/commands/vector_db.rs

use serde::{Deserialize, Serialize};
use rusqlite::{Connection, params};

#[derive(Serialize, Deserialize)]
pub struct VectorChunk {
    id: String,
    vector: Vec<f32>,
    content: String,
    metadata: serde_json::Value,
}

#[tauri::command]
pub fn init_vector_db(path: String) -> Result<(), String> {
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS vectors (
            id TEXT PRIMARY KEY,
            vector BLOB NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn search_vectors(
    path: String,
    vector: Vec<f32>,
    limit: usize,
    min_score: f32,
) -> Result<Vec<SearchResult>, String> {
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    
    // 获取所有向量并计算余弦相似度
    let mut stmt = conn.prepare(
        "SELECT id, vector, content, metadata FROM vectors"
    ).map_err(|e| e.to_string())?;
    
    let mut results: Vec<(f32, SearchResult)> = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let vector_blob: Vec<u8> = row.get(1)?;
            let content: String = row.get(2)?;
            let metadata: String = row.get(3)?;
            
            let stored_vector: Vec<f32> = bincode::deserialize(&vector_blob)
                .unwrap_or_default();
            
            Ok((id, stored_vector, content, metadata))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .map(|(id, stored_vec, content, metadata)| {
            let score = cosine_similarity(&vector, &stored_vec);
            (score, SearchResult { id, content, metadata, score })
        })
        .filter(|(score, _)| *score >= min_score)
        .collect();
    
    // 按分数排序
    results.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
    
    Ok(results.into_iter().take(limit).map(|(_, r)| r).collect())
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    
    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a * norm_b)
    }
}
```

---

## 5. 多模式系统

### 5.1 模式定义

```typescript
// src/agent/modes/index.ts

export interface AgentMode {
  slug: string;
  name: string;
  icon: string;
  roleDefinition: string;
  tools: string[];  // 允许的工具列表
  systemPromptAdditions?: string;
}

export const MODES: Record<string, AgentMode> = {
  editor: {
    slug: "editor",
    name: "📝 编辑助手",
    icon: "pencil",
    roleDefinition: "你是一个专业的笔记编辑助手，擅长优化 Markdown 格式、改进文章结构、修正错误。",
    tools: ["read_note", "edit_note", "write_note", "search_notes", "attempt_completion"],
  },
  
  organizer: {
    slug: "organizer", 
    name: "📁 整理大师",
    icon: "folder",
    roleDefinition: "你是一个笔记整理专家，擅长分析笔记结构、建议分类方案、执行批量重组。",
    tools: ["read_note", "list_notes", "move_note", "organize", "search_notes", "attempt_completion"],
  },
  
  researcher: {
    slug: "researcher",
    name: "🔍 研究助手", 
    icon: "search",
    roleDefinition: "你是一个研究助手，擅长在笔记库中发现关联、提取知识、生成摘要。",
    tools: ["read_note", "search_notes", "list_notes", "attempt_completion"],
  },
  
  writer: {
    slug: "writer",
    name: "✍️ 写作助手",
    icon: "pen-tool",
    roleDefinition: "你是一个创意写作助手，帮助用户扩展想法、完善草稿、润色文字。",
    tools: ["read_note", "edit_note", "write_note", "search_notes", "attempt_completion"],
  },
};
```

---

## 6. 实现路线图

### Phase 1: 基础 Agent 框架 ✅ 已完成

- [x] **Agent 循环实现** (`AgentLoop.ts`)
  - 基本的请求-响应循环
  - 工具调用解析 (XML 格式)
  - 错误处理和重试机制
  - 消息历史保留

- [x] **System Prompt 系统** (`prompts/`)
  - 模块化 Prompt 构建器
  - 角色定义和规则
  - 上下文注入

- [x] **基础工具集**
  - `read_note` - 读取笔记
  - `edit_note` - 编辑笔记
  - `write_note` - 创建笔记
  - `list_notes` - 列出笔记
  - `move_note` - 移动笔记
  - `attempt_completion` - 任务完成

- [x] **Agent Panel UI**
  - 对话界面 (与 Chat 统一风格)
  - 工具调用可折叠卡片
  - 审批按钮
  - Markdown 渲染支持
  - 多模式切换 (编辑/整理/研究/写作)

### Phase 2: RAG 搜索系统 (2 周)

- [ ] **Embedding 服务**
  - OpenAI text-embedding-3-small 支持
  - 本地 Ollama 支持 (可选)

- [ ] **向量存储**
  - SQLite 本地存储
  - Rust 后端实现

- [ ] **索引系统**
  - Markdown 分块器
  - 全量/增量索引
  - 文件监听器

- [ ] **search_notes 工具**
  - 语义搜索接口
  - 结果格式化

### Phase 3: 高级功能 (2 周)

- [ ] **多模式系统**
  - 编辑/整理/研究/写作模式
  - 模式切换 UI

- [ ] **organize 工具**
  - 笔记分析
  - 批量重命名
  - 文件移动

- [ ] **流式响应**
  - 实时输出显示
  - 工具调用流式解析

- [ ] **历史记录**
  - 对话保存
  - 任务回溯

### Phase 4: 优化与扩展 (持续)

- [ ] **性能优化**
  - 缓存机制
  - 并发索引

- [ ] **更多 AI 提供商**
  - Anthropic Claude
  - 本地模型

- [ ] **高级整理功能**
  - 知识图谱
  - 自动标签

---

## 7. API 参考

### AgentLoop API

```typescript
interface AgentLoop {
  // 启动任务
  startTask(message: string, context: TaskContext): Promise<void>;
  
  // 中止任务
  abort(): void;
  
  // 审批工具调用
  approveToolCall(approved: boolean): void;
  
  // 事件监听
  on(event: "message" | "tool_call" | "status_change" | "complete", handler: Function): void;
}
```

### RAGManager API

```typescript
interface RAGManager {
  // 初始化
  initialize(workspacePath: string): Promise<void>;
  
  // 搜索
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  
  // 手动触发重建索引
  rebuildIndex(): Promise<void>;
  
  // 获取索引状态
  getIndexStatus(): IndexStatus;
}
```

---

## 8. 配置项

```typescript
// src/config/agent.ts

export interface AgentConfig {
  // AI 提供商配置
  ai: {
    provider: "anthropic" | "openai" | "moonshot" | "ollama";
    apiKey: string;
    model: string;
    baseUrl?: string;
  };
  
  // RAG 配置
  rag: {
    enabled: boolean;
    embeddingProvider: "openai" | "ollama";
    embeddingModel: string;
    chunkSize: number;  // 分块大小 (字符)
    chunkOverlap: number;  // 重叠字符数
    minScore: number;  // 最低相似度
    maxResults: number;  // 最大返回数
  };
  
  // Agent 配置
  agent: {
    defaultMode: string;
    autoApproveReadTools: boolean;  // 自动批准只读工具
    maxConsecutiveErrors: number;
    streamingEnabled: boolean;
  };
}
```

---

## 9. 与现有代码的整合点

### 9.1 现有 AI 模块 (`src/lib/ai.ts`)

当前已有基础的 AI 调用和编辑解析，需要：
- 保留 `parseEditSuggestions` 和 `applyEdit` 函数
- 将 `chat` 函数改造为支持流式
- 添加工具调用解析

### 9.2 状态管理 (`src/stores/`)

- 新增 `useAgentStore.ts` 管理 Agent 状态
- 与现有 `useAIStore.ts` 整合

### 9.3 Tauri 后端 (`src-tauri/`)

需要新增 Rust 命令：
- `init_vector_db` - 初始化向量数据库
- `upsert_vectors` - 插入/更新向量
- `search_vectors` - 向量搜索
- `delete_vectors` - 删除向量
- `watch_directory` - 文件监听

---

## 10. 参考资源

- [Roo-Code 源码分析](./roocode.md)
- [Anthropic Tool Use 文档](https://docs.anthropic.com/claude/docs/tool-use)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Tauri 文档](https://tauri.app/v2/guide/)
