<div align="center">

<img src="src-tauri/icons/icon.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**本地优先的 AI 笔记应用**

你的笔记数据完全存储在本地，AI Agent 帮你自动整理、搜索、编辑。

[![GitHub Release](https://img.shields.io/github/v/release/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/releases)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)

**Language**: 简体中文 · [English](./README.en.md) · [日本語](./README.ja.md)

</div>

---

## 下载安装

前往 [Releases](https://github.com/blueberrycongee/Lumina-Note/releases) 下载最新版本：

| 平台 | 下载 |
|------|------|
| Windows | `.msi` 或 `.exe` |
| macOS (Intel) | `x64.dmg` |
| macOS (Apple Silicon) | `aarch64.dmg` |

---

## 界面预览

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

## 核心特性

### AI 助手
- 多模式：对话 / Agent / Deep Research / Codex（侧边栏内嵌 VS Code 扩展）
- 理解你的意图，自动执行读取、编辑、搜索等任务
- 支持多家模型提供商：OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- 内置本地 RAG 语义搜索，基于你的笔记库回答问题

### 编辑器
- 源码 / 实时预览 / 阅读三种模式
- 双向链接 `[[WikiLinks]]`，构建知识网络
- LaTeX 公式、Mermaid 图表、代码高亮
- 分栏编辑，图片粘贴

### 知识图谱
- 可视化笔记间的关联关系
- 文件夹层级、双向链接自动解析
- 物理引擎驱动，支持拖拽和缩放

### PDF 阅读器
- 高亮、下划线、笔记批注
- 批注自动保存为 Markdown
- 选中内容发送给 AI 对话

### 更多功能
- B 站视频笔记（弹幕同步时间戳）
- 语音输入（实时转文字）
- 数据库视图（表格/看板）
- WebDAV 同步
- 闪卡复习
- 15 套主题

---

## 快速开始

1. 下载并安装应用
2. 首次启动时选择一个文件夹作为笔记库
3. 在右侧 AI 面板配置模型与 API Key
4. 开始使用

---

## 从源码构建

需要 Node.js 20+（推荐 20.11.1）和 Rust 1.70+

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run tauri dev
```

---

## 技术栈

- **框架**: Tauri v2 (Rust + WebView)
- **前端**: React 18, TypeScript, Tailwind CSS
- **编辑器**: CodeMirror 6
- **状态管理**: Zustand
- **向量数据库**: SQLite

---

## 贡献者

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

## 许可证

[Apache License 2.0](LICENSE)

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
