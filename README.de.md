<div align="center">

<img src="build-resources/icon.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**Local-first KI-Notiz-App**

Deine Notizen bleiben auf deinem Gerät. Lumina Note hilft dir, Wissen mit KI zu schreiben, zu verknüpfen, zu durchsuchen und zu überarbeiten, ohne die Kontrolle über deine Daten abzugeben.

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

**Sprache**: [English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · [Français](./README.fr.md) · Deutsch · [Italiano](./README.it.md) · [Português (Brasil)](./README.pt-BR.md) · [Русский](./README.ru.md)

</div>

---

<h2 align="center">Warum Lumina Note</h2>

- **Local-first entwickelt**: Dein Vault bleibt lokal und du entscheidest, was an Modellanbieter gesendet wird.
- **Auf Wissensarbeit ausgerichtet**: Markdown-Editor, WikiLinks, Graph-Ansicht und KI-Retrieval arbeiten als ein System zusammen.
- **KI, die wirklich handelt**: `Agent` unterstützt echte Bearbeitungs-, Planungs- und Automatisierungsaufgaben.

---

<h2 align="center">Download</h2>

<div align="center">

Die neueste Version findest du unter [Releases](https://github.com/blueberrycongee/Lumina-Note/releases):

| Plattform | Paket |
|----------|-------|
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

<h2 align="center">Funktionen</h2>

<h3 align="center">KI-Workspace</h3>

- Modus: `Agent` (eingebettete VS Code Erweiterung in der Seitenleiste)
- Unterstützung für mehrere Anbieter: OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- Einfache modellbezogene Zweckzuordnung: `Main Model`
- Orchestrierte Agent-Laufzeit für schwerere Aufgaben, mit schnellem Pfad für einfache Anfragen
- Lokales semantisches Retrieval (RAG) aus deinem Vault

<h3 align="center">Editor und Wissensgraph</h3>

- Markdown-Quelltext / Live-Vorschau / Lesemodi
- Bidirektionale Links mit `[[WikiLinks]]`
- LaTeX, Mermaid und Syntax-Highlighting
- Graph-Visualisierung für Beziehungen zwischen Notizen

<h3 align="center">Lesen und Erfassen</h3>

- Integrierter PDF-Reader mit Hervorhebungen, Unterstreichungen und Annotationen
- Annotationen als Markdown speichern
- Ausgewählte Inhalte direkt in den KI-Kontext senden

<h3 align="center">Weitere Fähigkeiten</h3>

- Bilibili-Video-Notizen mit Danmaku-Zeitstempel-Synchronisierung
- Spracheingabe in Echtzeit
- Datenbankansichten (Tabelle / Kanban)
- WebDAV-Synchronisierung
- Flashcard-Wiederholung
- 15 Themes

<h3 align="center">Plugin-Ökosystem (Developer Preview)</h3>

- Plugins aus workspace / user / built-in Verzeichnissen laden
- Laufzeit-Permissionsmodell für Plugin-Fähigkeiten
- Slash-Command-Erweiterungs-API
- Entwicklerleitfaden: `docs/plugin-ecosystem.md`

---

<h2 align="center">Schnellstart</h2>

1. Installiere Lumina Note aus den Releases.
2. Wähle beim ersten Start einen lokalen Ordner als Vault.
3. Konfiguriere im KI-Panel einen Modellanbieter und deinen API-Schlüssel und lege bei Bedarf in Dynamic Routing `Main` Modelle fest.
4. Erstelle deine erste Notiz und verknüpfe sie mit `[[WikiLinks]]`.

---

<h2 align="center">Guides</h2>

<h3 align="center">Empfohlene Benutzerleitfäden</h3>

- English: `docs/user-flow.md`
- 简体中文: `docs/user-flow.zh-CN.md`
- 日本語: `docs/user-flow.ja.md`

<h3 align="center">Selbst gehostetes Relay (netzübergreifender mobiler Zugriff)</h3>

- English: `docs/self-host.md`
- 简体中文: `docs/self-host.zh-CN.md`

---

<h2 align="center">Aus dem Quellcode bauen</h2>

Voraussetzungen:

- Node.js 20+ (empfohlen 20.11.1)
- 

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run dev
```

---

<h2 align="center">Tech-Stack</h2>

- Framework: Electron 41 (Chromium + Node.js in the main process)
- Frontend: React 18, TypeScript, Tailwind CSS
- Editor: CodeMirror 6
- State-Management: Zustand
- Vektorspeicher: SQLite

---

<h2 align="center">Open-Source-Komponenten</h2>

- Editor-Kern: [codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)
- Rust-Orchestrierungs-Runtime: [forge](https://github.com/blueberrycongee/forge)

---

<h2 align="center">Mitwirkende</h2>

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

<h2 align="center">Lizenz</h2>

[Apache License 2.0](LICENSE)

---

<h2 align="center">Star History</h2>

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
