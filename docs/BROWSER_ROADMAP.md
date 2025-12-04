# AI 浏览器开发路线图

> 将 Lumina Note 扩展为 **AI 知识助手 + 轻量浏览器** 的混合工具

## 🎯 目标

打造一个能够：
1. **管理本地内容** - 笔记、文件、知识库
2. **访问网页** - 搜索、浏览、阅读
3. **AI 对话** - 结合本地和网页内容进行问答
4. **Add to Chat** - 将任意内容（笔记/网页/选中文本）添加到对话上下文

## 📐 架构设计

```
┌──────────┬─────────────────────────────────────────┬──────────────┐
│  侧边栏  │               内容区                     │  AI Chat    │
│──────────│─────────────────────────────────────────│──────────────│
│ 📁 笔记  │ ┌─ 标签页 ─────────────────────────────┐│ 📎 引用:    │
│  📄 日记 │ │ 📄 笔记.md │ 🌐 Google │ 🌐 文章   ││  - 笔记.md  │
│  📄 项目 │ └───────────────────────────────────────┘│  - 网页URL  │
│──────────│ ┌─ 地址栏 ─────────────────────────────┐│──────────────│
│ 🌐 书签  │ │ 🔍 https://example.com          [→] ││ [用户消息]  │
│  ⭐ GitHub│ └───────────────────────────────────────┘│             │
│  ⭐ 文档 │ ┌───────────────────────────────────────┐│ [AI 回复]   │
│──────────│ │                                       ││             │
│ 🕐 历史  │ │       笔记内容 / 网页渲染              ││             │
│          │ │                                       ││             │
│          │ │  [Add to Chat] [保存笔记] [加书签]   ││             │
│          │ └───────────────────────────────────────┘│ [输入框]    │
└──────────┴─────────────────────────────────────────┴──────────────┘
```

**布局说明**：
- **左侧**: 文件树 + 书签 + 历史（类似现有布局）
- **中间**: 主内容区（笔记编辑 / 网页浏览，支持多标签页）
- **右侧**: AI Chat 面板（可展开/收起）

## 🔧 技术方案

### 可复用的现有模块

| 模块 | 位置 | 说明 |
|------|------|------|
| Tauri 框架 | `src-tauri/` | Rust 后端 + React 前端 |
| LLM 服务层 | `src/services/llm/` | 8 个 Provider，流式输出 |
| Agent 系统 | `src/agent/` | 工具调用架构 |
| RAG 系统 | `src/services/rag/` | 可用于网页内容索引 |
| UI 组件 | `src/components/` | 侧边栏、标签页、设置 |
| **🎬 B站视频功能** | `src/components/video/` | **内嵌 WebView 架构，可直接复用！** |

### ⭐ 可复用：B站视频功能

> **重要发现**：B站视频笔记功能已经实现了完整的内嵌 WebView 架构，可以直接用于浏览器开发！

#### 已有的 Rust 命令（直接可用）

```rust
// src-tauri/src/commands/mod.rs

// 创建内嵌 WebView（核心功能！）
#[tauri::command]
pub async fn create_embedded_webview(
    app: AppHandle, 
    url: String,      // 任意 URL
    x: f64, y: f64,   // 位置
    width: f64, height: f64  // 大小
) -> Result<(), AppError>

// 更新 WebView 位置和大小
#[tauri::command]
pub async fn update_webview_bounds(app: AppHandle, x: f64, y: f64, width: f64, height: f64)

// 关闭 WebView
#[tauri::command]
pub async fn close_embedded_webview(app: AppHandle)

// 打开新窗口
#[tauri::command]
pub fn open_new_window(app: AppHandle, url: String, title: String)
```

#### 已有的前端组件

```typescript
// src/components/video/VideoNoteView.tsx
// 已实现：
// - 内嵌 WebView 创建和管理
// - WebView 位置/大小响应式更新
// - 与主窗口的交互

// src/types/videoNote.ts
// 已实现：
// - URL 解析工具函数
// - 内容保存为 Markdown
// - frontmatter 解析
```

#### 复用方式

1. **内嵌 WebView** - `create_embedded_webview` 已经支持任意 URL，不仅限于 B站
2. **WebView 管理** - 位置更新、关闭等命令现成可用
3. **保存为笔记** - `videoNoteToMarkdown` 可参考实现网页保存

#### 需要扩展的部分

| 功能 | 现有实现 | 需要扩展 |
|------|----------|----------|
| 创建 WebView | ✅ 支持任意 URL | 多标签页支持（改 webview id 为动态） |
| 导航控制 | ❌ 无 | 新增 `navigate_webview`, `go_back`, `go_forward` |
| 获取页面信息 | ❌ 无 | 新增 `get_page_title`, `get_page_url` |
| 内容提取 | ✅ 弹幕获取（参考） | 新增 `extract_page_content` |

### 需要新增的模块

| 模块 | 技术方案 | 说明 |
|------|----------|------|
| 网页搜索 | Bing/Google/Tavily API | 搜索引擎集成 |
| 网页抓取 | Rust reqwest + scraper | 获取网页内容 |
| 内容提取 | Readability.js | 提取正文，去除广告 |
| 内嵌浏览器 | Tauri WebviewWindow / iframe | 网页渲染 |
| 书签系统 | SQLite / JSON | 书签存储和管理 |
| 历史记录 | SQLite | 浏览历史 |

## 📅 开发阶段

> **开发顺序原则**: 先做基础浏览器功能，再深度融合 AI

---

### Phase 1: 内嵌浏览器基础 (1-2 周)

**目标**: 能在应用内浏览网页，支持标签页切换

> ⚡ **好消息**：B站视频功能已实现内嵌 WebView，可直接复用！

#### 1.1 技术方案（基于现有实现）

**直接复用 B站 WebView 架构：**

```rust
// ✅ 已有 - src-tauri/src/commands/mod.rs
create_embedded_webview(app, url, x, y, width, height)  // 创建
update_webview_bounds(app, x, y, width, height)         // 更新位置
close_embedded_webview(app)                              // 关闭
```

**需要新增的命令：**

```rust
// 🆕 需要新增
#[tauri::command]
pub async fn create_browser_webview(
    app: AppHandle,
    tab_id: String,    // 动态 ID，支持多标签页
    url: String,
    x: f64, y: f64, width: f64, height: f64
) -> Result<(), AppError>

#[tauri::command]
pub async fn navigate_webview(app: AppHandle, tab_id: String, url: String)

#[tauri::command]
pub async fn webview_go_back(app: AppHandle, tab_id: String)

#[tauri::command]
pub async fn webview_go_forward(app: AppHandle, tab_id: String)

#[tauri::command]
pub async fn webview_reload(app: AppHandle, tab_id: String)
```

#### 1.2 标签页系统扩展

```typescript
// 扩展现有的标签页系统
type TabType = 'note' | 'webpage' | 'graph';

interface Tab {
  id: string;
  type: TabType;
  title: string;
  path?: string;   // 笔记路径
  url?: string;    // 网页 URL
  favicon?: string;
}

// src/stores/useUIStore.ts 扩展
interface UIState {
  tabs: Tab[];
  activeTabId: string;
  // ...
}
```

#### 1.3 浏览器 UI 组件

```tsx
// src/components/browser/BrowserView.tsx
export function BrowserView({ url, onNavigate }: BrowserViewProps) {
  return (
    <div className="browser-view">
      {/* 地址栏 */}
      <AddressBar 
        url={url} 
        onNavigate={onNavigate}
        onBack={() => {}}
        onForward={() => {}}
        onRefresh={() => {}}
      />
      
      {/* 网页内容 */}
      <WebContent url={url} />
    </div>
  );
}
```

#### 1.4 交付物
- [x] 内嵌 WebView 渲染网页
- [x] 地址栏组件（URL 输入 + 导航按钮）
- [x] 标签页支持网页类型
- [x] 前进/后退/刷新功能
- [x] 新建网页标签页入口

#### 1.5 实现文件（已完成）

**Rust 后端** (`src-tauri/src/commands/mod.rs`)：
- `create_browser_webview` - 创建浏览器 WebView（多标签页支持）
- `update_browser_webview_bounds` - 更新 WebView 位置大小
- `close_browser_webview` - 关闭 WebView
- `navigate_browser_webview` - 导航到新 URL
- `browser_webview_go_back` / `go_forward` / `reload` - 导航控制
- `set_browser_webview_visible` - 可见性控制

**前端组件** (`src/components/browser/`)：
- `BrowserView.tsx` - 浏览器主视图组件
- `AddressBar.tsx` - 地址栏组件（输入、导航按钮、安全指示）
- `index.ts` - 导出文件

**Store 扩展** (`src/stores/useFileStore.ts`)：
- `TabType` 新增 `webpage`
- `Tab` 新增 `webpageUrl`, `webpageTitle` 属性
- `openWebpageTab()` - 打开网页标签页
- `updateWebpageTab()` - 更新网页标签页信息

**UI 集成**：
- `App.tsx` - 添加 webpage 标签页渲染分支
- `TabBar.tsx` - 添加 Globe 图标显示
- `Ribbon.tsx` - 添加浏览器按钮入口

---

### Phase 2: 书签与历史 (1 周)

**目标**: 完善浏览器基础功能

#### 2.1 书签系统

```typescript
// src/stores/useBookmarkStore.ts
interface Bookmark {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  folderId?: string;  // 所属文件夹
  createdAt: number;
}

interface BookmarkFolder {
  id: string;
  name: string;
  parentId?: string;
}
```

#### 2.2 历史记录

```typescript
// src/stores/useHistoryStore.ts
interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  visitedAt: number;
}
```

#### 2.3 侧边栏扩展

```tsx
// 在侧边栏添加书签和历史入口
<SidebarSection title="书签" icon={Star}>
  <BookmarkList />
</SidebarSection>

<SidebarSection title="历史" icon={Clock}>
  <HistoryList />
</SidebarSection>
```

#### 2.4 交付物
- [ ] 书签添加/删除/编辑
- [ ] 书签文件夹管理
- [ ] 历史记录自动保存
- [ ] 侧边栏书签/历史面板
- [ ] 清除历史功能

---

### Phase 3: 网页内容提取 (1-2 周)

**目标**: 能够提取网页正文，保存为笔记

#### 3.1 Rust 端网页抓取

```rust
// src-tauri/src/web.rs
#[tauri::command]
async fn fetch_webpage(url: String) -> Result<WebpageContent, String> {
    let html = reqwest::get(&url).await?.text().await?;
    // 使用 scraper 提取正文
}

#[derive(Serialize)]
struct WebpageContent {
    url: String,
    title: String,
    content: String,      // 清洁的正文 (Markdown)
    description: String,  // 摘要
    favicon: Option<String>,
}
```

#### 3.2 内容提取算法

选项：
- **Readability.js** - Mozilla 开源，前端运行
- **Rust scraper + 自定义规则** - 后端运行
- **Jina Reader API** - 云服务，简单可靠

#### 3.3 保存为笔记

```typescript
const saveWebpageAsNote = async (webpage: WebpageContent) => {
  const markdown = `# ${webpage.title}

> 来源: [${webpage.url}](${webpage.url})
> 保存时间: ${new Date().toLocaleString()}

---

${webpage.content}`;

  await createNote(`剪藏/${sanitizeFilename(webpage.title)}.md`, markdown);
};
```

#### 3.4 交付物
- [ ] Rust 网页抓取命令
- [ ] 正文提取（去广告/去导航）
- [ ] "保存为笔记" 按钮
- [ ] 剪藏文件夹管理

---

### Phase 4: AI 深度融合 (2 周)

**目标**: AI 能够搜索网页、阅读内容、与本地笔记结合

#### 4.1 新增 Agent 工具

```typescript
// web_search - 搜索网页
export const webSearchDefinition: ToolDefinition = {
  name: "web_search",
  description: "搜索网页，返回相关结果列表",
  parameters: [
    { name: "query", type: "string", required: true, description: "搜索关键词" },
    { name: "limit", type: "number", required: false, description: "结果数量，默认 5" },
  ],
};

// read_webpage - 读取网页内容
export const readWebpageDefinition: ToolDefinition = {
  name: "read_webpage",
  description: "读取网页内容，返回清洁的正文",
  parameters: [
    { name: "url", type: "string", required: true, description: "网页 URL" },
  ],
};
```

#### 4.2 Rust 端搜索 API

```rust
// src-tauri/src/web.rs
#[tauri::command]
async fn web_search(query: String, limit: Option<u32>) -> Result<Vec<SearchResult>, String> {
    // 调用 Bing/Tavily API
}

#[derive(Serialize)]
struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}
```

#### 4.3 Add to Chat 功能

```typescript
// 统一引用系统
interface Reference {
  type: 'note' | 'webpage' | 'selection';
  id: string;
  title: string;
  content: string;
  source: {
    path?: string;      // 笔记路径
    url?: string;       // 网页 URL
  };
}

// 在 Chat 中引用
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  references?: Reference[];
}
```

#### 4.4 网页内容选中引用

```tsx
// 选中文本后显示 "Add to Chat" 按钮
const handleTextSelection = () => {
  const selection = window.getSelection()?.toString();
  if (selection) {
    showAddToChatButton(selection);
  }
};
```

#### 4.5 交付物
- [ ] `web_search` Agent 工具
- [ ] `read_webpage` Agent 工具
- [ ] "Add to Chat" 按钮（网页/选中文本）
- [ ] 统一引用 UI
- [ ] AI 结合本地笔记 + 网页内容回答

---

## 🔌 API 选择

### 搜索 API

| 服务 | 特点 | 价格 |
|------|------|------|
| **Tavily** | 专为 AI 设计，返回清洁内容 | $0.01/search |
| **Bing Search** | 微软官方，稳定 | $3/1000 次 |
| **SerpAPI** | 多搜索引擎支持 | $50/月起 |
| **Google Custom Search** | 官方 API | $5/1000 次 |

**推荐**: Tavily（AI 优化）或 Bing（稳定便宜）

### 网页内容提取

| 方案 | 说明 |
|------|------|
| **Readability.js** | Mozilla 开源，前端/Node.js |
| **trafilatura** | Python 库，效果好 |
| **Rust scraper** | 原生 Rust，高性能 |
| **Jina Reader API** | 云服务，免费额度 |

---

## ⏱️ 时间估算

| 阶段 | 工作量 | 累计时间 | 备注 |
|------|--------|----------|------|
| Phase 1: 内嵌浏览器基础 | 1-2 周 | 1-2 周 | ⚡ 复用 B站 WebView |
| Phase 2: 书签与历史 | 1 周 | 2-3 周 | |
| Phase 3: 网页内容提取 | 1-2 周 | 3-5 周 | |
| Phase 4: AI 深度融合 | 2 周 | 5-7 周 | |

**总计**: 约 **5-7 周** 完成完整版 AI 浏览器

> 💡 由于 B站视频功能已实现核心 WebView 架构，Phase 1 可以更快完成！

---

## 🚀 快速启动 (MVP)

由于 B站功能已有 WebView 基础，可以更快：

1. **Day 1-2**: 复制 `VideoNoteView.tsx` 的 WebView 逻辑，改为通用浏览器
2. **Day 3-4**: 添加地址栏组件 + 导航按钮
3. **Day 5-6**: 扩展标签页系统支持 `webpage` 类型
4. **Day 7**: 简单书签功能

这样 **1 周**就能有一个能浏览网页的基础浏览器框架！

### MVP 核心代码参考

```tsx
// 从 B站功能复制的 WebView 创建逻辑
// src/components/video/VideoNoteView.tsx 第 96-116 行

const createWebview = useCallback(async () => {
  const container = containerRef.current;
  const rect = container.getBoundingClientRect();
  
  await invoke('create_embedded_webview', {
    url: currentUrl,
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  });
}, [currentUrl]);
```

---

## 📝 注意事项

1. **跨域问题**: 网页嵌入会遇到 CORS，需要代理或 Tauri 处理
2. **安全考虑**: 不要在 WebView 中执行不可信的 JavaScript
3. **性能优化**: 大网页的抓取和渲染需要优化
4. **API 费用**: 搜索 API 有调用限制，需要缓存策略

---

## 📚 参考项目

- [ArcSearch](https://arc.net/) - AI 浏览器标杆
- [SigmaOS](https://sigmaos.com/) - 工作流浏览器
- [Perplexity](https://perplexity.ai/) - AI 搜索引擎
- [Kagi](https://kagi.com/) - 付费搜索引擎
