<div align="center">

<img src="build-resources/icon.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**AI-приложение для заметок с подходом local-first**

Ваши заметки остаются на вашем устройстве. Lumina Note помогает писать, связывать, искать и улучшать знания с помощью AI, сохраняя контроль над данными в ваших руках.

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

**Язык**: [English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Italiano](./README.it.md) · [Português (Brasil)](./README.pt-BR.md) · Русский

</div>

---

<h2 align="center">Почему Lumina Note</h2>

- **Архитектура local-first**: ваш vault хранится локально, и только вы решаете, что отправлять поставщикам моделей.
- **Поток работы вокруг знаний**: Markdown-редактор, WikiLinks, граф и AI-поиск работают как единая система.
- **AI, который действительно действует**: режимы `Chat`, `Agent` и `Codex` помогают с реальным редактированием, планированием и автоматизацией.

---

<h2 align="center">Загрузка</h2>

<div align="center">

Последнюю версию можно скачать в [Releases](https://github.com/blueberrycongee/Lumina-Note/releases):

| Платформа | Пакет |
|----------|-------|
| Windows | `.msi` / `.exe` |
| macOS (Intel) | `x64.dmg` |
| macOS (Apple Silicon) | `aarch64.dmg` |

</div>

---

<h2 align="center">Скриншоты</h2>

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

<h2 align="center">Возможности</h2>

<h3 align="center">AI workspace</h3>

- Режимы: `Chat` / `Agent` / `Codex` (встроенное расширение VS Code в боковой панели)
- Поддержка нескольких провайдеров: OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- Простая настройка моделей по назначению: `Main Model` / `Chat Model` / `Complex Task Model`
- Оркестрируемый runtime агента для более тяжёлых задач и быстрый путь для простых запросов
- Локальный семантический поиск (RAG) по вашему vault

<h3 align="center">Редактор и граф знаний</h3>

- Режимы исходного Markdown / живого предпросмотра / чтения
- Двунаправленные ссылки через `[[WikiLinks]]`
- LaTeX, Mermaid и подсветка кода
- Графовая визуализация связей между заметками

<h3 align="center">Чтение и сбор материалов</h3>

- Встроенный PDF-ридер с подсветкой, подчеркиванием и аннотациями
- Сохранение аннотаций в Markdown
- Отправка выделенного содержимого прямо в контекст AI

<h3 align="center">Дополнительные возможности</h3>

- Заметки по видео Bilibili с синхронизацией таймкодов danmaku
- Голосовой ввод в реальном времени
- Представления базы данных (таблица / канбан)
- Синхронизация WebDAV
- Повторение с flashcards
- 15 тем

<h3 align="center">Экосистема плагинов (Developer Preview)</h3>

- Загрузка плагинов из каталогов workspace / user / built-in
- Модель runtime-разрешений для возможностей плагинов
- API расширения Slash Command
- Руководство для разработчиков: `docs/plugin-ecosystem.md`

---

<h2 align="center">Быстрый старт</h2>

1. Установите Lumina Note из Releases.
2. При первом запуске выберите локальную папку как ваш vault.
3. Настройте провайдера модели и API key в AI-панели, а при необходимости задайте модели `Main` / `Chat` / `Complex Task` в Dynamic Routing.
4. Создайте первую заметку и начните связывать их через `[[WikiLinks]]`.

---

<h2 align="center">Руководства</h2>

<h3 align="center">Рекомендуемые руководства</h3>

- English: `docs/user-flow.md`
- 简体中文: `docs/user-flow.zh-CN.md`
- 日本語: `docs/user-flow.ja.md`

<h3 align="center">Self-hosted relay (мобильный доступ через разные сети)</h3>

- English: `docs/self-host.md`
- 简体中文: `docs/self-host.zh-CN.md`

---

<h2 align="center">Сборка из исходников</h2>

Требования:

- Node.js 20+ (рекомендуется 20.11.1)
- 

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run dev
```

---

<h2 align="center">Технологический стек</h2>

- Framework: Electron 41 (Chromium + Node.js in the main process)
- Frontend: React 18, TypeScript, Tailwind CSS
- Editor: CodeMirror 6
- State management: Zustand
- Vector storage: SQLite

---

<h2 align="center">Open source компоненты</h2>

- Ядро редактора: [codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)
- Rust runtime для оркестрации: [forge](https://github.com/blueberrycongee/forge)

---

<h2 align="center">Участники</h2>

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

<h2 align="center">Лицензия</h2>

[Apache License 2.0](LICENSE)

---

<h2 align="center">Star History</h2>

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
