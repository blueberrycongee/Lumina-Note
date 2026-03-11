<div align="center">

<img src="src-tauri/icons/128x128.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**Aplicativo de notas com IA e abordagem local-first**

Suas notas permanecem no seu dispositivo. O Lumina Note ajuda você a escrever, conectar, buscar e refinar conhecimento com IA sem abrir mão do controle dos seus dados.

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

**Idioma**: [English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Italiano](./README.it.md) · Português (Brasil) · [Русский](./README.ru.md)

</div>

---

<h2 align="center">Por que Lumina Note</h2>

- **Projetado em local-first**: seu vault fica local e você decide o que será enviado aos provedores de modelos.
- **Fluxo de trabalho centrado em conhecimento**: edição Markdown, WikiLinks, visualização em grafo e recuperação com IA funcionam como um único sistema.
- **IA que realmente age**: `Chat`, `Agent`, `Deep Research` e `Codex` apoiam tarefas reais de edição e pesquisa.

---

<h2 align="center">Download</h2>

<div align="center">

Baixe a versão mais recente em [Releases](https://github.com/blueberrycongee/Lumina-Note/releases):

| Plataforma | Pacote |
|-----------|--------|
| Windows | `.msi` / `.exe` |
| macOS (Intel) | `x64.dmg` |
| macOS (Apple Silicon) | `aarch64.dmg` |

</div>

---

<h2 align="center">Capturas de tela</h2>

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

<h2 align="center">Recursos</h2>

<h3 align="center">Workspace de IA</h3>

- Modos: `Chat` / `Agent` / `Deep Research` / `Codex` (extensão VS Code embutida na barra lateral)
- Suporte a vários provedores: OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- Recuperação semântica local (RAG) a partir do seu vault

<h3 align="center">Editor e grafo de conhecimento</h3>

- Modos de código Markdown / preview ao vivo / leitura
- Links bidirecionais com `[[WikiLinks]]`
- LaTeX, Mermaid e destaque de código
- Visualização em grafo das relações entre notas

<h3 align="center">Leitura e captura</h3>

- Leitor de PDF integrado com destaque, sublinhado e anotações
- Salve resultados de anotação como Markdown
- Envie conteúdo selecionado diretamente para o contexto da IA

<h3 align="center">Capacidades extras</h3>

- Notas de vídeo do Bilibili com sincronização de timestamp de danmaku
- Entrada de voz em tempo real
- Visualizações de banco de dados (tabela / kanban)
- Sincronização WebDAV
- Revisão com flashcards
- 15 temas

<h3 align="center">Ecossistema de plugins (Developer Preview)</h3>

- Carregue plugins de diretórios workspace / user / built-in
- Modelo de permissões em tempo de execução para capacidades de plugin
- API de extensão Slash Command
- Guia do desenvolvedor: `docs/plugin-ecosystem.md`

---

<h2 align="center">Início rápido</h2>

1. Instale o Lumina Note a partir de Releases.
2. Escolha uma pasta local como seu vault na primeira execução.
3. Configure um provedor de modelos e sua API key no painel de IA.
4. Crie sua primeira nota e comece a conectar com `[[WikiLinks]]`.

---

<h2 align="center">Guias</h2>

<h3 align="center">Guias recomendados</h3>

- English: `docs/user-flow.md`
- 简体中文: `docs/user-flow.zh-CN.md`
- 日本語: `docs/user-flow.ja.md`

<h3 align="center">Relay self-hosted (acesso móvel entre redes)</h3>

- English: `docs/self-host.md`
- 简体中文: `docs/self-host.zh-CN.md`

---

<h2 align="center">Compilar a partir do código-fonte</h2>

Requisitos:

- Node.js 20+ (recomendado 20.11.1)
- Rust 1.70+

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run tauri dev
```

---

<h2 align="center">Stack técnico</h2>

- Framework: Tauri v2 (Rust + WebView)
- Frontend: React 18, TypeScript, Tailwind CSS
- Editor: CodeMirror 6
- Gerenciamento de estado: Zustand
- Armazenamento vetorial: SQLite

---

<h2 align="center">Componentes open source</h2>

- Núcleo do editor: [codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)
- Runtime de orquestração em Rust: [forge](https://github.com/blueberrycongee/forge)

---

<h2 align="center">Contribuidores</h2>

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

<h2 align="center">Licença</h2>

[Apache License 2.0](LICENSE)

---

<h2 align="center">Star History</h2>

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
