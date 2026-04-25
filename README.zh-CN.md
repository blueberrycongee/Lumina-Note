<div align="center">

<img src="build-resources/icon.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**本地优先的 AI 笔记应用**

你的笔记默认保留在设备本地。Lumina Note 用 AI 帮你写作、连接、检索和整理知识，同时把数据控制权留在你手里。

[![GitHub Release](https://img.shields.io/github/v/release/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/releases)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square)](LICENSE)
[![Tauri](https://img.shields.io/badge/Electron-41-47848F?style=flat-square&logo=electron&logoColor=white)](https://tauri.app/)

[![CI](https://img.shields.io/github/actions/workflow/status/blueberrycongee/Lumina-Note/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/blueberrycongee/Lumina-Note/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/github/actions/workflow/status/blueberrycongee/Lumina-Note/security-audit.yml?branch=main&style=flat-square&label=Security%20Audit)](https://github.com/blueberrycongee/Lumina-Note/actions/workflows/security-audit.yml)
[![Downloads](https://img.shields.io/github/downloads/blueberrycongee/Lumina-Note/total?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/releases)
[![Last Commit](https://img.shields.io/github/last-commit/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/commits/main)
[![GitHub Stars](https://img.shields.io/github/stars/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/stargazers)
[![Commit Activity](https://img.shields.io/github/commit-activity/m/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/commits/main)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey?style=flat-square)

**语言**： [English](./README.md) · 简体中文 · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Italiano](./README.it.md) · [Português (Brasil)](./README.pt-BR.md) · [Русский](./README.ru.md)

</div>

---

<h2 align="center">为什么选择 Lumina Note</h2>

- **本地优先**：你的笔记库保留在本地，是否发送给模型服务商由你决定。
- **围绕知识工作流设计**：Markdown 编辑、双链、图谱和 AI 检索是一个整体。
- **AI 不只是聊天**：`Agent` 支持真实编辑、规划与自动化任务。

---

<h2 align="center">下载</h2>

<div align="center">

前往 [Releases](https://github.com/blueberrycongee/Lumina-Note/releases) 获取最新版：

| 平台 | 安装包 |
|------|--------|
| Windows | `.msi` / `.exe` |
| macOS (Intel) | `x64.dmg` |
| macOS (Apple Silicon) | `aarch64.dmg` |

</div>

---

<h2 align="center">界面预览</h2>

<p align="center">
  <img src="docs/screenshots/ai-agent.png" alt="AI Agent" width="800" />
</p>

<p align="center">
  <img src="docs/screenshots/knowledge-graph.png" alt="知识图谱" width="800" />
</p>

<p align="center">
  <img src="docs/screenshots/editor-latex.png" alt="编辑器" width="800" />
</p>

---

<h2 align="center">功能概览</h2>

<h3 align="center">AI 工作区</h3>

- Agent 模式：支持编辑、规划与任务自动化
- 支持多模型服务商：OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- 主模型可自由配置
- 复杂任务会进入编排式 Agent 运行时，简单任务保持轻量快速路径
- 基于本地笔记库的语义检索（RAG）

<h3 align="center">编辑器与知识图谱</h3>

- Markdown 源码 / 实时预览 / 阅读模式
- `[[WikiLinks]]` 双向链接
- LaTeX、Mermaid、代码高亮
- 图谱可视化笔记之间的关系

<h3 align="center">阅读与采集</h3>

- 内置 PDF 阅读器，支持高亮、下划线和批注
- 批注结果可保存为 Markdown
- 选中内容可直接发送到 AI 上下文

<h3 align="center">扩展能力</h3>

- Bilibili 视频笔记，支持弹幕时间戳同步
- 实时语音输入
- 数据库视图（表格 / 看板）
- WebDAV 同步
- 闪卡复习
- 15 套主题

<h3 align="center">插件生态（开发者预览）</h3>

- 从 workspace / user / built-in 目录加载插件
- 插件能力的运行时权限模型
- Slash Command 扩展 API
- 开发文档：`docs/plugin-ecosystem.md`

---

<h2 align="center">快速开始</h2>

1. 从 Releases 安装 Lumina Note。
2. 首次启动时选择一个本地文件夹作为笔记库。
3. 在 AI 面板中配置模型服务商和 API Key，并可在设置中选择偏好模型。
4. 创建第一条笔记，并通过 `[[WikiLinks]]` 建立连接。

---

<h2 align="center">使用指南</h2>

<h3 align="center">推荐先读</h3>

- English: `docs/user-flow.md`
- 简体中文：`docs/user-flow.zh-CN.md`
- 日本語: `docs/user-flow.ja.md`

<h3 align="center">自部署中继（跨网络手机访问）</h3>

- English: `docs/self-host.md`
- 简体中文：`docs/self-host.zh-CN.md`

---

<h2 align="center">从源码构建</h2>

环境要求：

- Node.js 20+（推荐 20.11.1）
- 

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run dev
```

---

<h2 align="center">技术栈</h2>

- 框架：Electron 41（Chromium + Node.js）
- 前端：React 18、TypeScript、Tailwind CSS
- 编辑器：CodeMirror 6
- 状态管理：Zustand
- 向量存储：SQLite

---

<h2 align="center">开源组件</h2>

- 编辑器核心：[codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)

---

<h2 align="center">贡献者</h2>

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

<h2 align="center">许可证</h2>

[Apache License 2.0](LICENSE)

---

<h2 align="center">Star History</h2>

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
