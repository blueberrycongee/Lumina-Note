# Lumina Note 使用指南（中文）

这份文档分两部分：第一部分是**每个功能在哪里**的功能-入口对照表，第二部分是几条把功能串起来用的工作流。

## 功能在哪里

文中提到的几个固定位置：

- **左侧 Ribbon**：窗口最左边那一列图标。
- **命令面板**：`Ctrl/Cmd + P`。
- **选区工具栏**：在编辑器里选中文字后浮出来的那条小工具栏。

| 你想做的事 | 入口 |
|---|---|
| 打开命令面板 | `Ctrl/Cmd + P`，或 Ribbon 顶部的 ⌘ 图标 |
| 全库搜索 | Ribbon → 放大镜图标（左侧 Sidebar 切到搜索面板） |
| 打开 AI 对话 | Ribbon → Bot 图标 |
| 浏览文件 / 编辑器 | Ribbon → 文件图标 |
| 管理 vault 里的图片 | Ribbon → 图片图标 |
| 打开全局知识图谱 | Ribbon → 网络图标，或命令面板搜 "Show graph" |
| 当前笔记的局部图 | 与知识图谱同一个面板，会根据当前打开的笔记自动切换 |
| 管理插件 | Ribbon → 拼图图标 |
| 打开设置 | Ribbon 底部的齿轮图标 |
| 切换深色 / 浅色 | Ribbon 底部的太阳/月亮图标 |
| 检查应用更新 | Ribbon 底部的下载图标 |
| 选主题 / 编辑自定义主题（15 套官方 + 自定义） | 设置 → General |
| 配置模型与 API Key | 设置 → AI |
| 同步（WebDAV / 自部署云账号 / 移动端 QR 配对） | 设置 → Sync |
| HTTP / SOCKS 代理 | 设置 → Network |
| 直接录音成笔记 | 左侧 Sidebar 快捷区里的麦克风按钮 |
| 标注 PDF | 在文件树点开任意 `.pdf` —— 该 tab 自动切换为内置 PDF 阅读器 |
| 把选中文字交给 AI / 生成 Flashcard | 在编辑器里选中文字 → 浮出的选区工具栏 |
| 悬停预览 `[[WikiLink]]` | 鼠标悬停在任何 wikilink 上（编辑器、阅读模式、文件树、图谱都生效） |
| 自定义 slash 命令 | 在 AI 对话输入框里打 `/` → "管理" |
| 调用 agent skill（workspace / user / built-in） | 命令面板搜 "Open Skill Manager"，或在 AI 输入框里 `/skill` |
| 导出当前对话 | AI 对话上方的工具栏 |
| 配对 iOS / Android 端 | 设置 → Sync → Mobile Gateway → 用移动端扫码 |
| 跨网络访问移动端 | 部署 `server/`（见 `docs/self-host.zh-CN.md`），再在设置 → Sync 登录同一账号 |

## 5 分钟上手

1. 从 [Releases](https://github.com/blueberrycongee/Lumina-Note/releases) 安装并启动应用。
2. 选一个本地文件夹作为 **vault**。
3. 进 **设置 → AI**，添加 API Key（OpenAI / Claude / Gemini / DeepSeek / Moonshot / 智谱 / Groq / OpenRouter / Ollama / 任意 OpenAI 协议兼容端点……），选一个模型。
4. 新建一条笔记，输入 `[[` 启动 wikilink —— 已有笔记会自动补全；按 Enter 没有就直接创建。
5. 打开 **知识图谱**（Ribbon 网络图标），确认两条笔记已经连起来。
6. 打开 **AI 对话**（Bot 图标），问它一个关于刚写的笔记的问题。

这六步都跑通之后，剩下的功能本质上都是这套基础原语（文件 + AI + 图谱 + 同步）的不同 UI 表达。

## 工作流

### A. 日常笔记 → 结构化知识

1. 在每日笔记里随手记，不要先纠结结构。
2. 主题反复出现时用 `[[双链]]` 关联——可以悬停链接预览确认指向对的页。
3. 在 AI 对话里让 agent 帮你抽取待办、拆分段落。它会按你确认的计划直接改文件。
4. 打开知识图谱（Ribbon 网络图标），找"孤立笔记"——那些是你忘了链回去的页。

### B. PDF → 可复用的 Markdown 笔记

1. 把 PDF 拖进 vault，然后在文件树点开。该 tab 自动变成 PDF 阅读器。
2. 高亮、下划线、批注。完成后把批注保存成 Markdown。
3. 在 AI 对话里限定范围（例如"只总结被高亮的段落"）。
4. 补充你的结论和标签，再用 `[[双链]]` 把它编织进知识网络。

### C. Agent 辅助重构

1. **先**圈定操作范围："这个文件"或"`notes/research/` 下所有"。
2. 让 agent 先给计划，再让它执行。Agent runtime 支持先 plan 再 apply。
3. 小步迭代——agent 用与你一样的文件工具写盘，没什么是黑箱。
4. 关键段落要人工复核之后再保存。

### D. 同步到手机

1. **同一 Wi-Fi**：进 **设置 → Sync → Mobile Gateway**，移动端扫码。直连，不需要 relay。
2. **跨网络**：部署 relay server（`docs/self-host.zh-CN.md`），注册账号，桌面（设置 → Sync）和手机端登录同一账号。

## 数据与隐私

- Vault 默认本地存储。除非你主动启用云模型或同步，数据不出本机。
- 云模型只拿到你提示词里写了的内容；agent 不会偷偷扫整个 vault。
- 对敏感数据可以独立开一个 vault，配独立 provider；或者全程用 Ollama 走本地模型。

## 简版 FAQ

### AI 没有回复怎么办？

- 检查 API Key（设置 → AI）。
- 检查 model id 与 provider 是否匹配。
- 检查代理/网络（设置 → Network）。

### README 里写的功能我找不到？

打开命令面板（`Ctrl/Cmd + P`）输几个字。Ribbon 上没出现的功能多半在命令面板里能搜到。

### 应该先学什么？

WikiLinks → AI 对话 → 知识图谱。这三件事顺手之后，其他功能就是快捷入口的事了。
