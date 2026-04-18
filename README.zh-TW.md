<div align="center">

<img src="build-resources/icon.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**本地優先的 AI 筆記應用**

你的筆記預設保留在本機裝置上。Lumina Note 用 AI 幫你書寫、連結、檢索與整理知識，同時把資料控制權留在你手中。

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

**語言**： [English](./README.md) · [简体中文](./README.zh-CN.md) · 繁體中文 · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Italiano](./README.it.md) · [Português (Brasil)](./README.pt-BR.md) · [Русский](./README.ru.md)

</div>

---

<h2 align="center">為什麼選擇 Lumina Note</h2>

- **本地優先**：你的筆記庫保留在本地，是否送到模型服務商由你決定。
- **圍繞知識工作流設計**：Markdown 編輯、雙向連結、圖譜與 AI 檢索是同一套系統。
- **AI 不只是聊天**：`Chat`、`Agent`、`Codex` 支援真正的編輯、規劃與自動化任務。

---

<h2 align="center">下載</h2>

<div align="center">

前往 [Releases](https://github.com/blueberrycongee/Lumina-Note/releases) 取得最新版本：

| 平台 | 安裝包 |
|------|--------|
| Windows | `.msi` / `.exe` |
| macOS (Intel) | `x64.dmg` |
| macOS (Apple Silicon) | `aarch64.dmg` |

</div>

---

<h2 align="center">畫面預覽</h2>

<p align="center">
  <img src="docs/screenshots/ai-agent.png" alt="AI Agent" width="800" />
</p>

<p align="center">
  <img src="docs/screenshots/knowledge-graph.png" alt="知識圖譜" width="800" />
</p>

<p align="center">
  <img src="docs/screenshots/editor-latex.png" alt="編輯器" width="800" />
</p>

---

<h2 align="center">功能總覽</h2>

<h3 align="center">AI 工作區</h3>

- 模式：`Chat` / `Agent` / `Codex`（側欄內嵌 VS Code 擴充）
- 支援多模型服務商：OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- 支援依用途配置模型：`主模型` / `聊天模型` / `複雜任務模型`
- 較重的任務會進入編排式 Agent 執行流程，簡單任務則保留快速路徑
- 以本地筆記庫為基礎的語意檢索（RAG）

<h3 align="center">編輯器與知識圖譜</h3>

- Markdown 原始碼 / 即時預覽 / 閱讀模式
- `[[WikiLinks]]` 雙向連結
- LaTeX、Mermaid、程式碼高亮
- 圖譜化呈現筆記之間的關係

<h3 align="center">閱讀與擷取</h3>

- 內建 PDF 閱讀器，支援螢光標記、底線與註解
- 註解結果可儲存為 Markdown
- 選取內容可直接送入 AI 上下文

<h3 align="center">延伸能力</h3>

- Bilibili 影片筆記，支援彈幕時間戳同步
- 即時語音輸入
- 資料庫視圖（表格 / 看板）
- WebDAV 同步
- 單字卡複習
- 15 套主題

<h3 align="center">外掛生態（開發者預覽）</h3>

- 從 workspace / user / built-in 目錄載入外掛
- 外掛能力的執行期權限模型
- Slash Command 擴充 API
- 開發文件：`docs/plugin-ecosystem.md`

---

<h2 align="center">快速開始</h2>

1. 從 Releases 安裝 Lumina Note。
2. 首次啟動時選擇本機資料夾作為筆記庫。
3. 在 AI 面板中設定模型服務商與 API Key，並可在 Dynamic Routing 中依用途設定 `主模型` / `聊天模型` / `複雜任務模型`。
4. 建立第一則筆記，並用 `[[WikiLinks]]` 串連知識。

---

<h2 align="center">使用指南</h2>

<h3 align="center">建議先讀</h3>

- English: `docs/user-flow.md`
- 简体中文：`docs/user-flow.zh-CN.md`
- 日本語: `docs/user-flow.ja.md`

<h3 align="center">自架中繼（跨網路手機存取）</h3>

- English: `docs/self-host.md`
- 简体中文：`docs/self-host.zh-CN.md`

---

<h2 align="center">從原始碼建置</h2>

環境需求：

- Node.js 20+（建議 20.11.1）
- 

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run dev
```

---

<h2 align="center">技術棧</h2>

- 框架：Electron 41（Chromium + Node.js）
- 前端：React 18、TypeScript、Tailwind CSS
- 編輯器：CodeMirror 6
- 狀態管理：Zustand
- 向量儲存：SQLite

---

<h2 align="center">開源元件</h2>

- 編輯器核心：[codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)
- Rust 編排執行時：[forge](https://github.com/blueberrycongee/forge)

---

<h2 align="center">貢獻者</h2>

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

<h2 align="center">授權</h2>

[Apache License 2.0](LICENSE)

---

<h2 align="center">Star History</h2>

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
