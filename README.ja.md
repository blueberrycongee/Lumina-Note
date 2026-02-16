<div align="center">

<img src="src-tauri/icons/128x128.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**ローカルファーストの AI ノートアプリ**

ノートはデバイス上に保持しながら、AI で整理・検索・編集・調査を進められる知識ワークスペースです。

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

**Language**: [English](./README.md) · [简体中文](./README.zh-CN.md) · 日本語

</div>

---

<h2 align="center">Lumina Note の特長</h2>

- **ローカルファースト**: Vault はローカル管理。モデルに送る範囲を自分で決められます。
- **知識中心の設計**: エディタ、WikiLinks、グラフが一体で機能します。
- **実行できる AI**: Chat だけでなく Agent / Deep Research / Codex で実作業まで対応。

---

<h2 align="center">ダウンロード</h2>

<div align="center">

最新版は [Releases](https://github.com/blueberrycongee/Lumina-Note/releases) から取得できます。

| プラットフォーム | パッケージ |
|------------------|------------|
| Windows | `.msi` / `.exe` |
| macOS (Intel) | `x64.dmg` |
| macOS (Apple Silicon) | `aarch64.dmg` |

</div>

---

<h2 align="center">スクリーンショット</h2>

<p align="center">
  <img src="docs/screenshots/ai-agent.png" alt="AI Agent" width="800" />
</p>

<p align="center">
  <img src="docs/screenshots/knowledge-graph.png" alt="ナレッジグラフ" width="800" />
</p>

<p align="center">
  <img src="docs/screenshots/editor-latex.png" alt="エディタ" width="800" />
</p>

---

<h2 align="center">機能</h2>

<h3 align="center">AI ワークスペース</h3>
- モード: `Chat` / `Agent` / `Deep Research` / `Codex`（サイドバー埋め込み VS Code 拡張）
- 対応プロバイダ: OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- Vault 全体を対象にしたローカル意味検索（RAG）

<h3 align="center">エディタとナレッジグラフ</h3>
- Markdown ソース / ライブプレビュー / 閲覧モード
- `[[WikiLinks]]` による双方向リンク
- LaTeX、Mermaid、コードハイライト
- ノート間の関係を可視化するグラフビュー

<h3 align="center">読書・収集</h3>
- PDF リーダー（ハイライト、下線、注釈）
- 注釈を Markdown として保存
- 選択した内容を AI コンテキストへ送信

<h3 align="center">その他</h3>
- Bilibili 動画ノート（弾幕タイムスタンプ同期）
- 音声入力（リアルタイム文字起こし）
- データベースビュー（テーブル / カンバン）
- WebDAV 同期
- フラッシュカード復習
- 15 テーマ

<h3 align="center">プラグインエコシステム（開発者プレビュー）</h3>
- workspace / user / built-in ディレクトリからプラグインを読み込み
- ランタイム権限モデル
- Slash Command 拡張 API
- 開発者向けガイド: `docs/plugin-ecosystem.md`

---

<h2 align="center">クイックスタート</h2>

1. Releases からアプリをインストール
2. 初回起動でローカルフォルダを Vault に指定
3. 右側 AI パネルでモデルと API Key を設定
4. 最初のノートを作成し、`[[WikiLinks]]` で関連付け

---

<h2 align="center">ガイド</h2>

<h3 align="center">まず読むガイド</h3>
- 日本語: `docs/user-flow.ja.md`
- English: `docs/user-flow.md`
- 简体中文: `docs/user-flow.zh-CN.md`

<h3 align="center">セルフホスト中継（クロスネットワークのモバイルアクセス）</h3>
- English: `docs/self-host.md`
- 简体中文: `docs/self-host.zh-CN.md`

---

<h2 align="center">ソースからビルド</h2>

必要環境:
- Node.js 20+（推奨 20.11.1）
- Rust 1.70+

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run tauri dev
```

---

<h2 align="center">技術スタック</h2>

- フレームワーク: Tauri v2 (Rust + WebView)
- フロントエンド: React 18, TypeScript, Tailwind CSS
- エディタ: CodeMirror 6
- 状態管理: Zustand
- ベクトルストレージ: SQLite

---

<h2 align="center">オープンソースコンポーネント</h2>

- エディタコア: [codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)
- Rust オーケストレーションランタイム: [forge](https://github.com/blueberrycongee/forge)

---

<h2 align="center">コントリビューター</h2>

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

<h2 align="center">ライセンス</h2>

[Apache License 2.0](LICENSE)

---

<h2 align="center">Star History</h2>

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
