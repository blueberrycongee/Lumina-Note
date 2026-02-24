<div align="center">

<img src="src-tauri/icons/128x128.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**本地优先的 AI 笔记应用**

笔记数据默认存储在你的设备上。Lumina Note 用 AI 帮你写作、整理、检索与沉淀知识，同时保持数据控制权。

[![GitHub Release](https://img.shields.io/github/v/release/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/releases)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)

[![CI](https://img.shields.io/github/actions/workflow/status/blueberrycongee/Lumina-Note/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/blueberrycongee/Lumina-Note/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/github/actions/workflow/status/blueberrycongee/Lumina-Note/security-audit.yml?branch=main&style=flat-square&label=Security%20Audit)](https://github.com/blueberrycongee/Lumina-Note/actions/workflows/security-audit.yml)
[![Downloads](https://img.shields.io/github/downloads/blueberrycongee/Lumina-Note/total?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/releases)
[![Last Commit](https://img.shields.io/github/last-commit/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/commits/main)
[![GitHub Stars](https://img.shields.io/github/stars/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/stargazers)
[![Commit Activity](https://img.shields.io/github/commit-activity/m/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/commits/main)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey?style=flat-square)

**Language**: [English](./README.md) · 简体中文 · [日本語](./README.ja.md)

</div>

---

<h2 align="center">为什么选择 Lumina Note</h2>

- **本地优先**：笔记库在本地，是否把内容发送给模型由你决定。
- **知识工作流完整**：编辑器、双链、图谱是连在一起的，不是拼凑功能。
- **AI 可执行任务**：不仅能聊天，还能完成检索、编辑、研究等实际工作。

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
- 模式：`Chat` / `Agent` / `Deep Research` / `Codex`（侧边栏内嵌 VS Code 扩展）
- 支持多模型提供商：OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- 基于本地笔记库的语义检索（RAG）

<h3 align="center">编辑器与知识图谱</h3>
- Markdown 源码 / 实时预览 / 阅读模式
- `[[WikiLinks]]` 双向链接
- LaTeX、Mermaid、代码高亮
- 图谱可视化笔记关系

<h3 align="center">阅读与采集</h3>
- 内置 PDF 阅读器：高亮、下划线、批注
- 批注可保存为 Markdown
- 选中内容可直接发送到 AI 上下文

<h3 align="center">扩展能力</h3>
- B 站视频笔记（弹幕时间戳同步）
- 语音输入（实时转文字）
- 数据库视图（表格 / 看板）
- WebDAV 同步
- 闪卡复习
- 15 套主题

<h3 align="center">插件生态（开发者预览）</h3>
- 从工作区 / 用户目录 / 内置目录加载插件
- 插件能力运行时权限模型
- Slash Command 扩展 API
- 开发文档：`docs/plugin-ecosystem.md`

---

<h2 align="center">快速开始</h2>

1. 从 Releases 安装应用。
2. 首次启动选择本地文件夹作为笔记库。
3. 在右侧 AI 面板配置模型与 API Key。
4. 创建第一条笔记，并用 `[[双链]]` 建立关联。

---

<h2 align="center">使用指南</h2>

<h3 align="center">推荐先读</h3>
- 中文：`docs/user-flow.zh-CN.md`
- English: `docs/user-flow.md`
- 日本語: `docs/user-flow.ja.md`

<h3 align="center">自部署中继（跨网络手机访问）</h3>
- 中文：`docs/self-host.zh-CN.md`
- English: `docs/self-host.md`

---

<h2 align="center">从源码构建</h2>

环境要求：
- Node.js 20+（推荐 20.11.1）
- Rust 1.70+

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run tauri dev
```

---

<h2 align="center">技术栈</h2>

- 框架：Tauri v2（Rust + WebView）
- 前端：React 18、TypeScript、Tailwind CSS
- 编辑器：CodeMirror 6
- 状态管理：Zustand
- 向量存储：SQLite

---

<h2 align="center">开源组件</h2>

- 编辑器核心：[codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)
- Rust 编排运行时：[forge](https://github.com/blueberrycongee/forge)

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
