# Lumina 插件生态开放目标与权限策略（对标 Obsidian）

## 1. 目标声明

Lumina 插件生态的目标是：

- 自由度对标 Obsidian：让插件可以深度改造编辑器、界面与工作流，而不是只做轻量扩展。
- 本地优先 + 开源优先：用户明确知情并可控前提下，允许高权限插件能力。
- 先开放能力，再建设分发：短期允许手动复制安装，API 与权限模型一次性设计到位，避免后续重构。
- 兼容常见插件范式：支持模板自动化、数据查询、任务管理、看板、日历、编辑器增强、主题美化等主流插件类型。

## 2. 开放原则（自由度策略）

- 默认可开发、可扩展：不限制插件形态为仅命令类插件。
- 权限可放开，但必须显式声明：插件声明所需能力，用户可见。
- 高自由度不等于无边界：允许高权限，同时要求生命周期、错误隔离、冲突处理。
- API 稳定优先：尽量避免插件反复适配破坏性变更。

## 3. 至少要开放的权限（核心清单）

为对标 Obsidian 常见插件开发，Lumina 至少开放以下权限族：

- `commands:*`
  - 注册命令、命令面板入口、快捷键映射。
- `vault:*`
  - 读写笔记文件、重命名、移动、删除、批量处理。
  - 读取 metadata（frontmatter、链接、标签、块信息）。
- `workspace:*`
  - 访问当前活动视图/文件。
  - 注册自定义视图、面板、标签页。
  - 响应布局与激活变化。
  - 建议细分：`workspace:open`、`workspace:panel`、`workspace:tab`。
- `editor:*`
  - 获取选区与光标。
  - 文本变更（插入、替换）。
  - 注册编辑器扩展（装饰、高亮、快捷操作）。
- `ui:*`
  - 通知、状态栏、Ribbon、设置页。
  - 注入样式和主题变量（含阅读模式装饰）。
- `storage:*`
  - 插件私有持久化存储（配置、缓存、状态）。
- `network:*`
  - 外部 API 请求（同步、AI 服务、日历任务等插件需要）。
- `runtime:*`
  - 定时任务、后台任务、事件订阅、生命周期管理（`onload`/`onunload`）。
- `interop:*`（建议）
  - 打开外部链接、调用系统能力（按平台可用性）。

## 4. 能力开放与插件类型映射（对标 Obsidian 常见插件）

- 模板/自动化类（Templater、QuickAdd）
  - 需要：`commands`、`vault`、`editor`、`runtime`
- 数据查询类（Dataview）
  - 需要：`vault`、`metadata`、`workspace`、`ui`
- 任务管理类（Tasks）
  - 需要：`vault`、`metadata`、`editor`、`workspace`、`commands`
- 看板/日历类（Kanban/Calendar）
  - 需要：`workspace`、`vault`、`ui`、`editor`
- 编辑增强类（Advanced Tables 等）
  - 需要：`editor`、`commands`、`ui`
- 主题与装饰类（主题/CSS/UI 美化）
  - 需要：`ui`、`workspace`、`editor:decorate`
- 同步/服务集成类（Git/第三方服务）
  - 需要：`vault`、`network`、`runtime`、`interop`

## 5. 当前阶段（手动安装）的实施策略

- 安装方式：继续支持复制插件目录到 `<vault>/.lumina/plugins` 或用户目录。
- 生态策略：优先做 API 能力与兼容性治理，不阻塞在商店分发。
- 安全策略：以权限声明与用户可见为基础，不把强沙箱作为首期硬目标。

## 6. 最低落地要求

- Manifest 固化字段：
  - `id`、`name`、`version`、`entry`
  - `min_app_version`、`api_version`
  - `permissions`
  - `enabled_by_default`
  - `is_desktop_only`（可选）
- API 分层：
  - `stable` 与 `experimental`，控制破坏性变更。
- 生命周期约束：
  - 强制支持 `setup -> dispose`。
- 冲突机制：
  - 命令 ID、快捷键、样式命名空间冲突处理。
- 兼容策略：
  - 宿主版本不满足时能识别并禁用不兼容插件。
