<div align="center">

<img src="build-resources/icon.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**Aplicación de notas con IA y enfoque local-first**

Tus notas permanecen en tu dispositivo. Lumina Note te ayuda a escribir, conectar, buscar y refinar conocimiento con IA sin perder el control de tus datos.

[![GitHub Release](https://img.shields.io/github/v/release/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/releases)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-41-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)

[![CI](https://img.shields.io/github/actions/workflow/status/blueberrycongee/Lumina-Note/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/blueberrycongee/Lumina-Note/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/github/actions/workflow/status/blueberrycongee/Lumina-Note/security-audit.yml?branch=main&style=flat-square&label=Security%20Audit)](https://github.com/blueberrycongee/Lumina-Note/actions/workflows/security-audit.yml)
[![Downloads](https://img.shields.io/github/downloads/blueberrycongee/Lumina-Note/total?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/releases)
[![Last Commit](https://img.shields.io/github/last-commit/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/commits/main)
[![GitHub Stars](https://img.shields.io/github/stars/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/stargazers)
[![Commit Activity](https://img.shields.io/github/commit-activity/m/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/commits/main)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square)

**Idioma**: [English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · Español · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Italiano](./README.it.md) · [Português (Brasil)](./README.pt-BR.md) · [Русский](./README.ru.md)

</div>

---

<h2 align="center">Por qué Lumina Note</h2>

- **Diseño local-first**: tu vault permanece en local y tú decides qué se envía a los proveedores de modelos.
- **Flujo de trabajo centrado en el conocimiento**: edición Markdown, WikiLinks, vista de grafo y agentes de IA funcionan como un solo sistema.
- **IA que realmente actúa**: `Agent` apoya tareas reales de edición, planificación y automatización.

---

<h2 align="center">Descarga</h2>

<div align="center">

Obtén la versión más reciente desde [Releases](https://github.com/blueberrycongee/Lumina-Note/releases):

| Plataforma | Paquete |
|-----------|---------|
| Windows | `.msi` / `.exe` |
| macOS (Intel) | `x64.dmg` |
| macOS (Apple Silicon) | `aarch64.dmg` |

</div>

---

<h2 align="center">Capturas de pantalla</h2>

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

<h2 align="center">Funciones</h2>

<h3 align="center">Espacio de trabajo de IA</h3>

- Modo Agent para edición, planificación y automatización de tareas
- Soporte para múltiples proveedores: OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- Runtime de agente orquestado para tareas más pesadas, con ruta rápida para solicitudes simples

<h3 align="center">Editor y grafo de conocimiento</h3>

- Modos de código Markdown / vista previa en vivo / lectura
- Enlaces bidireccionales con `[[WikiLinks]]`
- LaTeX, Mermaid y resaltado de código
- Visualización en grafo de las relaciones entre notas

<h3 align="center">Lectura y captura</h3>

- Lector PDF integrado con resaltado, subrayado y anotaciones
- Guarda el resultado de las anotaciones como Markdown
- Envía contenido seleccionado directamente al contexto de IA

<h3 align="center">Capacidades adicionales</h3>

- Entrada de voz en tiempo real
- Sincronización WebDAV
- Repaso con flashcards
- 15 temas

<h3 align="center">Ecosistema de plugins (Developer Preview)</h3>

- Carga plugins desde directorios workspace / user / built-in
- Modelo de permisos en tiempo de ejecución para capacidades del plugin
- API de extensión para Slash Command
- Guía para desarrolladores: `docs/plugin-ecosystem.md`

---

<h2 align="center">Inicio rápido</h2>

1. Instala Lumina Note desde Releases.
2. Elige una carpeta local como tu vault en el primer inicio.
3. Configura un proveedor de modelos y tu API key en el panel de IA, y opcionalmente elige tu modelo preferido.
4. Crea tu primera nota y empieza a enlazar con `[[WikiLinks]]`.

---

<h2 align="center">Guías</h2>

<h3 align="center">Guías recomendadas</h3>

- English: `docs/user-flow.md`
- 简体中文: `docs/user-flow.zh-CN.md`
- 日本語: `docs/user-flow.ja.md`

<h3 align="center">Relay autohospedado (acceso móvil entre redes)</h3>

- English: `docs/self-host.md`
- 简体中文: `docs/self-host.zh-CN.md`

---

<h2 align="center">Compilar desde el código fuente</h2>

Requisitos:

- Node.js 20+ (recomendado 20.11.1)
- 

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run dev
```

---

<h2 align="center">Stack técnico</h2>

- Framework: Electron 41 (Chromium + Node.js in the main process)
- Frontend: React 18, TypeScript, Tailwind CSS
- Editor: CodeMirror 6
- Estado: Zustand
- Almacenamiento vectorial: SQLite

---

<h2 align="center">Componentes de código abierto</h2>

- Núcleo del editor: [codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)

---

<h2 align="center">Contribuidores</h2>

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

<h2 align="center">Licencia</h2>

[Apache License 2.0](LICENSE)

---

<h2 align="center">Star History</h2>

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
