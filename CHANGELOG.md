# Changelog

All notable changes to Lumina Note will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.11] - 2026-06-01

本次补丁版本修复 PDF 加载失败，并将 Cmd+P / Cmd+K 两套命令面板合并为单一入口，附带欢迎页 UI 收敛与若干内部 CI 改进。

### 修复
- **PDF 加载失败修复**：`pdfjs-dist` 锁到与 `react-pdf` 一致的 `5.4.296`，避免 pnpm 提升到 `5.7.x` 后 worker 与主线程版本错位（`The API version "5.4.296" does not match the Worker version "5.7.284"`），任意 PDF 打开即报错的回归。
- **命令面板 hover 可见性**：合并后的命令面板在图片皮肤下保持稳定的 hover 背景（沿用 `Row` 原语的 `hover:bg-foreground/5`），避免低对比度主题下无视觉反馈。

### 改进
- **命令面板合并为单一入口**：移除独立的 Cmd+K 命令面板，仅保留 Cmd+P；i18n 命名空间从 `commandPalette` 统一为 `commandMenu`，四个 locale 同步对齐。
- **欢迎页 UI 收敛**：移除冗余的引导元素，减少初次启动的视觉噪声。

### 内部
- **CI 触发与测试报告**：补充手动 / 定时触发的 CI 工作流，并上传测试报告为 artifact，便于回归追踪。
- **CI workflow 默认值加固**：收紧权限与默认分支路径，避免历史默认值在 fork / PR 上的副作用。

## [1.4.10] - 2026-05-30

本次补丁版本修复 GitHub Release 资产命名和更新 feed 不一致导致的 macOS 应用内更新 404。

### 修复
- **macOS 更新下载 404 修复**：固定 electron-builder 的发布产物命名，避免 GitHub 上传时改写空格导致 `latest-mac.yml` 指向不存在的文件。

### 内部
- **Release 资产校验**：发布上传前校验 `latest*.yml` 中引用的资产都存在，并限制上传文件名为 GitHub-safe 格式，避免同类问题再次进入正式 Release。

## [1.4.9] - 2026-05-30

本次补丁版本修复保存冲突误报，并收敛生产环境日志输出，降低用户正常使用时的噪声。

### 改进
- **编辑器工具整合到顶部 TabBar**：将编辑模式切换和分屏入口移到 macOS 顶部 TabBar，减少编辑区内的重复顶部工具栏。
- **生产环境日志收敛**：启动路径、opencode server 信息、preload shim 和 SSE 连接状态等调试日志仅在开发环境输出，生产环境默认保持安静。

### 修复
- **保存冲突误报修复**：保留文件 `mtimeMs` 的小数毫秒精度，避免同一个文件在正常保存时被误判为磁盘已修改。

### 内部
- **外部文件变更处理方案补充**：记录后续外部文件变更同步与保存冲突保护的实现目标和验收标准。

## [1.4.8] - 2026-05-30

本次补丁版本聚焦左侧文件树和 macOS 顶部栏的视觉一致性，减少交互中的突兀跳变。

### 改进
- **文件树展开/收起动效优化**：文件夹展开和收起时新增克制的行级动效，同时避免虚拟列表定位动画引起的抖动。
- **文件树 hover 状态优化**：文件树 hover 背景改为共享高亮跟随移动，减少从一个文件切换到另一个文件时的割裂感。
- **文件树滚动条布局稳定**：滚动条出现或隐藏时预留稳定 gutter，避免选中态和 hover 高亮宽度变化。
- **macOS 顶部栏分割线统一**：左侧面板顶部工具栏与编辑器 TabBar 使用一致的底部分割线绘制方式。

## [1.4.7] - 2026-05-30

本次补丁版本修复 1.4.6 外部文件变更保护引入的保存冲突误报，并恢复 Electron 窗口在存在未保存内容时的可关闭性。

### 修复
- **自保存事件不再误报保存冲突**：Lumina Note 自己保存文件后，文件监听器延迟到达的 `modified` 事件不再被误判为外部修改，避免继续编辑时弹出 Save conflict。
- **未保存确认后可以关闭窗口**：选择 “Close Without Saving” 后主进程会正确关闭 Electron 窗口，不再被 renderer 的 `beforeunload` 二次拦截。
- **未保存文件数量不再重复计算**：关闭确认弹窗中的未保存文件数量按实际文件去重，避免当前编辑文件被重复计数。

## [1.4.6] - 2026-05-29

本次小版本聚焦背景壁纸皮肤体验、壁纸导入持久化，以及外部文件变更与侧栏选择状态的稳定性。

### 新功能
- **通用背景皮肤入口**：设置页新增更轻量的背景皮肤入口，支持预设背景和本地图片背景，并移除过度复杂的配色自定义入口。
- **图片壁纸自适应配色**：本地图片壁纸会提取颜色信息并生成可读性优先的界面 token，覆盖主界面、TabBar、弹窗、浮层、提示和固定控件等背景相关表面。
- **壁纸导入持久化**：选择本地壁纸时会导入到应用数据目录并持久化导入后的路径，重启应用后继续使用上一次选择的壁纸。

### 改进
- **背景图片亮暗模式自动选择**：选择图片壁纸后会根据图片整体明暗自动切换到更适合阅读的亮色或深色模式，同时保留用户手动切换能力。
- **侧栏选择状态对齐**：侧栏单击文件时，选择状态与实际打开文件保持一致，避免预览特殊文件时出现选中态错位。

### 修复
- **外部文件变更处理**：改进外部编辑或同步引起的文件变更处理，降低文件状态不同步和误覆盖风险。

## [1.4.5] - 2026-05-28

本次小版本聚焦 TabBar 拖拽视觉修复，并修复 CI 中 Electron main handler 测试对真实 Electron binary 的依赖，确保后续发版链路稳定。

### 修复
- **Tab 拖拽横线消失修复**：拖动 tab 时不再把 tab 在 Y 轴上抬起，避免 TabBar 的横线在拖动过程中被视觉上遮挡或错位。
- **生产依赖安全更新**：更新生产依赖以解决 audit 报告中的漏洞。

### 内部
- **Electron main handler 测试稳定性修复**：`fs` 和 `platform` handler 测试改为 mock `electron`，避免 CI runner 缺少 Electron binary 时全量测试失败。

## [1.4.4] - 2026-05-13

本次小版本聚焦工作区打开后的最近记录一致性，以及侧栏新建输入体验的细节打磨。

### 改进
- **侧栏新建输入框样式优化**：调整侧栏中新建文件/文件夹输入态的间距、边框和交互细节，让它更贴近现有文件树视觉层级。

### 修复
- **最近工作区更新修复**：修复工作区成功打开后的 recent vault 更新时机，避免打开成功但最近记录没有正确同步的问题。

## [1.4.3] - 2026-05-13

本次小版本聚焦 AI 工作区首屏、Agent 运行状态展示，以及无 Apple 签名约束下的 macOS 自动更新体验。

### 新功能
- **无签名 macOS 自动更新链路**：macOS release 改用 ad-hoc signing + 自定义更新器，下载 GitHub Release 里的 zip，校验 `latest-mac.yml` SHA-512 后 staging，并在重启时替换应用。这样在没有 Apple Developer ID 签名的硬约束下，仍然能给用户提供应用内更新体验。
- **工作区首屏进入 AI Chat**：进入真实工作区后默认打开 AI 对话界面，不再先显示一个空标签页。
- **AI 错误设置入口**：AI provider / runtime 错误提示新增设置动作，用户可以从错误状态直接跳到需要处理的配置位置。

### 改进
- **Agent 工作状态展示重做**：统一运行中和完成后的耗时显示，状态切换加入更平滑的文字过渡，减少从“思考”到“调用工具”等状态变化时的突兀跳变。
- **更新设置页更贴近实际流程**：按钮和状态从“下载并安装”改为“下载更新 → 校验 / 准备 → 重启并更新”，诊断信息默认折叠；macOS 应用位置不可写时会提示用户把应用移到“应用程序”文件夹。
- **AI 对话体验收口**：聊天会话切换时自动滚到底部，opencode 生成的会话标题会同步展示，持续运行中的 Agent 聊天在消息 part 更新时保持稳定。

### 修复
- **Agent 计时连续性修复**：修复 Agent 工作计时在消息流、思考和工具调用之间不连续的问题。
- **AI runtime readiness 与错误分类修复**：补齐运行时就绪检查，并把 provider/runtime 错误归类成更可读的用户提示。
- **表格拖拽选择冲突修复**：修复表格场景下拖拽选择和其它交互互相抢占的问题。

## [1.4.2] - 2026-05-09

本次小版本聚焦 tab 条的交互体验与稳定性，以及多文件打开时的竞态防护。

### 改进
- **Tab 拖拽实时投影**：拖动 tab 时其他 tab 会即时让位，松手前就能预览落点；固定 tab 与普通 tab 各自在分组内排序。
- **可滚动 tab 条**：tab 过多时整条可横向滚动，鼠标滚轮自动转横向，激活 tab 自动滚入视口；新建按钮跟随最后一个 tab 的右沿。
- **侧栏单击预览 / 双击永久打开**：文件单击进入 preview 槽，双击才提升为永久 tab；diagram、pdf、image 与普通文件共用同一个 preview slot。
- **Chrome 风格关闭与中键关闭**：关闭当前 tab 后优先激活右邻 tab（否则左邻），并支持中键关闭未固定的 tab。
- **紧凑宽度自适应**：tab 过多时自动收起标签或 close 按钮，避免文字相撞。

### 修复
- **Hover 状态偶发失效**：之前点击会急切 setPointerCapture，让浏览器 `:hover` 锁死在被点击的 tab 上；现在 capture 推迟到真正进入拖拽态后才执行，简单点击不再锁 hover。
- **拖拽 tab 被切成矩形**：拖拽位移之前作用在内层 motion 容器上，被外层 `overflow-hidden` 沿垂直线切断，看起来像被一个矩形挡住；现在位移作用在外层，silhouette 完整跟手。
- **右键菜单错位**：菜单弹出后如果 tab 顺序变化，操作会作用到错误的 tab；现在以 tab id 为准。
- **连续打开文件的竞态**：连续点击不同文件时，先点的慢加载会顶掉后点的；新增请求序列号，过期请求被丢弃。

## [1.4.1] - 2026-05-08

本次发版集中修复 v1.4.0 之后发现的聊天、技能发现、工作区和图谱问题，并补上应用更新安装链路。

### 新功能
- **更新下载后可直接安装**：设置页的更新流程现在会调用 quit-and-install，下载完成后可以真正进入安装。
- **阅读模式表格内联 Markdown**：表格单元格里的内联 Markdown 现在可以正确渲染。

### 修复
- **主聊天计时器修复**：`Working · mm:ss` 从用户发送被接受时开始计时，覆盖等待首 token、思考和工具调用，不再只像是在计算思考阶段。
- **斜杠技能加载修复**：`/` 技能菜单会从当前 opencode vault instance 加载技能，并在启动 race 后重试，避免 Electron dev 下显示“没有可用技能”。
- **Agent 发送链路修复**：修复忙碌时连续发送、乐观用户消息替换、重试最后发送意图、图片附件发送和若干 opencode SSE/session pipeline 问题。
- **AI 模型限制修复**：根据官方模型文档调整模型限制，并修复相关中等优先级问题。
- **图谱数据修复**：本地图谱和全局图谱改为从 note index 派生，避免图谱数据不完整或不同步。
- **工作区过大处理修复**：文件遍历超过限制时抛出并展示 typed workspace-too-large warning，不再静默截断。
- **图片管理器元数据修复**：恢复图片 size、mtime、ctime 的懒加载统计。
- **编辑器显示修复**：修复标题与正文对齐、列表排版、默认字号、阅读宽度、slash AI IME 处理和复制按钮流式状态。
- **启动与标签修复**：修复 active tab 初始化和懒加载文件夹展开更新时机。

### 改进
- **工作区性能**：限制 workspace listing，虚拟化侧栏，并降低 note indexer 对大工作区的影响。
- **聊天滚动稳定性**：使用 ResizeObserver 处理自动滚动，减少状态驱动滚动带来的跳动。
- **Markdown 可读性**：改善 live / reading 模式下的正文、列表和紧凑上下文内联 Markdown 可读性。

## [1.4.0] - 2026-05-02

本次发版把 VS Code AI 插件兼容层从实验设置项推进到可用的侧栏入口，同时继续收口斜杠 AI 的 inline 生成体验。

### 新功能
- **VS Code AI 插件侧栏入口**：新增可选的 VS Code AI 侧栏 slot，可在侧栏中切换 Codex / Claude Code，并打开插件自己的 webview UI。
- **Codex / Claude Code 插件兼容**：补齐 VS Code host 的 webview、terminal、workspace fs、findFiles、watcher、diff、status bar、progress、authentication、configuration inspect 等兼容 API，使插件更新后可以按兼容 profile 继续安装和激活。
- **插件安装与更新来源**：支持从 Marketplace / GitHub Release / 手动 VSIX 导入安装 AI 插件，并通过远程兼容 profile 更新稳定版本覆盖范围。
- **斜杠 AI inline 生成**：斜杠命令 AI 改为在编辑器内显示流式草稿、工作步骤和最终插入预览，接受前不污染 Markdown 正文。

### 修复
- **Codex / Claude Code webview 主题修复**：补齐 VS Code theme token，修复插件菜单、按钮、hover 卡片和弹层在浅色模式下透明或文字不可见的问题。
- **插件平台校验**：拒绝安装与当前平台不匹配的 VSIX，避免用户点击安装后得到不可运行的扩展。
- **插件激活门禁**：安装和手动激活前执行 smoke test，缺少 host API 时阻止激活并记录能力缺口。
- **斜杠 AI 滚动修复**：生成过程中更新 inline preview 时保留用户当前滚动位置，避免编辑器被持续拉回生成位置导致无法向上滚动。
- **本地聊天图片渲染修复**：聊天消息中的本地 Markdown 图片可以正确渲染。

### 改进
- **插件管理界面降噪**：移除无用的打开状态提示和诊断区，压平 VS Code AI 侧栏 chrome，减少卡片层级和冗余信息。
- **侧栏折叠图标修复**：修复折叠侧栏 toggle icon 状态显示不一致的问题。

## [1.3.6] - 2026-05-01

### 修复
- **opencode provider 切换缓存修复**：provider / model 设置变化并重启 opencode 前，先 dispose 所有 opencode directory instance，强制 provider/model state 用最新配置重建，避免切到 MiMo Token Plan 等 provider 后仍命中旧缓存并报 `ProviderModelNotFoundError`。

## [1.3.5] - 2026-05-01

本次发版重点是把 v1.3.4 之后的 AI / opencode / 图片生成链路收口：主聊天的 provider 切换更稳定，图片生成不再完全依赖聊天模型可用，Lumina Cloud 的账号与 provider 入口也补齐了。

### 新功能
- **Lumina Cloud 入口补齐**：新增 Lumina Cloud provider、license 安全存储、revocation cache、账号用量面板、License Settings，以及 AI Settings 里的 Lumina Cloud provider row。
- **图片生成独立可用**：新增 Image Models 设置，支持 gpt-image-2 / Nano Banana / Seedream 三个图片 provider；当主聊天 agent 没配置或不可用时，图片模式可以直接走已配置的图片 provider 生成图片。
- **聊天图片工作流增强**：欢迎页新增 "Generate an image" 入口；聊天里的生成图片可点击回填为下一次输入参考；生成结果在聊天中以专门的图片卡展示，避免重复插入 markdown。
- **opencode skill / plugin 接入**：内置 image-gen skill，接入 Lumina opencode plugin 的 `generate_image` tool；Skill Manager 改为读取 opencode 原生 skill API。

### 修复
- **opencode 启动和重启更稳**：等待 server startup 后再返回 IPC；provider 重启期间保持 session；处理 `server.instance.disposed` 事件，避免 provider restart 后聊天流断掉无反馈。
- **provider / model 切换修复**：发送请求时显式带上用户选中的模型；修复 DeepSeek V4 thinking 参数位置和 instant mode；改善 MiMo Token Plan、DeepSeek、provider-aware model selection 的同步。
- **AI Settings 同步修复**：桌面 profile 切换会同步 provider 配置；保存 provider 设置时不再被 opencode restart readiness 阻塞；provider refresh 有明确等待路径。
- **图片 provider 路由更可靠**：图片 provider 网络失败处理更稳；路由不再误切 provider；设置页始终渲染三个 provider row，避免用户无处填写 key。
- **聊天发送体验修复**：opencode 冷启动期间立即显示 pending user message；错误 banner 保持 sticky，避免错误刚出现就被 idle 状态覆盖。
- **侧栏折叠态控制修复**：当主内容区被右侧栏挤到折叠时，左右侧栏开关会穿出到布局层，避免中间区消失后无法操作侧栏；右侧 resize handle 也保持贴住右侧栏左边缘，不再因 fallback 控制条错位。
- **编辑器 live markdown 交互修复**：稳定 live image、表格、callout、Mermaid、blockquote、代码块和异步 widget 的布局与选择行为，减少切换模式和滚动时的跳动。
- **PDF 选择修复**：恢复 PDF 文本选择能力，同时保留应用 chrome 的默认不可选中行为。

### 改进
- **Agent V2 代码结构收敛**：仍被 V2 使用的 provider settings、image provider settings、agent IPC dispatch 移到 `electron/main/agent-v2/`，删除代码层面的 `electron/main/agent/` 旧路径，清理 `Rust Agent` / V1 runtime 残留命名。
- **错误处理统一**：新增结构化 error envelope、统一 reporter、toast bridge、retry policy、traceId 和诊断面板，让聊天、侧栏、编辑器错误走同一条用户可理解的路径。
- **聊天时间线降噪**：连续工具调用折叠为一个工作会话，运行态文案更克制，并显示完成耗时。
- **图片显示更克制**：生成图片在聊天中缩小展示，减少对对话流的打断。
- **主界面 chrome 打磨**：TabBar、侧栏 toggle、新建标签、图片管理器、知识图谱和模型选择器的密度与动效继续收敛，减少不必要的视觉噪声。

## [1.3.4] - 2026-04-27

紧跟 v1.3.3 的第三次发版——这次修的是 AI Settings 输入框处理 paste 的方式。

### 修复
- **API key 粘贴会跟旧值拼起来**：`<input type="password">` 会把已保存的 key 显示成圆点，但实际 value 还在。点击输入框时光标落在某个位置，**粘贴新 key 不会自动替换旧值，而是插在光标位置**——结果保存进去的是旧 key + 新 key 拼成的字符串。送到上游后鉴权失败，但错误里 last-4 显示的还是**旧** key 的最后 4 位，让用户根本想不到这是粘贴行为造成的拼接

  全链路最佳实践修复（API Key / Base URL / 自定义 model id 三个输入框一起改）：
  - `onFocus`：聚焦时 `e.currentTarget.select()` 选中已有内容，下一个粘贴/键入直接替换
  - `onChange`：每次输入 `.trim()` 清掉粘贴可能带回的换行 / 空白（很多控制台和文档的复制操作会带尾部不可见字符，自身就是 401 高频源头）
  - `useAIStore` IPC 边界也加 `.trim()` 做 defense-in-depth，未来其它路径塞进来的脏 key 也会被清掉

### 用户操作建议
- 升级到 v1.3.4 之后，重新打开 **AI Settings → API Key 输入框**，点一下，全选会自动发生，再粘贴新 key 就会**整段替换**，保存成功

## [1.3.3] - 2026-04-27

紧跟 v1.3.2 的二次紧急修复——v1.3.2 装上之后启动还是直接挂在主进程。

### 修复
- **node-pty native package 路径在 packaged build 里失效**：opencode 启动时通过 `electron/main/vendor/opencode-node-pty.ts` 加载平台专用的 `@lydell/node-pty-${platform}-${arch}` native binding。原本路径走 `path.resolve(process.cwd(), 'thirdparty/opencode/node_modules/.bun/...')`——dev 模式从项目根能找到，packaged 模式 `process.cwd()` 是 `/`（macOS .app 启动 cwd 默认就是这个），结果路径解析成 `/thirdparty/...`，binary 不存在，主进程未捕获异常直接退出，启动报错 `Failed to load opencode node-pty package from /thirdparty/...`

  修法分三层：
  - **Vendor 切换分发模式**：`app.isPackaged ? process.resourcesPath/opencode-node-pty/... : <dev-fallback>`
  - **新增 staging 流程**：`scripts/stage_native_modules.mjs`（`npm run stage:native`）在 build 之前把需要的 `@lydell/node-pty-*` 从 dev-only 的 `thirdparty/opencode/...` 拷到 `release-staging/native/`。`electron-builder.yml` 只引用 staging 目录，**production build 配置完全不再触碰 thirdparty/**，dev 工具树跟 release config 解耦
  - **macOS 多 arch 自动补齐**：bun 在 arm64 runner 上只装了 darwin-arm64，但 builder 同时打 arm64 + x64 dmg。staging 脚本检测到这种情况后从 npm registry 拉同版本的 darwin-x64 补到 staging 目录

### 内部
- 新增 `npm run stage:native`，CI 在 `npm run opencode:bundle` 后调用一次
- `release-staging/` 加进 `.gitignore`

### 影响范围
- v1.3.2 装机用户启动直接挂，必须手动升 v1.3.3
- v1.3.2 是 v1.2.0 起第一个真的把 opencode bundle 打进二进制的版本，所以这个 bug 之前一直被 stub 掩盖（stub 不需要 node-pty，从来没走到这个加载路径）

## [1.3.2] - 2026-04-27

紧急修复——v1.2.0 起的所有发布版本 AI 聊天**实际上都不工作**。

### 修复
- **AI 聊天 server 终于真正打包进二进制**：自 v1.2.0（commit `7f93784`，2026-04-25）起，release workflow 出于"让 build 不挂掉"的目的临时塞了一个 stub 替换 `thirdparty/opencode/packages/opencode/dist/node/node.js`，结果每次发版打包的都是占位符——`Server.listen()` 返回的是个伪造的 `http://localhost:0`，health-check 永远失败，renderer 端轮询不到 server 凭证，统一报 `"opencode server never reported ready from main process"`。无论配 OpenAI / DeepSeek / Anthropic / OpenAI-compatible 哪个 provider 结果一样（**根本不是 provider 层面的问题**）。

  Release workflow 现在在 CI 里安装 `bun` + 把 opencode 上游 checkout 到 pinned commit `6aa475fcac39cacda4730142314985c64b200bb5` + `bun install` + `npm run opencode:bundle` 生成真正的 ~18MB server bundle，再交给 electron-builder 打包。Stub 步骤删掉。

### 影响范围
- v1.2.0 / v1.2.1 / v1.2.2 / v1.3.0 / v1.3.1 装机用户的 AI 聊天均**不可用**，必须手动升级到 v1.3.2 才能恢复
- 任何依赖 opencode server 的能力（chat、agent run、skill 调用、tool use）都受影响
- 不依赖 opencode 的功能（编辑器、Markdown 渲染、wiki 链接、批注、PDF 阅读、设置面板等）不受此 bug 影响

## [1.3.1] - 2026-04-27

紧跟 v1.3.0 的小修复。

### 改进
- **AI 聊天面板整体提升到 popover 层**：根容器从 `bg-background` 切到 `bg-popover`——浅色模式下是纯白 `#ffffff`，深色模式下是浮起的 popover 灰；视觉上 AI 对话框跟编辑器画布有了一档清晰的高度差，靠近 ChatGPT / Claude 桌面版那种"对话框漂浮在画布之上"的层级
- **聊天输入胶囊也走纯白**：原本是 `bg-muted`（浅色 `#f1f3f5`，跟面板对比偏闷），现在跟面板一致用 `bg-popover`，`#ffffff` 上靠 hairline 边框 + `shadow-elev-1` 形成轻微的"浮起"轮廓

### CI / 发布
- **Release workflow 真正修复 race condition**：v1.2.2 那次修复在 electron-builder 26.x 上失效——pre-create 的 published release 不被 electron-builder 当成上传目标，三个矩阵 runner 仍并发 `POST /releases` 撞 `422 already_exists`（v1.3.0 第一次发版就栽这）。改成 pre-create **draft** + 矩阵用 `--publish never` + 每个 runner 用 `gh release upload` 单独传自己平台的产物（文件名不冲突，并发安全）+ 收尾 job `gh release edit --draft=false` 翻成正式发布
- **`publish-release` 翻发布步骤补 `--repo`**：那个 job 不做 actions/checkout，没有 `.git` 让 `gh` 自动推断 repo，必须显式指定才能完成

## [1.3.0] - 2026-04-27

本次更新核心是**用 PRODUCT.md / DESIGN.md 把全应用 chrome 收敛到一套苹果 / OpenAI 风格的设计系统**——所有滚动条、所有下拉菜单、所有阴影、所有 list row 走同一套 token 与节奏。同时清理了一个一直没真正实现的"PDF 元素识别"功能（+23 / −1303 行）。

### 改进
- **滚动条全局统一为 auto-hide**：滚动时淡入、停顿 720ms 后淡出。原本只有侧栏文件树和编辑器走这套规则，现在全 app 包括聊天面板、Diff、概览仪表盘、图片管理、插件面板等任何 `overflow-auto` 容器都自动接管。靠一个文档级捕获阶段的 scroll 监听器统一加 `is-scroll-active` class，零组件改动
- **List row 按 Apple/OpenAI 排版规范重做**：title 从 14px medium 降到 13px regular，selected 时升到 medium——把字重当作选中信号；删除左侧 accent bar；新增 `density="compact"` 变体（`px-2.5 py-1.5`、14px 图标）；把模型 / 模式 / effort、+ 菜单、@ 提及、/ skill、SelectionToolbar Ask、Sidebar workspace、通用 Select 全部切到 compact
- **ChatInput 三个手写下拉迁到 Popover + Row**：@ 提及、/ skill、文件选择器原本是绝对定位 div + 手写外点击，现在走统一的 Popover——portal、spring 动效、focus return、viewport clamp 全部到位。slash 命令的 hover edit/delete 按钮、skill badge、底部"创建命令"footer 全部保留
- **TabBar 右键菜单迁到 Popover**：用 1×1 虚拟 anchor 锚到点击坐标，复用所有 popover 行为；之前的占位 `animate-pop-in` class 实际不存在，改完才有了真正的入场动画
- **Tooltip viewport clamp**：`AutoTooltipHost` 现在测量实际宽度，把 x 限制在 `[8, vw-8]`，靠右下的发送按钮、最左 ribbon icon 的 tooltip 不再溢出窗口
- **Tooltip 自动抑制带可见 label 的按钮**：用 `\p{L}` 检测可见文字（含 CJK / Cyrillic / Greek）；"Send" 按钮旁边的 tooltip 不再重复读一遍可见文字。两个显式 override：`data-tooltip-force="true"` 强制显示、`data-tooltip-suppress="true"` 强制隐藏
- **聊天 chip 菜单改为点击触发**：模型 / 模式 / effort 三个 chip 不再有 hover-intent 的延迟开合，点击切换更明确
- **全局 chrome 按 DESIGN.md token 收敛**：删除 14 处装饰性 `backdrop-blur`（"glass" 效果在产品 UI 里被禁），22 处 `shadow-md/lg/xl/2xl/sm` 全部映射到 `shadow-elev-1/2/3`；半透明背景配套换成 solid `bg-popover`，modal 暗层保留 `bg-black/30`；调试浮层和图片管理 toast 顺手把硬编码颜色（`bg-orange-500`、`bg-emerald-500`）换成语义 token

### 移除
- **PDF "元素识别模式" 整体移除**：这个功能从来没真正实现——所谓的 PP-Structure / Cloud API / DeepSeek OCR 三个后端全是 stub，只有一个 mock 数据后端在跑；前端却带着完整脚手架（toggle 按钮、ElementPanel、InteractiveLayer、useElementSelection、usePDFStructure、parser、types、store 字段、4 份 i18n 命名空间）。一次性删除 8 个文件、瘦身 5 个文件、清理 4 份 locale 中的 8 个键

### 文档
- 新增 `PRODUCT.md` / `DESIGN.md`（Stitch DESIGN.md 格式）：把 register 锁成 product、Inter 13px regular、无显示字体、no-brand-color、no-accent-bar、Apple/OpenAI 克制等约束固化下来
- README、用户指南、插件生态文档、外观插件指南全面校准——剔除 Tauri / RAG / MCP / Database views 等已经不存在的特性

### 内部
- 全局滚动条由新加的 `src/lib/scrollFadeGlobal.ts` 单一文档级监听器驱动；per-component 的 `useScrollFade` 仍兼容但已成冗余

## [1.2.2] - 2026-04-27

包含原本 v1.2.1 的内容 + 一项发布流程修复。v1.2.1 的 release 因 Windows / macOS / Linux 三个 runner 并发 `POST /releases` 撞到 422（`tag_name already_exists`），最终只有 Mac / Linux 安装包上传成功，Windows 缺失，那个 release 已回收。

### 修复
- **左侧 Ribbon 不再被横线切断**：`MacLeftPaneTopBar` 的 `border-b` 原本横跨整行宽度，会在 ribbon 列正上方画出横线，把"应贯通的竖向 chrome"切成两段。这条线现在只画在右侧的文件树工具区下方，traffic light 头部与 Ribbon 视觉合成连续竖条
- **Release workflow 不再有 race condition**：在 build 矩阵之前增加一步 `create-release`，由单独的 ubuntu runner 用 `gh release create` 先把 GitHub Release 建好；三个平台再并行用 `electron-builder --publish always` 把产物上传到这个已存在的 release，避免再撞 `tag_name already_exists`

### 内部
- 校正 `globals.test.ts` 里 dark-mode token 断言，匹配 v1.1.0 后已落地的 5–6% 饱和度调色板（CI 之前一直在这个用例上红）

## [1.2.0] - 2026-04-27

本次更新主线是**收敛与打磨**：把维护停滞的发布功能、个人主页、半成品的斜杠菜单和重叠工具栏的打字机/聚焦模式从产品里清出去，统一了所有原生下拉的视觉语言，让常用交互（拖文件入侧栏、悬停预览 wiki 链接、命令面板的发现层）更顺手。深色模式按 Apple 的层级思路做了一次系统性重做。

### 破坏性变更
- **发布功能整体下线**：`services/publish/`、Cloud Publish、PublishSettingsSection 全量移除。配套的"个人主页"功能（useProfileStore / ProfileSettingsSection / ProfilePreview tab / 命令面板的"打开 Profile 预览"项）随之删除——它们的唯一用途是为发布站点提供数据
- **打字机模式 + 聚焦模式移除**：与现有工具栏布局冲突且实际生效逻辑不稳定，整体回退（首次发布于 v1.1 之后的开发分支，不影响 1.1.0 用户）
- **主题描述字段移除**：`Theme.description` 与每个官方主题"温暖的米黄色"那种说明文案不再存在；主题卡片只保留色块 + 名字。自定义主题编辑器同步去掉描述输入框
- **主题国际化收敛**：`settingsModal.themes.*` 与顶层 `themes.*` 两个本地化命名空间删除，主题名直接来自 `themes.ts`（约定保持英文规范名）
- 设置页签从 6 个收敛到 5 个：`Publish` 标签整体移除

### 新功能
- **文件拖入文件树即可导入**：从 Finder/Explorer 拖文件落到左侧文件树会被复制进 vault；落在文件夹行上时进入该文件夹，落在空白处则进 vault 根；重名自动加 `(1)` `(2)` 后缀避免覆盖
- **Wiki 链接悬停预览**：`[[wiki-link]]` 鼠标悬停弹出真实渲染的笔记预览卡（跳过前导标题），覆盖编辑器、阅读模式、文件树、图谱等所有出现 wiki 链接的场景
- **图谱节点悬停预览**：图谱中的节点也走同一套 hover-preview 系统，预览渲染后的笔记内容
- **行内"Ask AI"选区弹层**：在编辑器选中文字后弹出快捷操作，直接把选区送进 Chat
- **空 Cmd+P 变成探索面板**：未输入查询时，命令面板渲染 Discover / Recent 分区，并配合 Ribbon 的命令面板按钮显示"未发现"脉冲提示
- **Tab 真正可拖拽重排** + 关闭按钮反馈、固定 Tab 缩放进入、脏标小圆点脉冲（基于 framer-motion Reorder）
- **保存状态指示器**：编辑器顶部的指示器从文字改成图标驱动
- **欢迎页非 AI 能力提示**：在建议下方提示非 AI 路径上的能力入口

### 改进
- **统一所有原生 `<select>` 视觉**：新增 `components/ui/Select` primitive（基于现有 Popover + Row），并把设置-默认编辑模式 / 语言 / 云端工作区、图片管理器三个过滤、PDF 工具栏缩放、主题编辑器基础主题、AI 设置 Provider+Model 全部迁过去；`AISettingsModal` 中本地实现的 Select 也合并到共享 primitive
- **深色模式按 Apple 风格重做**：建立 canvas/panel/popover 三档抬升层级，添加内层 1px 顶部高光、收紧饱和度（14–18 → 5–6）以走"内容优先"的中性色路线
- **Floating element 阶层规则统一**：popover 与 dialog 的不透明度、阴影、边框策略统一，避免叠层透出
- **Sidebar 与 canvas 同色**：去掉跨区色调拼接，让左栏与编辑区视觉连贯
- **Tab 切换走交叉淡入**：reading ↔ editor 模式切换不再硬切
- **侧栏文件夹展开走高度 morph + 箭头旋转**
- **"系统"页签里的 Diagnostics 分级**：诊断日志开关 + 导出（用户上报 bug 用得到）保持可见；编辑器交互 trace 录制 / 清除 / 导出仅在 DEV 构建中显示
- **主题面板**：当用户没有自定义主题时，"Official Themes"小标题不再渲染（单组列表不需要分组标题）
- 设置面板锁定 `h-[80vh]`，切换 tab 不再让面板高度抖动
- ChatInput 输入条移到 muted 表面，跟 popover 区分

### 修复
- **斜杠菜单默认关闭**：菜单滚动时不跟随光标位置，加上几条 AI 命令实际价值有限——整套功能用 `useUIStore.slashCommandsEnabled` flag 默认关掉；实现保留在树里，问题修好后翻一个 flag 即可恢复
- **拖动光标状态统一**：blocks / tabs / files 三种拖动场景的光标视觉对齐
- **设置面板高度抖动修复**（同上 `h-[80vh]`）

### 内部
- 编辑器交互 trace 仅 DEV 显示
- 主题数据/类型/校验/创建模板的 description 字段一并清理
- 命令面板的 "publish-site" / "profile-preview" 命令移除


本次更新是一次跨度较大的方向性演进：产品从综合笔记工具收敛为以「LLM Wiki + Agent 工作流」为核心的知识库桌面应用，桌面容器从 Tauri 切换到 Electron，Agent 侧引入了分层的长期记忆管线，并对欢迎页、TabBar、侧边栏、ChatInput、设置面板等核心 UI 做了系统性重设计。由于移除了相当多的既有模块，请在升级前阅读「破坏性变更」。

### 破坏性变更
- 产品定位调整为 LLM Wiki 知识库：移除数据库视图、看板、日历、抽认卡、任务、团队协同编辑、深度研究、RAG 检索、Codex 等功能模块以及相关 store、服务与路由
- AI 交互模型收敛为 Agent-only：移除 Chat 模式与 Codex 模式、下线 ModeToggle 切换入口，Agent 面板成为统一入口
- 侧边栏与 Ribbon 精简：移除已废弃模块的入口、插件中对上述模块的引用，以及 RAG 状态栏
- 深度研究（Deep Research）流程及其 orchestration stage / PlanCard 已全量移除
- 应用更名 Neurone → Lumina Note，调整窗口标题与相关品牌字串

### 新功能
- **Electron 迁移完成**：完整切换到 Electron 打包脚手架、preload 桥、工作区相关 IPC 通道与更新检查管线，并落地多平台发布产物（mac arm64/x64、win x64、linux x64）
- **欢迎页全面重写**：双栏布局 + Recent Vaults + 内联创建 Vault 流程；新增 `RecentVaultStore` 本地持久化；Documents 默认目录与缺失时回退到 home；动态时段问候 + 工作区上下文文案；与主窗口一致的自定义 traffic lights/window controls
- **编辑器 TabBar 浏览器化**：标签从底部"探出"到 ribbon 中、保留底部指示条；新增"+ 新建 Tab"按钮；标签关闭走宽度坍缩 + 渐隐动画；空闲时滚动条淡出；Tab 形态采用 Chrome 风格剪影并修正圆角接缝；编辑器 toolbar 与 TabBar 合并
- **macOS 自定义窗口控件**：替换原生 traffic lights，统一 ribbon 表面与位置；WelcomeScreen 也接入自定义控件
- **侧边栏 Vault 名 Popover**：在侧边栏直接发起 Rename / Switch Workspace；Vault 进入时左栏自动展开、右栏折叠；侧边栏动作按钮上移到 Mac 顶栏；ribbon 表面着色与分隔线统一
- **AutoTooltipHost 全量替换 native title**：自定义品牌化 tooltip，支持 hover/focus/escape/delegate；窗口控件、Tab 关闭按钮、ChatInput 内文案完成本地化
- **LLM 提供商扩展**：新增/提升 GPT-5.5 系列（接入 thinking config）、DeepSeek V4（reasoning-effort 轴）、Zhipu GLM、Xiaomi MiMo、Moonshot、K2.6；统一 `ModelMeta` 表达每模型约束（none/max effort、固定温度模型 lock、DeepSeek `extra_body` 等）
- **分层持久记忆管线**：Session → Durable → Layered 分层记忆，支持按用途选择性加载、手动编辑 API，以及 Memory Wiki 站点入口
- **编排式 Agent 框架**：引入多 Agent 工作流与状态编排骨架，Agent 面板支持记忆治理与审计
- 全局按钮补齐 tooltip，并新增 `audit:button-tooltips` 审计脚本
- 大纲视图条目现可直接跳转到对应 Markdown 标题

### 改进
- **设置页全面重写**：改为 Tab 布局，抽取 General / System / AI / WebDAV / Diagnostics / MobileGateway 等独立 Section，统一头部样式并去除外层边框
- **AI Settings 弹层化**：模型/模式/effort 拆为独立 chip + popover，原生 `<select>` 替换为 Popover 自定义下拉；popover 与 dialog 改为不透明实体感；Popover z-index 抬到 Dialog 之上
- **输入框重设计（ChatInput）**：圆角矩形锁形、多行时自动两行布局并把发送按钮固定在右下；`+` 菜单与 chip 下拉走 hover-with-delay；Spotify 风格 chip 抬升 + popover 锚定；Codex 风格 model+effort picker 替换原 ThinkingMode 切换
- **设置项国际化**：WebDAVSettings、DiagnosticsSection、MobileGateway 状态、GeneralSection 标题等完成 zh-CN / zh-TW / en / ja 四语适配；颜色组切换 tooltip、ChatInput 中文硬编码、X 关闭按钮 a11y label 等补齐
- **桌面体验**：全局禁用 UI 文本选择高亮，更贴近原生应用观感；消息气泡与 Chat Shell 视觉打磨；非编辑器区域字号统一为 3 档刻度
- **文件系统健壮性**：`listDirRecursive` 增加过滤与错误处理，chokidar watcher 增加 ignore 规则和异常兜底，Vault 路径预检查 + EMFILE 降级
- **全局搜索**：从模态框迁移到左侧栏 mode；搜索 Ribbon active 状态在 hover 时保持可见

### 修复
- 修复 `useSkillSearch` 对空 skills 数组未防御导致的崩溃
- 修复更新检查首次失败后缺乏重试的问题
- 清理 LLM Wiki 转型后残留的大量无效导入（team、codex、PlanCard、orchestration、RAG 等）
- 临时隐藏 VoiceInputBall 浮球，避免遮挡主界面操作
- 修复 Electron 下 preload shim 未正确加载导致的 Tauri 桥不可用问题
- 修复工作区创建/切换流程所需的 Electron IPC handler 缺失
- 编辑器：阅读模式文本列与 live/source 的 42rem 几何对齐；标题行高与 leading margin 跨模式一致；加粗字重、行内代码 chip、链接 underline-offset 跨模式统一；模式切换时为滚动条预留 gutter 避免内容跳动；空文档 placeholder 推开光标避免重叠
- 编辑器：切换文件时不再出现一闪的 loading；resize handle wrapper 宽度收紧使滚动条贴右边缘；preview tab 用稳定 key 避免双 tab 闪烁；非显式关闭时直接移除标签不走动画
- TabBar：active 标签描边改用 foreground alpha；底边裁掉、与 ribbon 接缝平滑；关闭按钮固定右沿；Tab 内容置中以避免 hover rect 露出；Tab shrink 行为参照浏览器
- 设置：Toggle 旋钮位置使用 Tailwind 任意值修正
- 修复主窗口设置弹层导致下拉无法弹出的 z-index 顺序问题
- WelcomeScreen i18n 按钮文案 + 移除多余 hover 动画

### 依赖与构建
- 桌面容器全面切换到 Electron：用已发布的 `codemirror-live-markdown` 包，修复 electron 打包产物忽略规则
- macOS 改为按架构发布（arm64 + x64 双 DMG/zip），避开 universal 打包对原生模块的限制
- 移除已废弃前端模块和本地 assistant 会话残留；强化 typecheck 通行；忽略 `.hydra/` 工作台产物
- Cargo：升级 `rustls-webpki` 至 0.103.12；修复 src-tauri 依赖解析问题；src-tauri 与 server 统一通过 `cargo fmt` / CI `rustfmt` 校验
- CI：修复 Windows runner 上 bash heredoc 解析失败的问题（显式 `shell: bash`）

### 测试
- 同步 SettingsModal Tab 化后的测试断言
- 修复 WebDAVSettings 本地化后仍使用英文字面量查询的单测回归
- AIStore 测试补充 `buildConfigOverrideForPurpose` mock 并稳定化 apiKey
- 新增 AutoTooltipHost hover/focus/escape/delegate 行为测试

## [1.0.17] - 2026-03-17

### 新功能
- 团队协同编辑进一步完善：共享文档连接更稳定，远端光标与在线状态同步更完整，协作会话在重连和房间切换时更可靠
- 团队通知升级为实时推送：通知入口优先使用 WebSocket 实时刷新，仅在连接中断时回退到轮询

### 改进
- 登录与认证保护增强：认证接口新增更稳的按 IP 限流与代理识别策略，异常流量会更早被拦截
- 流式输出细节优化：生成中的省略点改为贴在文本末尾显示，阅读时不再单独占一行

### 修复
- 修复数据库表格、看板、日历视图在切换视图或筛选条件后不同步的问题
- 修复筛选视图中新建数据库记录后容易立刻消失的问题，新记录现在会尽量保持在当前视图中可见
- 修复数据库笔记 `noteId` 缺失或重复时可能导致的记录映射不稳定问题
- 修复认证密码最小长度与前后端校验不一致的问题，统一为 8 位

## [1.0.16] - 2026-03-15

### 安全
- 认证 token 从 localStorage 迁移到 OS Keychain（macOS Keychain / Windows Credential Manager）
- 移除 QR 配对界面中的 token 明文显示
- 密码最低长度从 6 位提升到 8 位，新增邮箱格式校验

### 改进
- 编辑器 live 模式选区拖拽不再抖动，采用零布局偏移的格式标记隐藏技术
- 消除双重选区渲染系统和自定义拖拽同步，回归 CodeMirror 原生选区处理
- 编辑器 DOM 结构扁平化，cm-scroller 作为唯一滚动容器
- 登录入口从侧边栏移至 Ribbon 底部图标，已登录时显示账户弹窗
- Quick Action 卡片根据工作区笔记动态推荐，基于访问频率和修改时间评分

### 修复
- 修复 callout 在选区经过时不必要切换到源码模式导致的选区残留
- 修复 cm-content padding 区域的原生 ::selection 残留
- 修复 PublishSettingsSection 缺少 email/password 参数的编译错误

## [1.0.14] - 2026-03-13

### 改进
- 全局统一结构性边框透明度为 border-border/60，消除视觉不一致
- 编辑器三态切换简化为单按钮循环（实时→阅读→源码）
- 侧边栏拖拽分隔线改为靠近光标渐显的辉光动效，提升交互提示
- macOS traffic lights 改用原生 NSNotificationCenter 同步重定位，消除缩放闪烁

## [1.0.13] - 2026-03-13

### 新增
- macOS traffic lights 动态垂直居中，支持窗口缩放和主题切换时自动重新定位

### 改进
- 侧边栏顶部菜单重构为直接操作按钮，减少交互层级
- 统一分隔线边框归属约定（container ownership），消除视觉不一致
- 移除侧边栏 AI 助手按钮
- 移除 MacLeftPaneTopBar 右边框和内阴影

## [1.0.12] - 2026-03-13

### 修复
- 修复左右分栏拖拽分隔线视觉不连续、可见性偏弱的问题，提升窗口分栏调整时的识别度
- 修复 macOS 窗口缩放时自定义 traffic lights 重定位引发的抖动问题
- 修复部分无障碍细节问题：为纯图标按钮补充可访问名称、为点击型链接文本补充键盘可达性、为模态遮罩补充无障碍隐藏标记
- 修复 ChatInput 控制台中硬编码中文告警信息，统一为可国际化文案

### 改进
- 移除调试用 `console.log` 输出，减少无意义控制台噪音
- 微调全局界面暖色强调色，统一部分界面细节表现

## [1.0.11] - 2026-03-11

### 改进
- CI/Release 构建效率优化：Release 3 个平台并行构建，添加 Rust 和 npm 依赖缓存

## [1.0.10] - 2026-03-11

### 修复
- 模式切换现在只保留阅读视口，不再跨模式保留旧光标和选区状态，减少 reading 与 live/source 切换后异常大范围选中的问题
- 模式切换时会清理编辑器 DOM 选区和焦点，降低 Tauri WebKit 下旧锚点残留导致的单击跳选风险

## [1.0.8] - 2026-03-10

### 修复
- 修复 reading 模式下代码块使用 replace widget 导致正文无法像普通文本一样参与拖拽选中、跨块连续选中与全选的问题
- reading 模式中的代码块现在保留真实文本选择语义，复制与 Cmd/Ctrl + A 会包含代码块内容


## [1.0.7] - 2026-03-10

### 新功能
- 左侧文件树现在支持直接点击工作区根目录框选中根目录
- 工作区根目录现在支持与文件树项一致的重命名入口，可通过右键菜单或已选中后的 `Enter` / `F2` 触发

### 修复
- 修复工作区根目录双击时会误选中文字的问题

## [1.0.6] - 2026-03-10

### 修复
- 修复某些交互后浏览器子 WebView 残留覆盖左侧区域，导致文件树宽度拖拽光标与拖拽行为失效的问题
- 修复 macOS 顶部栏冗余快捷按钮，简化 traffic lights 周边控件布局
- 修复左侧文件树滚动条常驻显示的问题，改为滚动时淡入、静止后淡出
- 修复 Linux `src-tauri` CI 因 `macos-private-api` 特性作用域错误而失败的问题

## [1.0.5] - 2026-03-10

### 修复
- 修复 macOS 左侧文件树折叠后 Ribbon 顶部分割线贯穿安全区的问题
- 修复 macOS 左侧文件树折叠后 Ribbon 顶部缺少与 traffic lights 区域的横向分隔线问题
- 修复 macOS 左侧文件树折叠后 TabBar 与原生 traffic lights 按钮发生重叠的问题，为按钮保留安全留白

## [1.0.4] - 2026-03-09

### 修复
- 修复 Codex 在开发环境下优先命中不兼容 PATH Node 时仍反复下载运行时的问题，已优先复用本地兼容 runtime
- 修复 Codex host 启动和侧栏注册超时的用户提示，避免直接暴露内部错误信息
- 修复严格 CSP 下 Codex webview bridge 的脚本注入与网络连接放行问题

## [1.0.3] - 2026-03-08

### 新功能
- 软件更新流程迁移到独立更新窗口，并在 Ribbon 增加轻量更新入口

### 修复
- 修复更新器终态遥测残留导致的旧状态误显示问题
- 修复设置弹窗与更新弹窗切换时浏览器 WebView 显隐竞争问题

## [1.0.2] - 2026-03-07

### 修复
- live 模式下代码块现在保持高亮外观且可直接编辑，不再依赖模式切换才能进入可编辑状态
- live 模式代码块恢复复制按钮，并优化相邻代码块之间单空行的光标可见性

## [1.0.1] - 2026-03-06

### 修复
- 修复网络映射盘与 UNC 网络路径工作区在重启应用后无法重新打开的问题，启动恢复时会先同步运行时文件系统访问根目录

## [1.0.0] - 2026-03-05

### 新功能
- 更新器新增可恢复下载与断点续传能力，支持安装过程遥测与状态恢复

### 修复
- 修复“取消更新后仍可能继续安装”的竞态问题，安装前会再次校验取消状态

### 改进
- 不可取消阶段返回机器可读错误码（`UPDATE_CANCEL_NOT_ALLOWED`），便于前端精确提示

## [0.5.24] - 2026-03-05

### 修复
- 编辑器拖拽选区抖动优化，减少拖拽过程中的装饰重建与动画干扰
- 桌面端（Tauri WebKit）规避异常选区渲染导致的整屏蓝色选区问题

## [0.5.23] - 2026-03-03

### 改进
- 统一侧边栏「今日速记」与「语音笔记」按钮样式

## [0.5.22] - 2026-03-02

### 修复
- 侧边栏快速笔记/语音笔记按钮文字现在正常显示
- 收藏夹标题不再换行
- AI 欢迎语不再换行
- AI 输入框 placeholder 不再换行

## [0.5.21] - 2026-03-02

### 新功能
- 设置中新增编辑器字体大小调节（10-32px 滑块 + 实时预览）

### 修复
- 代码块字体现在跟随编辑器字体设置（-2px 偏移）

## [0.5.20] - 2026-03-02

### 新功能
- 启动时自动检查更新（延迟 5 秒，24 小时冷却）
- 支持跳过指定版本更新
- 更新日志现在从 CHANGELOG.md 读取并展示

### 改进
- 重构 UpdateChecker 组件使用 zustand store 管理状态
- 发布流程新增 changelog 检查，CI 自动拦截缺少日志的发布

## [0.5.19] - 2025-XX-XX

- Initial tracked release
