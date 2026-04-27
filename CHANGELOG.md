# Changelog

All notable changes to Lumina Note will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
