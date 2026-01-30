<div align="center">

<img src="src-tauri/icons/icon.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**Local-first AI Note-taking App**

Your notes stay on your device. AI Agent helps you organize, search, and edit automatically.

[![GitHub Release](https://img.shields.io/github/v/release/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/releases)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)

**Language**: [简体中文](./README.md) · English · [日本語](./README.ja.md)

</div>

---

## Download

Go to [Releases](https://github.com/blueberrycongee/Lumina-Note/releases) to download the latest version:

| Platform | Download |
|----------|----------|
| Windows | `.msi` or `.exe` |
| macOS (Intel) | `x64.dmg` |
| macOS (Apple Silicon) | `aarch64.dmg` |

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/ai-agent.png" alt="AI Agent" width="800" />
</p>

<p align="center">
  <img src="docs/screenshots/knowledge-graph.png" alt="Knowledge Graph" width="800" />
</p>

<p align="center">
  <img src="docs/screenshots/editor-latex.png" alt="Editor" width="800" />
</p>

---

## Features

### AI Assistant
- Modes: Chat / Agent / Deep Research / Codex (embedded VS Code extension in the sidebar)
- Understands your intent and automatically executes read, edit, search tasks
- Supports multiple providers: OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- Built-in local RAG semantic search based on your note vault

### Editor
- Source / Live Preview / Reading modes
- Bidirectional links `[[WikiLinks]]` to build knowledge networks
- LaTeX formulas, Mermaid diagrams, code highlighting
- Split pane editing, image paste

### Knowledge Graph
- Visualize connections between notes
- Auto-parse folder hierarchy and bidirectional links
- Physics engine driven, supports drag and zoom

### PDF Reader
- Highlight, underline, and annotate
- Annotations auto-saved as Markdown
- Send selected content to AI chat

### More Features
- Bilibili video notes (danmaku timestamp sync)
- Voice input (real-time transcription)
- Database views (table/kanban)
- WebDAV sync
- Flashcard review
- 15 themes

---

## Quick Start

1. Download and install the app
2. Select a folder as your note vault on first launch
3. Configure your model and API key in the right-side AI panel
4. Start using

---

## Build from Source

Requires Node.js 20+ (recommended 20.11.1) and Rust 1.70+

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run tauri dev
```

---

## Tech Stack

- **Framework**: Tauri v2 (Rust + WebView)
- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Editor**: CodeMirror 6
- **State Management**: Zustand
- **Vector Database**: SQLite

---

## Contributors

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

## License

[Apache License 2.0](LICENSE)

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
