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
