<div align="center">

<img src="src-tauri/icons/icon.png" alt="Lumina Note Logo" width="120" height="120" />

# Lumina Note

**ローカルファーストの AI ノートアプリ**

ノートデータは完全にローカルに保存。AI Agent が自動で整理・検索・編集をサポート。

[![GitHub Release](https://img.shields.io/github/v/release/blueberrycongee/Lumina-Note?style=flat-square)](https://github.com/blueberrycongee/Lumina-Note/releases)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)

**Language**: [简体中文](./README.md) · [English](./README.en.md) · 日本語

</div>

---

## ダウンロード

[Releases](https://github.com/blueberrycongee/Lumina-Note/releases) から最新版をダウンロード：

| プラットフォーム | ダウンロード |
|------------------|--------------|
| Windows | `.msi` または `.exe` |
| macOS (Intel) | `x64.dmg` |
| macOS (Apple Silicon) | `aarch64.dmg` |

---

## スクリーンショット

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

## 主な機能

### AI アシスタント
- モード：チャット / Agent / Deep Research / Codex（サイドバーに VS Code 拡張を埋め込み）
- 意図を理解し、読み取り・編集・検索タスクを自動実行
- 複数のモデルプロバイダーに対応：OpenAI / Anthropic (Claude) / DeepSeek / Gemini / Moonshot / Groq / OpenRouter / Ollama
- ローカル RAG セマンティック検索でノート全体から回答

### エディタ
- ソース / ライブプレビュー / 閲覧の3モード
- 双方向リンク `[[WikiLinks]]` でナレッジネットワークを構築
- LaTeX 数式、Mermaid 図、コードハイライト
- 分割編集、画像ペースト

### ナレッジグラフ
- ノート間の関連を可視化
- フォルダ階層と双方向リンクを自動解析
- 物理エンジン駆動、ドラッグ＆ズーム対応

### PDF リーダー
- ハイライト、下線、注釈
- 注釈は Markdown として自動保存
- 選択したコンテンツを AI に送信

### その他の機能
- Bilibili 動画ノート（弾幕タイムスタンプ同期）
- 音声入力（リアルタイム文字起こし）
- データベースビュー（テーブル/カンバン）
- WebDAV 同期
- フラッシュカード復習
- 15種類のテーマ

---

## クイックスタート

1. アプリをダウンロードしてインストール
2. 初回起動時にノート保存用フォルダを選択
3. 右側の AI パネルでモデルと API Key を設定
4. 使用開始

---

## ソースからビルド

Node.js 20+（推奨 20.11.1）と Rust 1.70+ が必要

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
npm install
npm run tauri dev
```

---

## 技術スタック

- **フレームワーク**: Tauri v2 (Rust + WebView)
- **フロントエンド**: React 18, TypeScript, Tailwind CSS
- **エディタ**: CodeMirror 6
- **状態管理**: Zustand
- **ベクトルDB**: SQLite

---

## コントリビューター

<a href="https://github.com/blueberrycongee/Lumina-Note/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=blueberrycongee/Lumina-Note" />
</a>

---

## ライセンス

[Apache License 2.0](LICENSE)

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=blueberrycongee/Lumina-Note&type=Date)](https://star-history.com/#blueberrycongee/Lumina-Note&Date)
