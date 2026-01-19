# Typesetting Engine Progress Log

Plan: docs/TYPESETTING_ENGINE_PLAN.md

## Entries
- 2026-01-20: Initialized progress log.
- 2026-01-20
  - Task completed: M0 -> 明确 PDF 输出与打印流程（预览 -> PDF -> 打印）
  - Key decisions: Preview uses the same PDF render pipeline; print only from exported PDF; default to no scaling.
  - Files changed: docs/TYPESETTING_ENGINE_PLAN.md; docs/TYPESETTING_ENGINE_PROGRESS.md
  - Blockers/next steps: Define WYSIWYG acceptance thresholds; finalize default tech stack decision.
- 2026-01-20
  - Task completed: M0 -> 固化技术栈选择并在“默认技术栈”中标记最终决定
  - Key decisions: Locked the default tech stack (M0); record any changes in the same section.
  - Files changed: docs/TYPESETTING_ENGINE_PLAN.md; docs/TYPESETTING_ENGINE_PROGRESS.md
  - Blockers/next steps: Define WYSIWYG acceptance thresholds. Tests not run (docs-only).
- 2026-01-20
  - Task completed: M0 -> Write WYSIWYG acceptance thresholds (pixel/mm)
  - Key decisions: Added explicit page size, margin/header/footer, line spacing, and page-break deltas; used 96dpi as the px reference.
  - Files changed: docs/TYPESETTING_ENGINE_PLAN.md; docs/TYPESETTING_ENGINE_PROGRESS.md
  - Blockers/next steps: Tests not run (docs-only).
- 2026-01-20
  - Task completed: M1 -> Define document node types (Paragraph/Heading/List/Table/Image)
  - Key decisions: Drafted core block/inline node list with optional ids and style refs placeholders.
  - Files changed: docs/TYPESETTING_ENGINE_PLAN.md; docs/TYPESETTING_ENGINE_PROGRESS.md
  - Blockers/next steps: Define style structs and ops; tests not run (docs-only).

- 2026-01-20
  - Task completed: M1 -> Define style structs (FontStyle/ParagraphStyle/PageStyle)
  - Key decisions: Drafted minimal JSON-friendly fields with explicit units for lengths; added ids for style refs.
  - Files changed: docs/TYPESETTING_ENGINE_PLAN.md; docs/TYPESETTING_ENGINE_PROGRESS.md
  - Blockers/next steps: Define minimal ops; draft JSON schema; tests not run (docs-only).

- 2026-01-20
  - Task completed: M1 -> Design minimal ops (insert/delete/applyStyle)
  - Key decisions: Added Position/Range-based ops; split applyStyle into inline marks vs paragraph style refs; use UTF-16 offsets for editor compatibility.
  - Files changed: docs/TYPESETTING_ENGINE_PLAN.md; docs/TYPESETTING_ENGINE_PROGRESS.md
  - Blockers/next steps: Draft the JSON schema for serialization; tests not run (docs-only).
- 2026-01-20
  - Task completed: M1 -> 确定序列化格式（JSON schema 草案）
  - Key decisions: Added JSON Schema with 	ype discriminators for block/inline unions; included optional styles collections for font/paragraph/page.
  - Files changed: docs/TYPESETTING_ENGINE_PLAN.md; docs/TYPESETTING_ENGINE_PROGRESS.md
  - Blockers/next steps: Align in-memory model vs serialization 	ype tags; tests not run (docs-only).

- 2026-01-20
  - Task completed: M2 -> Font discovery (list system fonts + fallback rules)
  - Key decisions: Enumerate fonts via OS APIs; resolve missing glyphs per-glyph; fallback order user -> doc -> system -> open-source.
  - Files changed: docs/TYPESETTING_ENGINE_PLAN.md; docs/TYPESETTING_ENGINE_PROGRESS.md
  - Blockers/next steps: Implement font loading and default zh/en mapping; tests not run (docs-only).
- 2026-01-20
  - Task completed: M2 -> 瀛椾綋鍔犺浇锛氫粠璺緞鍔犺浇骞剁紦瀛樺害閲?
  - Key decisions: Parse units_per_em/ascender/descender/line_gap via ttf-parser; cache by path with shared font bytes; use KaTeX font fixture for tests.
  - Files changed: src-tauri/src/typesetting/font_manager.rs; src-tauri/src/typesetting/mod.rs; src-tauri/src/lib.rs; src-tauri/Cargo.toml; src-tauri/tests/fixtures/katex-main-regular.ttf
  - Blockers/next steps: WSL distro not found; run WSL test/lint/CI once available.
- 2026-01-20
  - Task completed: M2 -> Font mapping table (zh/en default mapping)
  - Key decisions: Default mapping uses SimSun (zh) + Times New Roman (en); resolve trims whitespace and falls back to the other mapping or defaults when missing.
  - Files changed: src-tauri/src/typesetting/font_manager.rs; src-tauri/src/typesetting/mod.rs; docs/TYPESETTING_ENGINE_PLAN.md; docs/TYPESETTING_ENGINE_PROGRESS.md
  - Blockers/next steps: WSL distro not found; run WSL cargo test/full lint/CI when available.
