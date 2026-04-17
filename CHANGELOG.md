# Changelog

All notable changes to Lumina Note will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-04-17

本次更新是一次跨度较大的方向性演进：产品从综合笔记工具收敛为以「LLM Wiki + Agent 工作流」为核心的知识库桌面应用，桌面容器开始从 Tauri 扩展到 Electron，Agent 侧引入了分层的长期记忆管线。由于移除了相当多的既有模块，请在升级前阅读「破坏性变更」。

### 破坏性变更
- 产品定位调整为 LLM Wiki 知识库：移除数据库视图、看板、日历、抽认卡、任务、团队协同编辑、深度研究、RAG 检索、Codex 等功能模块以及相关 store、服务与路由
- AI 交互模型收敛为 Agent-only：移除 Chat 模式与 Codex 模式、下线 ModeToggle 切换入口，Agent 面板成为统一入口
- 侧边栏与 Ribbon 精简：移除已废弃模块的入口、插件中对上述模块的引用，以及 RAG 状态栏
- 深度研究（Deep Research）流程及其 orchestration stage / PlanCard 已全量移除

### 新功能
- **Electron 迁移 Phase 1**：引入 Electron 打包脚手架、preload 桥、工作区相关 IPC 通道与更新检查管线，为后续跨平台发布打基础（Tauri 链路保持可用）
- **分层持久记忆管线**：Session → Durable → Layered 分层记忆，支持按用途选择性加载、手动编辑 API，以及 Memory Wiki 站点入口
- **编排式 Agent 框架**：引入多 Agent 工作流与状态编排骨架，Agent 面板支持记忆治理与审计
- 大纲视图条目现可直接跳转到对应 Markdown 标题
- 全局按钮补齐 tooltip，并新增 `audit:button-tooltips` 审计脚本

### 改进
- **设置页全面重写**：改为 Tab 布局，抽取 General / System / AI / WebDAV / Diagnostics / MobileGateway 等独立 Section，统一头部样式并去除外层边框
- **设置项国际化**：WebDAVSettings、DiagnosticsSection、MobileGateway 状态、GeneralSection 标题等完成 zh-CN / zh-TW / en / ja 四语适配
- **输入框重设计**：聊天输入框改为 ChatGPT 风格胶囊样式，`+` 菜单聚合附件/工具入口；减轻阴影强度、隐藏默认滚动条、支持多行自适应高度
- **欢迎页布局**：问候文案置顶、输入区垂直居中，全屏模式下间距调整为 1:2；移除冗余副标题
- **桌面体验**：全局禁用 UI 文本选择高亮，更贴近原生应用观感；消息气泡与 Chat Shell 视觉打磨
- **文件系统健壮性**：`listDirRecursive` 增加过滤与错误处理，chokidar watcher 增加 ignore 规则和异常兜底，Vault 路径预检查 + EMFILE 降级

### 修复
- 修复 `useSkillSearch` 对空 skills 数组未防御导致的崩溃
- 修复更新检查首次失败后缺乏重试的问题
- 清理 LLM Wiki 转型后残留的大量无效导入（team、codex、PlanCard、orchestration、RAG 等）
- 临时隐藏 VoiceInputBall 浮球，避免遮挡主界面操作
- 修复 Electron 下 preload shim 未正确加载导致的 Tauri 桥不可用问题
- 修复工作区创建/切换流程所需的 Electron IPC handler 缺失

### 依赖与构建
- Cargo：升级 `rustls-webpki` 至 0.103.12；修复 src-tauri 依赖解析问题；src-tauri 与 server 统一通过 `cargo fmt` / CI `rustfmt` 校验
- 前端工具链：对齐 Electron 与 Vite 版本，使用已发布的 `codemirror-live-markdown` 包；修复 electron 打包产物忽略规则

### 测试
- 同步 SettingsModal Tab 化后的测试断言
- 修复 WebDAVSettings 本地化后仍使用英文字面量查询的单测回归
- AIStore 测试补充 `buildConfigOverrideForPurpose` mock 并稳定化 apiKey

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
