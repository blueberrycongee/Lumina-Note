<div align="center">

<img src="build-resources/icon.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**로컬 우선 AI 노트 앱**

노트는 기본적으로 내 기기에 남고, Lumina Note 는 AI 로 지식을 작성하고 연결하고 검색하고 다듬을 수 있게 해 주면서도 데이터 통제권을 사용자에게 남겨 둡니다.

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

**언어**: [English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · 한국어 · [Español](./README.es.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Italiano](./README.it.md) · [Português (Brasil)](./README.pt-BR.md) · [Русский](./README.ru.md)

</div>

---

<h2 align="center">왜 Lumina Note 인가</h2>

- **로컬 우선 설계**: 볼트는 로컬에 보관되며, 어떤 내용을 모델 제공자에게 보낼지 직접 결정할 수 있습니다.
- **지식 작업 흐름 중심**: Markdown 편집, WikiLinks, 그래프 뷰, AI 검색이 하나의 시스템으로 이어집니다.
- **실제로 작업하는 AI**: `Agent` 모드가 실제 편집, 계획, 자동화 작업을 지원합니다.

---

<h2 align="center">다운로드</h2>

<div align="center">

최신 빌드는 [Releases](https://github.com/blueberrycongee/Lumina-Note/releases) 에서 받을 수 있습니다.

| 플랫폼 | 패키지 |
|--------|--------|
| Windows | `.msi` / `.exe` |
| macOS (Intel) | `x64.dmg` |
| macOS (Apple Silicon) | `aarch64.dmg` |

</div>

---

<h2 align="center">스크린샷</h2>

<p align="center">
  <img src="docs/screenshots/ai-agent.png" alt="AI Agent" width="800" />
</p>

<p align="center">
  <img src="docs/screenshots/knowledge-graph.png" alt="지식 그래프" width="800" />
</p>

<p align="center">
  <img src="docs/screenshots/editor-latex.png" alt="에디터" width="800" />
</p>

---

<h2 align="center">기능</h2>

<h3 align="center">AI 워크스페이스</h3>

- Agent 모드: 편집, 계획 및 작업 자동화
- 다중 모델 제공자 지원: OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- 무거운 작업은 오케스트레이션 Agent 런타임으로 보내고, 단순 요청은 빠른 경로를 유지
- 로컬 볼트를 대상으로 한 시맨틱 검색(RAG)

<h3 align="center">에디터와 지식 그래프</h3>

- Markdown 소스 / 라이브 프리뷰 / 읽기 모드
- `[[WikiLinks]]` 양방향 링크
- LaTeX, Mermaid, 코드 하이라이팅
- 노트 관계를 시각화하는 그래프 뷰

<h3 align="center">읽기와 수집</h3>

- 하이라이트, 밑줄, 주석을 지원하는 내장 PDF 리더
- 주석 결과를 Markdown 으로 저장
- 선택한 내용을 바로 AI 컨텍스트로 전송

<h3 align="center">추가 기능</h3>

- Bilibili 비디오 노트(탄막 타임스탬프 동기화)
- 실시간 음성 입력
- 데이터베이스 뷰(테이블 / 칸반)
- WebDAV 동기화
- 플래시카드 복습
- 15개 테마

<h3 align="center">플러그인 생태계 (Developer Preview)</h3>

- workspace / user / built-in 디렉터리에서 플러그인 로드
- 플러그인 기능을 위한 런타임 권한 모델
- Slash Command 확장 API
- 개발자 가이드: `docs/plugin-ecosystem.md`

---

<h2 align="center">빠른 시작</h2>

1. Releases 에서 Lumina Note 를 설치합니다.
2. 처음 실행할 때 로컬 폴더를 볼트로 선택합니다.
3. AI 패널에서 모델 제공자와 API 키를 설정하고, 필요하면 원하는 모델을 선택합니다.
4. 첫 노트를 만들고 `[[WikiLinks]]` 로 연결을 시작합니다.

---

<h2 align="center">가이드</h2>

<h3 align="center">추천 사용자 가이드</h3>

- English: `docs/user-flow.md`
- 简体中文: `docs/user-flow.zh-CN.md`
- 日本語: `docs/user-flow.ja.md`

<h3 align="center">셀프호스트 릴레이 (교차 네트워크 모바일 접속)</h3>

- English: `docs/self-host.md`
- 简体中文: `docs/self-host.zh-CN.md`

---

<h2 align="center">소스에서 빌드</h2>

요구 사항:

- Node.js 20+ (권장 20.11.1)
- 

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run dev
```

---

<h2 align="center">기술 스택</h2>

- 프레임워크: Electron 41 (Chromium + Node.js in the main process)
- 프론트엔드: React 18, TypeScript, Tailwind CSS
- 에디터: CodeMirror 6
- 상태 관리: Zustand
- 벡터 저장소: SQLite

---

<h2 align="center">오픈 소스 컴포넌트</h2>

- 에디터 코어: [codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)
- Rust 오케스트레이션 런타임: [forge](https://github.com/blueberrycongee/forge)

---

<h2 align="center">기여자</h2>

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

<h2 align="center">라이선스</h2>

[Apache License 2.0](LICENSE)

---

<h2 align="center">Star History</h2>

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
