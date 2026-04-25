<div align="center">

<img src="build-resources/icon.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**Application de prise de notes IA en local-first**

Vos notes restent sur votre appareil. Lumina Note vous aide à écrire, relier, rechercher et affiner vos connaissances avec l'IA tout en gardant le contrôle de vos données.

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

**Langue** : [English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · Français · [Deutsch](./README.de.md) · [Italiano](./README.it.md) · [Português (Brasil)](./README.pt-BR.md) · [Русский](./README.ru.md)

</div>

---

<h2 align="center">Pourquoi Lumina Note</h2>

- **Conçu en local-first** : votre vault reste en local et vous décidez ce qui part vers les fournisseurs de modèles.
- **Flux de travail centré sur la connaissance** : édition Markdown, WikiLinks, vue graphe et recherche IA fonctionnent comme un seul système.
- **Une IA qui agit vraiment** : `Agent` prend en charge de vraies tâches d'édition, de planification et d'automatisation.

---

<h2 align="center">Téléchargement</h2>

<div align="center">

Récupérez la dernière version depuis [Releases](https://github.com/blueberrycongee/Lumina-Note/releases) :

| Plateforme | Paquet |
|-----------|--------|
| Windows | `.msi` / `.exe` |
| macOS (Intel) | `x64.dmg` |
| macOS (Apple Silicon) | `aarch64.dmg` |

</div>

---

<h2 align="center">Captures d'écran</h2>

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

<h2 align="center">Fonctionnalités</h2>

<h3 align="center">Espace de travail IA</h3>

- Mode Agent pour l'édition, la planification et l'automatisation des tâches
- Support multi-fournisseurs : OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- Runtime d'agent orchestré pour les tâches plus lourdes, avec un chemin rapide pour les demandes simples
- Recherche sémantique locale (RAG) dans votre vault

<h3 align="center">Éditeur et graphe de connaissances</h3>

- Modes source Markdown / aperçu en direct / lecture
- Liens bidirectionnels avec `[[WikiLinks]]`
- LaTeX, Mermaid et coloration syntaxique
- Visualisation en graphe des relations entre notes

<h3 align="center">Lecture et capture</h3>

- Lecteur PDF intégré avec surlignage, soulignement et annotations
- Enregistrement des annotations en Markdown
- Envoi direct du contenu sélectionné dans le contexte IA

<h3 align="center">Capacités supplémentaires</h3>

- Notes vidéo Bilibili avec synchronisation des horodatages de danmaku
- Saisie vocale en temps réel
- Vues base de données (tableau / kanban)
- Synchronisation WebDAV
- Révision par flashcards
- 15 thèmes

<h3 align="center">Écosystème de plugins (Developer Preview)</h3>

- Chargement des plugins depuis les répertoires workspace / user / built-in
- Modèle de permissions à l'exécution pour les capacités des plugins
- API d'extension Slash Command
- Guide développeur : `docs/plugin-ecosystem.md`

---

<h2 align="center">Démarrage rapide</h2>

1. Installez Lumina Note depuis Releases.
2. Choisissez un dossier local comme vault au premier lancement.
3. Configurez un fournisseur de modèle et votre clé API dans le panneau IA, puis choisissez si besoin votre modèle préféré.
4. Créez votre première note et commencez à relier avec `[[WikiLinks]]`.

---

<h2 align="center">Guides</h2>

<h3 align="center">Guides recommandés</h3>

- English: `docs/user-flow.md`
- 简体中文: `docs/user-flow.zh-CN.md`
- 日本語: `docs/user-flow.ja.md`

<h3 align="center">Relais auto-hébergé (accès mobile inter-réseaux)</h3>

- English: `docs/self-host.md`
- 简体中文: `docs/self-host.zh-CN.md`

---

<h2 align="center">Compiler depuis les sources</h2>

Prérequis :

- Node.js 20+ (recommandé 20.11.1)
- 

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run dev
```

---

<h2 align="center">Pile technique</h2>

- Framework : Electron 41 (Chromium + Node.js in the main process)
- Frontend : React 18, TypeScript, Tailwind CSS
- Éditeur : CodeMirror 6
- État : Zustand
- Stockage vectoriel : SQLite

---

<h2 align="center">Composants open source</h2>

- Cœur de l'éditeur : [codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)

---

<h2 align="center">Contributeurs</h2>

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

<h2 align="center">Licence</h2>

[Apache License 2.0](LICENSE)

---

<h2 align="center">Star History</h2>

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
