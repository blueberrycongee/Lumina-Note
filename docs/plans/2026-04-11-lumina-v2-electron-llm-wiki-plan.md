# Lumina v2: Electron 迁移 + wuu sidecar + LLM Wiki 演进开工计划

**日期**: 2026-04-11
**作者**: blueberrycongee
**状态**: Draft（待评审）

---

## 1. 背景与动机

当前 Lumina-Note 基于 Tauri v2,过去半年里积累了三个相互纠缠的问题:

1. **WKWebView 渲染 bug 难以根治**: live 模式下拖动选区时,经过 `Decoration.replace()` widget 会导致选区视觉异常下沉、mouseup 后 selection 丢失。根本原因是 WebKit 在拖动期间对 replaced DOM 节点的 selection 行为与 Chromium 不一致,Tauri 用系统 WebView 无法绕过。这类问题在 macOS WebView 版本变化后还会反复出现。
2. **RAG 是被动检索器,知识无法沉淀**: 当前 vault 上的 RAG 是切块 + embedding + 检索的传统模式,跨笔记的知识关系、矛盾、概念演化都不被保留。Karpathy 在 2026-04 提出的 LLM Wiki 思路是一个直接对症的方向。
3. **wuu 已经实现了 agent loop / memory / subagent / insight 等核心能力**: 这些模块用 Go 写得相对扎实,但只跑在终端 TUI 里,没有被复用到笔记场景。

这次想一次性把这三件事在一个连贯的架构演进里解决。

## 2. 目标与非目标

### 目标

- **消除 live 模式下的拖动选区 bug**(以及一类 WKWebView 特有渲染问题)
- **把 wuu 的 agent / memory / insight 核心改造为可复用的 Go sidecar**,被 Lumina 通过 IPC 调用
- **构建 LLM Wiki synthesis pipeline**: vault 文件变更触发 → LLM 整合到现有 wiki 页面 → 显式标记矛盾 → 维护交叉引用
- **保持现有用户的本地数据可用**: vault、settings、向量库平滑迁移,不丢数据
- **保持现有功能可用**: 编辑器、图谱、PDF、WebDAV、协同等不退化

### 非目标(本期不做)

- 不改前端 UI 设计语言、不重写编辑器
- 不抛弃现有的 React 前端代码,99% 直接复用
- 不重写排版/typesetting Rust 代码,作为 sidecar 二进制保留
- 不做移动端
- 不引入新的状态管理 / 路由 / 样式方案
- 不在本期内做插件系统的大改

## 3. 目标架构

```
┌────────────────────────────────────────────────────────────┐
│                       Electron Shell                       │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │             Renderer (Chromium + React)              │ │
│  │  ─ 现有 Lumina-Note 前端,几乎原封不动               │ │
│  │  ─ Editor (CodeMirror 6 + codemirror-live-markdown)  │ │
│  │  ─ Knowledge Graph / LLM Wiki Viewer (新)            │ │
│  │  ─ Chat / Agent / Deep Research UI                   │ │
│  └──────────────────────────────────────────────────────┘ │
│                          ▲                                 │
│                          │ ipcRenderer ⇄ ipcMain           │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │               Main Process (Node.js)                 │ │
│  │  ─ 文件系统操作 (fs, chokidar)                       │ │
│  │  ─ 窗口管理 / 菜单 / 托盘 / 自动更新                 │ │
│  │  ─ Sidecar 进程编排 (wuu / typesetting / lumina-srv) │ │
│  │  ─ 现有 src/lib/tauri.ts 接口的 Electron 实现        │ │
│  └──────────────────────────────────────────────────────┘ │
│                          ▲                                 │
│                          │ stdio / HTTP                    │
└──────────────────────────┼─────────────────────────────────┘
                           ▼
       ┌────────────────────────────────────────┐
       │       Sidecar 进程(每平台二进制)      │
       │                                        │
       │  ┌──────────────────────────────────┐  │
       │  │  wuu-core (Go,本期重点)         │  │
       │  │  ─ agent loop / streaming        │  │
       │  │  ─ memory / context compaction   │  │
       │  │  ─ subagent management           │  │
       │  │  ─ wiki synthesis pipeline (新)  │  │
       │  └──────────────────────────────────┘  │
       │                                        │
       │  ┌──────────────────────────────────┐  │
       │  │  typesetting (Rust,迁移自 Tauri)│  │
       │  │  ─ 排版 / PDF 导出引擎           │  │
       │  └──────────────────────────────────┘  │
       │                                        │
       │  ┌──────────────────────────────────┐  │
       │  │  lumina-server (Rust,保留)       │  │
       │  │  ─ 协同 / auth / cloud relay     │  │
       │  └──────────────────────────────────┘  │
       └────────────────────────────────────────┘
```

### 关键设计点

- **Renderer 层几乎不动**: 通过保持 `src/lib/tauri.ts` 的导出接口不变,只替换实现,前端 147 个引用文件不需要逐个改动。
- **wuu 的 TUI 层全部抛弃**: `bubbletea` / `lipgloss` / `internal/markdown` 这些只在终端有用的部分不进入 sidecar,只保留 `internal/agent` / `internal/memory` / `internal/subagent` / `internal/compact` / `internal/insight` / `internal/config`。
- **三个 sidecar 都通过 Electron Main 进程统一编排**: 启停、健康检查、stdio 桥接,避免在 Renderer 直接 spawn 进程。
- **LLM Wiki pipeline 写在 Go 里**: 复用 wuu 的 insight 模块结构(scanner → generator → facets),把输入从代码换成 markdown 笔记,把输出换成 wiki 页面变更。

## 4. 关键决策记录(ADR)

| # | 决策 | 备选 | 理由 |
|---|------|-----|------|
| 1 | 框架: Tauri → Electron | 留在 Tauri 修 / Webview2 替换 | WKWebView 渲染 bug 是结构性问题,Tauri 内修是无底洞;Electron 用 Chromium 一次性消除一类 bug |
| 2 | sidecar 语言: Go (wuu) | Node.js 重写 / Rust 重写 | wuu 已经存在且测试覆盖良好,重写浪费几个月工程量 |
| 3 | sidecar 通信: stdio + JSON-RPC | HTTP / gRPC / WebSocket | stdio 最简单,Electron 原生支持子进程,无需端口冲突管理 |
| 4 | typesetting 处理方式: 保留 Rust 二进制作为 sidecar | 用 Node 库重写 / 直接砍掉 | 排版引擎复杂度高,重写收益小;sidecar 化代价低 |
| 5 | LLM Wiki 存储格式: 纯 markdown 文件 + 文件夹结构 | SQLite / 自定义二进制 | 人类可读、可 git diff、可被任何编辑器打开,符合本地优先理念 |
| 6 | LLM Wiki synthesis 触发方式: vault fs 事件 + 显式重建命令 | 实时编辑触发 / 定时扫描 | 实时触发会过度消耗 token;fs 事件 + 手动重建是最低成本 |
| 7 | 前端代码保留策略: 99% 复用,只改 `src/lib/tauri.ts` 实现 | 借机重写前端 | 迁移和重写不要混在一起,否则永远写不完 |

## 5. 分阶段计划

每个阶段都要有**可工作的产物**和**明确的验收点**,允许在阶段之间停下重新评估。

### Phase 0: 准备(3-5 天)

**目标**: 把目标架构、关键决策、迁移路径在文档和原型层面验证。

- [ ] 本计划文档评审通过
- [ ] 在一个 throw-away 分支里搭一个最小 Electron 工程,验证:
  - [ ] React + Vite + TypeScript 在 Electron renderer 里能跑
  - [ ] CodeMirror 6 + `codemirror-live-markdown` 拖动选区在 Electron 下表现正常(本次迁移最关键的验证点)
  - [ ] Electron 主进程能 spawn 一个 hello-world Go sidecar 并通过 stdio 通信
- [ ] 在 wuu 仓库里实验性导出一个 `wuu-core` library 模式(去掉 main TUI,只暴露核心 API)

**Phase 0 不通过则停**: 如果 Electron 下 CodeMirror 拖动选区还有同类问题,就要重新评估是不是 CodeMirror 自己的 bug。

### Phase 1: Electron 骨架 + fs 抽象层(1-2 周)

**目标**: 让 Lumina 在 Electron 里能启动、能开 vault、能编辑保存文件。

- [ ] 新建 `electron/` 目录,放主进程代码(`main.ts`, `preload.ts`)
- [ ] electron-builder 基础打包配置
- [ ] 把 `src/lib/tauri.ts` 改造成 `src/lib/host.ts`,保持导出接口不变,实现切到 ipcRenderer
- [ ] 在主进程里实现 `host.ts` 对应的 IPC handler:
  - [ ] 文件读写、目录列出、文件监听(chokidar)
  - [ ] 路径相关(homeDir / tempDir / join)
  - [ ] 对话框(dialog.showOpenDialog / showSaveDialog)
  - [ ] 外链打开(shell.openExternal / shell.openPath)
- [ ] 把 `MacTopChrome` / `TitleBar` 的 Tauri window API 替换为 Electron BrowserWindow 等价
- [ ] 移除 `@tauri-apps/*` 依赖,保留 `src-tauri/` 暂时不删(回退用)

**验收**: 启动 Electron app → 选 vault → 能浏览文件树 → 能打开 markdown → 能编辑保存 → live 模式拖动选区不再出现下沉 bug

### Phase 2: 散落 Tauri import 清理 + 事件流(1-2 周)

**目标**: 让所有 Tauri 直接调用都迁移完毕,LLM 流式输出和文件监听重新跑通。

- [ ] 清理 74 处直接 `@tauri-apps/*` import:
  - [ ] dialog 相关 8 处
  - [ ] path 相关 7 处
  - [ ] shell 相关 3 处
  - [ ] fs 相关 6 处
  - [ ] window/titlebar 2 处
  - [ ] updater 1 处(换 electron-updater)
  - [ ] os/platform 检测
  - [ ] 散落的 `invoke()` 直接调用
- [ ] 重做事件系统:
  - [ ] LLM streaming(`services/llm/httpClient.ts` 是关键)
  - [ ] 文件系统监听 (`fs:change` 事件)
  - [ ] DeepResearch 进度事件
  - [ ] RustAgent 事件
- [ ] 跑现有的所有单元测试 + e2e 测试,修绿

**验收**: 所有 Tauri import 清零;现有 RAG 检索、Chat、Agent、DeepResearch、文件监听全部工作。

### Phase 3: typesetting + lumina-server sidecar 化(1-2 周)

**目标**: 现有的 Rust 部分作为 sidecar 二进制存活,不退化排版/协同/云同步功能。

- [ ] 把 `src-tauri` 里的 typesetting 相关 Rust 代码抽出,改造为独立二进制 `lumina-typesetting`
  - [ ] 通信协议: stdio JSON-RPC
  - [ ] 暴露原 Tauri command 对应的接口
- [ ] `lumina-server` (协同/auth/cloud) 改造为 sidecar
- [ ] 主进程实现 sidecar manager: 启停、健康检查、自动重启、stderr 收集
- [ ] electron-builder 配置每平台打包对应的 sidecar 二进制

**验收**: PDF 导出正常;团队协同、登录、cloud relay 全部跑通。

### Phase 4: wuu sidecar 接入(2-3 周)

**目标**: 把 wuu 的 agent/memory/subagent/compact 接入,替换现有的 LLM 调用层。

- [ ] 在 wuu 仓库新增 `cmd/wuu-core` 入口,只暴露核心能力,不带 TUI
- [ ] 设计 stdio JSON-RPC 协议:
  - [ ] `agent.run` / `agent.stream`
  - [ ] `memory.read` / `memory.write` / `memory.list`
  - [ ] `subagent.spawn` / `subagent.list`
  - [ ] `compact.run`
- [ ] Lumina 主进程的 sidecar manager 接入 wuu-core
- [ ] Renderer 层把 `services/llm` 的部分调用切到 wuu-core sidecar
- [ ] 灰度: 先把一个简单场景(比如 Chat 模式)切过去验证,再扩散

**验收**: Chat / Agent 模式跑在 wuu sidecar 上,流式输出正常,断线重连/取消正常。

### Phase 5: LLM Wiki MVP(3-4 周)

**目标**: 实现 LLM Wiki synthesis 的最小可用版本,在小规模 vault 上跑通。

- [ ] 在 wuu 里基于 `internal/insight` 扩展出 `internal/wiki/`:
  - [ ] `scanner.go`: 监听 vault markdown 文件变更
  - [ ] `synthesizer.go`: 读新笔记 + 相关现有 wiki 页面 → LLM 整合 → 生成页面变更
  - [ ] `pages.go`: wiki 页面文件管理(创建/更新/合并/标记矛盾)
  - [ ] `index.go`: 维护页面之间的双向链接索引
- [ ] 设计 wiki 页面 markdown 格式约定:
  - [ ] frontmatter 包含 sources(指向原始笔记)、updated_at、conflicts
  - [ ] 正文是 LLM 生成的整合内容
  - [ ] 末尾有 `Related` 区域,自动维护交叉引用
- [ ] Lumina 前端新增 LLM Wiki Viewer:
  - [ ] 浏览自动生成的 wiki 页面树
  - [ ] 点击任意条目能看到其 sources(回到原笔记)
  - [ ] 显示矛盾标记
- [ ] 提供"重建整个 wiki"的命令(用于初次 onboarding 或灾难恢复)

**验收**: 在一个有 50-100 篇笔记的真实 vault 上运行,生成的 wiki 页面有合理的整合质量、能被人类阅读、不出现幻觉性矛盾。

### Phase 6: 收尾(1 周)

- [ ] 删除 `src-tauri/` 目录及相关 CI/CD
- [ ] 更新 README、文档、截图
- [ ] 灰度发布: v2.0.0-beta.1 给小范围用户测试
- [ ] 数据迁移工具: 现有 v1 用户的 vault / settings / 向量库无缝过渡

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
|-----|------|-----|
| Electron 包体积从 ~10MB 暴涨到 ~150MB | 用户下载/启动体验下降 | 接受;本地优先笔记应用对启动 1-2 秒不敏感 |
| CodeMirror 拖动 bug 在 Chromium 下还存在(小概率) | Phase 0 直接被否决 | Phase 0 必须先验证;若失败转为深入修 codemirror-live-markdown |
| wuu 核心 API 设计不稳定,接入后频繁改 | Phase 4 拖延 | 先冻结 wuu-core 的 v0 协议,Lumina 接的是冻结后的版本 |
| typesetting Rust 代码 sidecar 化遇到 Tauri 隐式依赖 | Phase 3 卡住 | 提前调研 typesetting 模块对 `tauri::AppHandle` 的依赖深度 |
| LLM Wiki synthesis token 成本失控 | Phase 5 跑不起来 | 设置每篇笔记 synthesis 的 token 上限;只在显式触发时跑;支持本地小模型(Ollama)做粗筛 |
| 数据迁移丢失老用户向量库 | 用户流失 | Phase 6 提供"v1 vault 直读"模式作为兜底,新向量库后台重建 |
| 同时做太多事,陷入永远在重写 | 项目失败 | 严格按 Phase 顺序,每个 Phase 不通过不进下一步;允许在任何 Phase 之间冻结发布 |

## 7. 验收标准(整体)

v2.0 GA 必须满足:

1. live 模式拖动选区 bug 完全消失
2. 现有 v1 功能 100% 保留(编辑、RAG、图谱、PDF、协同、WebDAV、插件)
3. 用户可以在 Lumina 内开启 LLM Wiki 功能,看到自动生成的 wiki 页面
4. wuu sidecar 的 Chat / Agent 模式在主流 provider(OpenAI / Anthropic / DeepSeek / Gemini)下正常工作
5. v1 → v2 数据迁移无损
6. macOS (Intel + Apple Silicon) + Windows 三平台正常打包

## 8. 下一步行动

- [ ] **本周内**: 计划评审,确认/调整 Phase 0 验证项
- [ ] **下周**: 启动 Phase 0,最重要的事情是在 Electron + CodeMirror 下复现拖动选区 bug,验证它确实消失
- [ ] **Phase 0 通过后**: 进入 Phase 1,开 `feat/electron-migration` 分支并行开发,主分支继续接受 v1 的关键 bug 修复

---

## 附录 A: wuu 复用清单

| wuu 模块 | 是否复用 | 在 Lumina v2 里的角色 |
|---------|---------|-------------------|
| `internal/agent/` | ✅ 核心 | LLM loop, streaming, tool use |
| `internal/memory/` | ✅ | 跨会话记忆 |
| `internal/subagent/` | ✅ | wiki synthesis 用多 agent 并行整合 |
| `internal/compact/` | ✅ | 长上下文压缩 |
| `internal/insight/` | ✅ 改造 | 作为 LLM Wiki synthesis 的基础 |
| `internal/config/` | ✅ | provider 配置 |
| `internal/worktree/` | ⚠️ 可能 | 如果 wiki 需要 git-aware 操作 |
| `internal/markdown/` | ❌ | 终端 markdown 渲染,Lumina 用前端渲染 |
| `cmd/wuu/main.go` (TUI) | ❌ | TUI 入口,Lumina 用 GUI |
| `bubbletea` / `lipgloss` 依赖 | ❌ | TUI 库,Lumina 不需要 |

## 附录 B: 关键文件清单

- `src/lib/tauri.ts` — 当前 Tauri 抽象层,Phase 1 重点
- `src/services/llm/httpClient.ts` — LLM streaming 入口,Phase 2 重点
- `src/editor/CodeMirrorEditor.tsx` — 编辑器主文件,Phase 0 验证目标
- `src-tauri/` — 当前 Rust 后端,Phase 3 拆分点
- (新)`electron/main.ts` — Electron 主进程入口
- (新)`electron/preload.ts` — preload 桥接
- (新)`electron/sidecars/` — sidecar 编排逻辑
- (新)`wuu/cmd/wuu-core/main.go` — wuu sidecar 入口
- (新)`wuu/internal/wiki/` — LLM Wiki synthesis 模块
