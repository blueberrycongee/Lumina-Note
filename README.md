<div align="center">

<img src="src-tauri/icons/128x128.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**Local-first AI note-taking app**

Your notes stay on your device. Lumina Note helps you write, connect, and evolve knowledge with AI, while keeping data ownership in your hands.

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

**Language**: English (default) · [简体中文](./README.zh-CN.md) · [日本語](./README.ja.md)

</div>

---

<h2 align="center">Why Lumina Note</h2>

- **Local-first by design**: your vault is local, and you decide what to send to model providers.
- **Knowledge-centered workflow**: Markdown editor, WikiLinks, and graph view work together naturally.
- **AI that can actually act**: Chat, Agent, Deep Research, and Codex mode support real editing and retrieval tasks.

---

<h2 align="center">Download</h2>

<div align="center">

Get the latest build from [Releases](https://github.com/blueberrycongee/Lumina-Note/releases):

| Platform | Package |
|----------|---------|
| Windows | `.msi` / `.exe` |
| macOS (Intel) | `x64.dmg` |
| macOS (Apple Silicon) | `aarch64.dmg` |

</div>

---

<h2 align="center">Screenshots</h2>

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

<h2 align="center">Features</h2>

<h3 align="center">AI workspace</h3>
- Modes: `Chat` / `Agent` / `Deep Research` / `Codex` (embedded VS Code extension in sidebar)
- Multi-provider support: OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- Local semantic retrieval (RAG) from your vault

<h3 align="center">Editor and knowledge graph</h3>
- Markdown source / live preview / reading modes
- Bidirectional links with `[[WikiLinks]]`
- LaTeX, Mermaid, code highlighting
- Graph visualization for relationships across notes

<h3 align="center">Reading and capture</h3>
- Built-in PDF reader with highlight, underline, and annotations
- Save annotation results as Markdown
- Send selected content directly to AI context

<h3 align="center">Extra capabilities</h3>
- Bilibili video notes (danmaku timestamp sync)
- Real-time voice input
- Database views (table / kanban)
- WebDAV sync
- Flashcard review
- 15 themes

<h3 align="center">Plugin ecosystem (Developer Preview)</h3>
- Load plugins from workspace / user / built-in directories
- Runtime permission model for plugin capabilities
- Slash command extension API
- Developer guide: `docs/plugin-ecosystem.md`

---

<h2 align="center">Quick Start</h2>

1. Install Lumina Note from Releases.
2. Choose a local folder as your vault on first launch.
3. Configure model provider + API key in the right AI panel.
4. Create your first note and start linking with `[[WikiLinks]]`.

---

<h2 align="center">Guides</h2>

<h3 align="center">Recommended user guides</h3>
- English: `docs/user-flow.md`
- 简体中文: `docs/user-flow.zh-CN.md`
- 日本語: `docs/user-flow.ja.md`

<h3 align="center">Self-hosted relay (cross-network mobile access)</h3>
- English: `docs/self-host.md`
- 简体中文: `docs/self-host.zh-CN.md`

---

<h2 align="center">Build from Source</h2>

Requirements:
- Node.js 20+ (recommended 20.11.1)
- Rust 1.70+

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run tauri dev
```

---

<h2 align="center">Tech Stack</h2>

- Framework: Tauri v2 (Rust + WebView)
- Frontend: React 18, TypeScript, Tailwind CSS
- Editor: CodeMirror 6
- State: Zustand
- Vector storage: SQLite

---

<h2 align="center">Open Source Components</h2>

- Editor core: [codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)
- Rust orchestration runtime: [forge](https://github.com/blueberrycongee/forge)

---

<h2 align="center">Contributors</h2>

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

<h2 align="center">License</h2>

[Apache License 2.0](LICENSE)

---

<h2 align="center">Star History</h2>

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
