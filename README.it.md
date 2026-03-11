<div align="center">

<img src="src-tauri/icons/128x128.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**App di note AI local-first**

Le tue note restano sul tuo dispositivo. Lumina Note ti aiuta a scrivere, collegare, cercare e rifinire la conoscenza con l'AI mantenendo il controllo dei tuoi dati.

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

**Lingua**: [English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · Italiano · [Português (Brasil)](./README.pt-BR.md) · [Русский](./README.ru.md)

</div>

---

<h2 align="center">Perché Lumina Note</h2>

- **Progettato local-first**: il tuo vault resta in locale e decidi tu cosa inviare ai provider di modelli.
- **Flusso di lavoro centrato sulla conoscenza**: editing Markdown, WikiLinks, vista grafo e recupero AI lavorano come un unico sistema.
- **AI che agisce davvero**: `Chat`, `Agent`, `Deep Research` e `Codex` supportano attività reali di editing e ricerca.

---

<h2 align="center">Download</h2>

<div align="center">

Scarica l'ultima versione da [Releases](https://github.com/blueberrycongee/Lumina-Note/releases):

| Piattaforma | Pacchetto |
|------------|-----------|
| Windows | `.msi` / `.exe` |
| macOS (Intel) | `x64.dmg` |
| macOS (Apple Silicon) | `aarch64.dmg` |

</div>

---

<h2 align="center">Screenshot</h2>

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

<h2 align="center">Funzionalità</h2>

<h3 align="center">Workspace AI</h3>

- Modalità: `Chat` / `Agent` / `Deep Research` / `Codex` (estensione VS Code integrata nella barra laterale)
- Supporto multi-provider: OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- Recupero semantico locale (RAG) dal tuo vault

<h3 align="center">Editor e grafo della conoscenza</h3>

- Modalità sorgente Markdown / anteprima live / lettura
- Collegamenti bidirezionali con `[[WikiLinks]]`
- LaTeX, Mermaid e evidenziazione del codice
- Visualizzazione a grafo delle relazioni tra note

<h3 align="center">Lettura e acquisizione</h3>

- Lettore PDF integrato con evidenziazione, sottolineatura e annotazioni
- Salvataggio delle annotazioni in Markdown
- Invio diretto del contenuto selezionato nel contesto AI

<h3 align="center">Capacità aggiuntive</h3>

- Note video Bilibili con sincronizzazione dei timestamp danmaku
- Input vocale in tempo reale
- Viste database (tabella / kanban)
- Sincronizzazione WebDAV
- Ripasso con flashcard
- 15 temi

<h3 align="center">Ecosistema plugin (Developer Preview)</h3>

- Caricamento plugin da directory workspace / user / built-in
- Modello di permessi runtime per le capacità dei plugin
- API di estensione Slash Command
- Guida per sviluppatori: `docs/plugin-ecosystem.md`

---

<h2 align="center">Avvio rapido</h2>

1. Installa Lumina Note da Releases.
2. Al primo avvio scegli una cartella locale come vault.
3. Configura un provider di modelli e la tua API key nel pannello AI.
4. Crea la tua prima nota e inizia a collegarla con `[[WikiLinks]]`.

---

<h2 align="center">Guide</h2>

<h3 align="center">Guide consigliate</h3>

- English: `docs/user-flow.md`
- 简体中文: `docs/user-flow.zh-CN.md`
- 日本語: `docs/user-flow.ja.md`

<h3 align="center">Relay self-hosted (accesso mobile tra reti diverse)</h3>

- English: `docs/self-host.md`
- 简体中文: `docs/self-host.zh-CN.md`

---

<h2 align="center">Build dai sorgenti</h2>

Requisiti:

- Node.js 20+ (consigliato 20.11.1)
- Rust 1.70+

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run tauri dev
```

---

<h2 align="center">Stack tecnico</h2>

- Framework: Tauri v2 (Rust + WebView)
- Frontend: React 18, TypeScript, Tailwind CSS
- Editor: CodeMirror 6
- State management: Zustand
- Archiviazione vettoriale: SQLite

---

<h2 align="center">Componenti open source</h2>

- Core editor: [codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)
- Runtime di orchestrazione Rust: [forge](https://github.com/blueberrycongee/forge)

---

<h2 align="center">Contributori</h2>

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

<h2 align="center">Licenza</h2>

[Apache License 2.0](LICENSE)

---

<h2 align="center">Star History</h2>

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
