# Lumina Note Typesetting Engine Plan (WYSIWYG Print Target)

Goal: Implement "paper-level layout + AI layout instructions" in Lumina Note, and guarantee preview == print on the same machine (WYSIWYG). After each milestone, mark completion in this document.

## Background and current capabilities
- Local-first + Tauri desktop app
- AI Agent + RAG semantic search
- Markdown editor (CodeMirror) + LaTeX/Mermaid/code highlighting
- Knowledge graph, PDF annotations, database views (table/kanban), WebDAV sync, etc.

## Current tech stack (selection constraints)
- Framework: Tauri v2 (Rust + WebView)
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS
- Editor: CodeMirror 6 (Markdown)
- State: Zustand
- Data: SQLite
- PDF: pdfjs-dist/react-pdf, jsPDF
- Tests: Vitest (unit), Playwright core (e2e)

## Local test setup (Windows)
- WSL is no longer required for tests; run locally on Windows.
- Rust toolchain is installed but `cargo` is not in PATH.
- Use the full path when running Rust tests:
  - `C:\Users\10758\.cargo\bin\cargo.exe test`
  - `C:\Users\10758\.cargo\bin\cargo.exe fmt`
  - `C:\Users\10758\.cargo\bin\cargo.exe clippy`
- Optional: add `C:\Users\10758\.cargo\bin` to PATH to simplify commands.

## Core goals (MVP)
- Paper-level layout: A4/Letter, margins, headers/footers, pagination, precise paragraph/font control.
- AI layout instructions: set font and size per language (e.g., SimSun + Times New Roman), line height, indent, etc.
- Preview == print: always use **PDF (embedded fonts)** as the print source.
- `.docx` support is "editable mode" and only covers common subsets (paragraphs/headings/lists/tables/images/headers/footers).
- Engine can be extracted as an independent project for later open-source release and reuse.

## Non-goals (explicitly out of scope)
- `.doc` legacy format
- Complex Word features: macros, revisions, fields, complex footnotes/endnotes, floating wraps, nested complex tables, etc.
- 100% cross-platform identical output (Word itself cannot guarantee this); only same-machine preview == print.

## Key strategies
- **Deterministic layout**: same input + same fonts + same environment => same output.
- **Font control**: allow system fonts but prefer OSS fallbacks and font mapping; printing always embeds fonts into PDF.
- **Structured layout instructions**: AI outputs stable JSON/DSL, then engine executes.

## PDF output and print flow (explicit)
- Preview: use the same layout + PDF render pipeline; preview pages come from PDF render output.
- Export: generate a single embedded-font PDF as the print and delivery baseline.
- Print: only print from exported PDF; never print directly from DOM/Canvas; default to no scaling.

## Print settings guide (M8 draft)
- Print the exported PDF only; do not print from the preview UI.
- In the print dialog, set scaling to "Actual size" / 100% (disable "Fit to page").
- Ensure the printer paper size matches the PDF page size (A4 vs Letter).
- Disable any "auto-rotate/center" options that alter page geometry.
- Keep driver "borderless" or margin adjustments off unless explicitly calibrated.

## Margin calibration flow (M8 draft)
- Generate a calibration PDF with crop marks and crosshairs at known offsets (e.g., 10mm from each edge).
- Print at 100% actual size using the target printer and paper size.
- Measure the printed offset from each crosshair to the paper edge; record dx/dy in mm for top-left.
- Save per-printer profile: `{ paperSize, dxMm, dyMm, measuredAt }`.
- Apply offsets in preview/print alignment guides (do not scale content; only compensate origin).

---

## Default tech stack (modifiable, default is binding)
> To keep the loop moving, lock the default tech path first.
- Final decision (M0): lock the default stack below; any change must be recorded in this section with reasons.
- Language: Rust (core typesetting engine) + TS/React (UI preview)
- Text shaping: HarfBuzz (shaping), use rustybuzz or harfbuzz-rs mature bindings
- Font discovery: font-kit or system APIs (Windows DirectWrite / macOS CoreText / Linux fontconfig)
- PDF output: pdf-writer or lopdf (prefer pdf-writer), embed fonts
- Rendering: Skia (skia-safe) or custom vector renderer; default to PDF as the render baseline

If the stack changes, update this section and record the reason.

---

## Directory layout draft (engine can be extracted)
```
engine/
  Cargo.toml
  src/
    model/            # document model and styles
    text/             # font loading, shaping, line breaking
    layout/           # paragraph layout, pagination
    render/           # renderer and PDF output
    io_docx/          # docx subset import/export
    ai/               # AI instruction parsing and mapping
  tests/
  fixtures/
  golden/
```

---

## Architecture (modules)
1) Document model
   - Block/Inline tree, style inheritance, paragraph/inline styles
   - Operation model (insert/delete/style change) + history
2) Font + Text shaping
   - Font loading/fallback, glyph metrics
   - CJK + Latin mixed runs, inline breaking rules
3) Layout engine
   - Line layout, paragraph layout, pagination
   - Widow/orphan control, header/footer layout
4) Render + Export
   - Paginated preview rendering
   - PDF export (embedded fonts)
   - Print path uses PDF output
5) AI layout instruction pipeline (AI -> Layout Ops)
   - Natural language -> structured schema
   - Validation, normalization, application to document
6) Import/Export (Docx subset IO)
   - `.docx` subset import + style mapping
   - `.docx` subset export (editable mode)

---

## AI layout instruction schema (draft)
> AI does not generate CSS/HTML directly. It only generates structured instructions to reduce non-determinism.

```json
{
  "page": { "size": "A4", "margin": "25mm", "headerHeight": "12mm" },
  "typography": {
    "zh": { "font": "SimSun", "size": "12pt" },
    "en": { "font": "Times New Roman", "size": "12pt" }
  },
  "paragraph": {
    "lineHeight": 1.6,
    "indent": "2em",
    "align": "justify"
  }
}
```

---

## AI intent/DSL strategy (agent-friendly editing)
Goal: Make AI-driven edits as simple as editing Markdown, while preserving Word-like manual micro-editing.

Principles:
- Provide a **high-level intent DSL** (declarative, validated, no loops/conditions).
- Compile intent into **document ops** (replayable, reversible).
- Keep tool-calls minimal: a few high-level actions like `apply_intent`, `preview_intent`, `diff_intent`.
- Preserve manual overrides: AI changes should not overwrite locked or manually overridden fields.

Structure:
- Intent layer: page/typography/paragraph/pagination rules.
- Ops layer: concrete operations against the document model.
- Execution: DSL -> ops -> layout engine -> preview/PDF.

Long-term direction:
- AI outputs DSL only; the system refuses raw fine-grained edits.
- Tools remain as execution channels, not editing surfaces.

---

## AI use cases (priority)
> Used to prioritize implementation work (high to low).

### P0: Natural language layout
- User prompt: Use A4, margin 25mm, header 12mm, footer 12mm, Chinese SimSun 12pt, English Times New Roman 12pt, line height 1.5, first-line indent 2 characters, Heading 1 centered bold 16pt, Heading 2 left 14pt, header "Research Report", centered page numbers.

### P0: Smart pagination fixups
- User prompt: Avoid widows/orphans, avoid headings at page bottom, keep figures and captions on the same page; if needed, adjust spacing and line height slightly.

### P1: Batch normalization
- User prompt: Set all body text to SimSun 12pt and English to Times New Roman; keep heading levels but change sizes to 16/14/12pt and justify.

### P1: Template-based report
- User prompt: Apply the company report template: margins top 25mm bottom 20mm left/right 25mm, header 12mm, footer 12mm, body justified, headings and table of contents auto-generated.

### P2: Bilingual layout
- User prompt: Chinese paragraphs use SimSun 12pt and justify; English paragraphs use Times New Roman 12pt and left align; section titles show Chinese and English on separate lines.

### P2: Print delivery
- User prompt: Generate a printable version, output as embedded-font PDF, keep preview and print identical.

---

## Docx subset scope (MVP)
| Category | Supported | Notes |
|---|---|---|
| Paragraphs | Yes | alignment, indent, line spacing, space before/after |
| Headings | Yes | H1-H3 mapping |
| Fonts | Yes | zh/en fonts, sizes, bold/italic |
| Lists | Yes | ordered/unordered |
| Tables | Yes | simple tables, no complex merges or cross-page |
| Images | Yes | inline/paragraph-level |
| Headers/footers | Yes | text + page numbers |
| Footnotes/endnotes | No | out of MVP |
| Revisions/comments | No | out of MVP |

---

## Milestone plan (detailed)

> Each milestone includes Scope / Deliverables / How to verify / Expected outcome

| Milestone | Scope | Deliverables | How to verify | Expected outcome |
|---|---|---|---|---|
| M0: Goals and scope | MVP scope, non-goals, output strategy | Requirements doc + schema draft + font strategy draft | Review and freeze list | Clear scope |
| M1: Document model | Block/Inline tree, style inheritance, ops model | Model + JSON serialization | Basic edit ops replay | Stable structure |
| M2: Font layer | Load/fallback/measure | Font manager + fallback table | Missing fonts are handled consistently | Font control |
| M3: Inline layout | Inline layout, line breaking, mixed runs | Line layout engine | Baseline line widths stable | Inline layout ready |
| M4: Paragraph layout | Indent, align, line height | Paragraph layout | Typical paragraphs correct | Paragraph layout ready |
| M5: Pagination | Margins, pagination, headers/footers | Pagination engine | Stable pagination for same input | Pagination ready |
| M6: Preview rendering | Paginated preview view | Page viewer | Preview matches layout | Visual preview ready |
| M7: PDF output | PDF render + font embedding | PDF exporter | Preview aligns with PDF | Print foundation ready |
| M8: Print calibration | Print margin/scale strategy | Print setup + calibration guide | Print matches preview | Same-machine WYSIWYG |
| M9: AI layout | AI parse + apply | Schema validation + ops mapping | Instructions reproducible + reversible | AI layout ready |
| M10: Docx import | `.docx` subset parse | Importer + mapping table | Common docx import | Editable import |
| M11: Docx export | `.docx` subset export | Exporter + compatibility notes | Word opens editable | Editable export |
| M12: Tests + perf | golden PDFs + layout diff | Regression set + perf metrics | Reproducible in CI | Stable and scalable |

---

## Milestone task breakdown (directly executable)
> Each item is the smallest "single-loop complete" task.

### M0 Goals and scope
- [x] Lock the default tech stack in "Default tech stack"
- [x] Clarify PDF output and print flow (preview -> PDF -> print)
- [x] Define WYSIWYG acceptance thresholds (px/mm)

### M1 Document model
- [x] Define document node types (Paragraph/Heading/List/Table/Image)
- [x] Define style structs (FontStyle/ParagraphStyle/PageStyle)
- [x] Design minimal ops (insert/delete/applyStyle)
- [x] Define serialization format (JSON schema draft)

### M2 Font layer
- [x] Font discovery: list system fonts + fallback rules
- [x] Font loading: load from path and cache metrics
- [x] Font mapping table: default zh/en mapping

### M3 Inline layout
- [x] Integrate shaping and get glyph runs
- [x] Implement line breaking (width-based)
- [x] Implement mixed-script merge (CJK + Latin)

### M4 Paragraph layout
- [x] Paragraph line height and alignment (left/right/center/justify)
- [x] First-line indent and space before/after

### M5 Pagination
- [x] Page model (paper size, margins, content box)
- [x] Header/footer layout
- [x] Simple pagination (flow-based page breaks)
- [x] Basic widow/orphan handling (minimal)

### M6 Preview rendering
- [x] Render pipeline: layout tree -> preview pages
- [x] Basic zoom and paginated browsing

### M7 PDF output
- [x] PDF document generation
- [x] Font embedding and font subset
  - [x] PDF/preview alignment verification

### M8 Print calibration
- [x] Print settings guide (disable scaling, paper match)
- [x] Margin calibration flow (record device offsets)

### M9 AI layout
- [x] Define AI schema validation (zod)
- [x] Parse natural language -> schema (minimal rules)
- [x] Apply schema -> document styles

### M10 Docx import
- [x] Parse paragraphs/headings/font styles
- [x] Parse lists, simple tables, images
- [x] Import headers/footers

### M11 Docx export
- [x] Export paragraphs/headings/font styles
- [x] Export lists, simple tables, images
- [x] Export headers/footers and page numbers

### M12 Tests and performance
- [x] Golden fixtures: short/long/bilingual docs
- [x] Layout diff tool (pixel or layout metrics)
- [x] Performance baselines (pagination time, PDF time)

---

## WYSIWYG print acceptance (same machine)
- Same machine + same font environment: preview and exported PDF match (size/page breaks/line spacing delta < 1px).
- Print from exported PDF with no scaling; print matches preview.
- Embedded fonts guarantee cross-device visual consistency (even if editability drops).
- Acceptance thresholds (same machine, preview vs exported PDF):
- Page size delta <= 0.2mm (<= 1px @ 96dpi).
- Margin box delta <= 0.2mm; header/footer baseline delta <= 0.2mm.
- Line spacing delta <= 0.2mm; glyph baseline delta <= 1px.
- Page break positions identical; max drift <= 1px.

---

## Risks and notes
- Font licensing: commercial fonts cannot be redistributed; use system fonts or OSS alternatives.
- Word compatibility: `.docx` is reflowable; edit mode cannot guarantee absolute fidelity.
- CJK layout is complex: line breaking, punctuation compression, size mapping need iterative work.

## M1 Document Model Draft (nodes + inline types)
- Document: { blocks: Block[] }
- Block: Paragraph | Heading | List | Table | Image
- Paragraph: { inlines: Inline[], style: ParagraphStyleRef? }
- Heading: { level: 1..6, inlines: Inline[], style: ParagraphStyleRef? }
- List: { ordered: boolean, items: ListItem[] }
- ListItem: { blocks: Block[] }
- Table: { rows: TableRow[] }
- TableRow: { cells: TableCell[] }
- TableCell: { blocks: Block[], row_span?: number, col_span?: number }
- Image: { src: string, alt?: string, width?: number, height?: number }

- Inline: Text | LineBreak | InlineCode | Emphasis | Strong | Link
- Text: { text: string, marks?: TextMark[] }
- TextMark: Bold | Italic | Underline | Strikethrough | Code
- Link: { href: string, inlines: Inline[] }

Notes:
- All nodes may carry optional `id` for ops and history tracking.
- Style refs are placeholders until `FontStyle`/`ParagraphStyle`/`PageStyle` are defined.

## M1 Style Struct Draft (FontStyle/ParagraphStyle/PageStyle)
- FontStyle: { id?: string, font_family: string, size_pt: number, weight: 100..900, italic: boolean, underline: boolean, color: "#RRGGBB" }
- ParagraphStyle: { id?: string, align: "left|right|center|justify", line_height: number, indent_first_line: string, space_before: string, space_after: string, keep_with_next: boolean, widows: number, orphans: number }
- PageStyle: { id?: string, size: "A4|Letter|Custom", width_mm?: number, height_mm?: number, margin_mm: { top: number, right: number, bottom: number, left: number }, header_height_mm: number, footer_height_mm: number, column_count: number, column_gap_mm: number }
Notes:
- Length fields use explicit units like "pt", "mm", or "em".
- ParagraphStyleRef/PageStyleRef point to these ids.

## M1 Minimal Ops Draft (insert/delete/applyStyle)
- Position: { block: number, inline: number, offset: number }
- Range: { anchor: Position, focus: Position }

- Op: InsertText | DeleteRange | ApplyInlineMarks | ApplyParagraphStyleRef
- InsertText: { pos: Position, text: string }
- DeleteRange: { range: Range }
- ApplyInlineMarks: { range: Range, add: TextMark[], remove: TextMark[] }
- ApplyParagraphStyleRef: { block: number, style_ref: string }

Notes:
- Positions address Document.blocks[block] and Paragraph/Heading inlines[inline]; offset is UTF-16 code unit index.
- Range order is normalized before applying ops; empty range is a no-op for delete.
- applyStyle is split for inline marks vs paragraph style refs; page style changes are out of scope for M1.

## M1 Serialization JSON Schema Draft
> Minimal, JSON-friendly schema to serialize the M1 document model. Discriminators use `type` for blocks/inlines.
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://lumina-note/schema/document.v1.json",
  "title": "Lumina Document v1 (M1)",
  "type": "object",
  "required": ["blocks"],
  "properties": {
    "blocks": { "type": "array", "items": { "$ref": "#/$defs/block" } },
    "styles": {
      "type": "object",
      "properties": {
        "fonts": { "type": "array", "items": { "$ref": "#/$defs/fontStyle" } },
        "paragraphs": { "type": "array", "items": { "$ref": "#/$defs/paragraphStyle" } },
        "pages": { "type": "array", "items": { "$ref": "#/$defs/pageStyle" } }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "$defs": {
    "block": {
      "oneOf": [
        { "$ref": "#/$defs/paragraph" },
        { "$ref": "#/$defs/heading" },
        { "$ref": "#/$defs/list" },
        { "$ref": "#/$defs/table" },
        { "$ref": "#/$defs/image" }
      ]
    },
    "inline": {
      "oneOf": [
        { "$ref": "#/$defs/text" },
        { "$ref": "#/$defs/lineBreak" },
        { "$ref": "#/$defs/inlineCode" },
        { "$ref": "#/$defs/emphasis" },
        { "$ref": "#/$defs/strong" },
        { "$ref": "#/$defs/link" }
      ]
    },
    "paragraph": {
      "type": "object",
      "required": ["type", "inlines"],
      "properties": {
        "type": { "const": "paragraph" },
        "id": { "type": "string" },
        "inlines": { "type": "array", "items": { "$ref": "#/$defs/inline" } },
        "style_ref": { "type": "string" }
      },
      "additionalProperties": false
    },
    "heading": {
      "type": "object",
      "required": ["type", "level", "inlines"],
      "properties": {
        "type": { "const": "heading" },
        "id": { "type": "string" },
        "level": { "type": "integer", "minimum": 1, "maximum": 6 },
        "inlines": { "type": "array", "items": { "$ref": "#/$defs/inline" } },
        "style_ref": { "type": "string" }
      },
      "additionalProperties": false
    },
    "list": {
      "type": "object",
      "required": ["type", "ordered", "items"],
      "properties": {
        "type": { "const": "list" },
        "id": { "type": "string" },
        "ordered": { "type": "boolean" },
        "items": { "type": "array", "items": { "$ref": "#/$defs/listItem" } }
      },
      "additionalProperties": false
    },
    "listItem": {
      "type": "object",
      "required": ["blocks"],
      "properties": {
        "blocks": { "type": "array", "items": { "$ref": "#/$defs/block" } }
      },
      "additionalProperties": false
    },
    "table": {
      "type": "object",
      "required": ["type", "rows"],
      "properties": {
        "type": { "const": "table" },
        "id": { "type": "string" },
        "rows": { "type": "array", "items": { "$ref": "#/$defs/tableRow" } }
      },
      "additionalProperties": false
    },
    "tableRow": {
      "type": "object",
      "required": ["cells"],
      "properties": {
        "cells": { "type": "array", "items": { "$ref": "#/$defs/tableCell" } }
      },
      "additionalProperties": false
    },
    "tableCell": {
      "type": "object",
      "required": ["blocks"],
      "properties": {
        "blocks": { "type": "array", "items": { "$ref": "#/$defs/block" } },
        "row_span": { "type": "integer", "minimum": 1 },
        "col_span": { "type": "integer", "minimum": 1 }
      },
      "additionalProperties": false
    },
    "image": {
      "type": "object",
      "required": ["type", "src"],
      "properties": {
        "type": { "const": "image" },
        "id": { "type": "string" },
        "src": { "type": "string" },
        "alt": { "type": "string" },
        "width": { "type": "number" },
        "height": { "type": "number" }
      },
      "additionalProperties": false
    },
    "text": {
      "type": "object",
      "required": ["type", "text"],
      "properties": {
        "type": { "const": "text" },
        "text": { "type": "string" },
        "marks": { "type": "array", "items": { "$ref": "#/$defs/textMark" } }
      },
      "additionalProperties": false
    },
    "lineBreak": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "const": "line_break" }
      },
      "additionalProperties": false
    },
    "inlineCode": {
      "type": "object",
      "required": ["type", "text"],
      "properties": {
        "type": { "const": "inline_code" },
        "text": { "type": "string" }
      },
      "additionalProperties": false
    },
    "emphasis": {
      "type": "object",
      "required": ["type", "inlines"],
      "properties": {
        "type": { "const": "emphasis" },
        "inlines": { "type": "array", "items": { "$ref": "#/$defs/inline" } }
      },
      "additionalProperties": false
    },
    "strong": {
      "type": "object",
      "required": ["type", "inlines"],
      "properties": {
        "type": { "const": "strong" },
        "inlines": { "type": "array", "items": { "$ref": "#/$defs/inline" } }
      },
      "additionalProperties": false
    },
    "link": {
      "type": "object",
      "required": ["type", "href", "inlines"],
      "properties": {
        "type": { "const": "link" },
        "href": { "type": "string" },
        "inlines": { "type": "array", "items": { "$ref": "#/$defs/inline" } }
      },
      "additionalProperties": false
    },
    "textMark": {
      "type": "string",
      "enum": ["bold", "italic", "underline", "strikethrough", "code"]
    },
    "fontStyle": {
      "type": "object",
      "required": ["font_family", "size_pt", "weight", "italic", "underline", "color"],
      "properties": {
        "id": { "type": "string" },
        "font_family": { "type": "string" },
        "size_pt": { "type": "number" },
        "weight": { "type": "integer", "minimum": 100, "maximum": 900 },
        "italic": { "type": "boolean" },
        "underline": { "type": "boolean" },
        "color": { "type": "string", "pattern": "^#([0-9a-fA-F]{6})$" }
      },
      "additionalProperties": false
    },
    "paragraphStyle": {
      "type": "object",
      "required": ["align", "line_height", "indent_first_line", "space_before", "space_after", "keep_with_next", "widows", "orphans"],
      "properties": {
        "id": { "type": "string" },
        "align": { "type": "string", "enum": ["left", "right", "center", "justify"] },
        "line_height": { "type": "number" },
        "indent_first_line": { "type": "string" },
        "space_before": { "type": "string" },
        "space_after": { "type": "string" },
        "keep_with_next": { "type": "boolean" },
        "widows": { "type": "integer", "minimum": 0 },
        "orphans": { "type": "integer", "minimum": 0 }
      },
      "additionalProperties": false
    },
    "pageStyle": {
      "type": "object",
      "required": ["size", "margin_mm", "header_height_mm", "footer_height_mm", "column_count", "column_gap_mm"],
      "properties": {
        "id": { "type": "string" },
        "size": { "type": "string", "enum": ["A4", "Letter", "Custom"] },
        "width_mm": { "type": "number" },
        "height_mm": { "type": "number" },
        "margin_mm": {
          "type": "object",
          "required": ["top", "right", "bottom", "left"],
          "properties": {
            "top": { "type": "number" },
            "right": { "type": "number" },
            "bottom": { "type": "number" },
            "left": { "type": "number" }
          },
          "additionalProperties": false
        },
        "header_height_mm": { "type": "number" },
        "footer_height_mm": { "type": "number" },
        "column_count": { "type": "integer", "minimum": 1 },
        "column_gap_mm": { "type": "number" }
      },
      "additionalProperties": false
    }
  }
}
```

## M2 Font Discovery Draft (system list + fallback rules)
- Enumerate installed fonts via OS APIs (DirectWrite/CoreText/fontconfig); normalize family/style metadata.
- Build fallback chains per script (Latin, CJK, Symbol/Emoji); resolve per-glyph when shaping reports missing glyphs.
- Prefer user-selected fonts, then document styles, then system defaults, then open-source fallbacks (e.g., Noto Sans CJK, Noto Serif).
- Edge cases: missing CJK fonts, mixed-script runs, symbol-only glyphs, fallback loops; log chosen fallback in debug builds.

---

## Post-MVP roadmap (M13+)
> These milestones extend beyond the current MVP and are suitable for longer loops.

### M13 Product integration
- [x] Add a typesetting document entry point in the app (new doc type + open route).
- [x] Create a typesetting document store (document model, style refs, layout cache).
- [x] Integrate engine preview UI (paged view, zoom controls, page navigation, layout summary).
- [ ] Wire document model edits to layout pipeline (incremental reflow + debounced recompute).
- [ ] Bridge Tauri commands for preview metrics and layout runs (invoke wrappers + error handling).
- [ ] Connect export/print UI to PDF output (single source of truth).
- [x] Docx open pipeline: detect `.docx`, unzip, read document/header/footer XML, map styles, images.
- [ ] Provide a Word-like editing UI (typing, selection, caret, basic formatting).
- [ ] Map editor actions to document ops (insert/delete, apply paragraph/inline styles).
- [ ] Persist document model to storage (save/load) and export to docx/PDF.
- [x] Add a minimal "apply intent" entrypoint for AI-driven layout changes.
- [x] Expose doc editing only in Lumina Note Codex mode (feature flag + UI gating).
- [ ] Create a dedicated Codex skill for document ops (apply_intent, insert_text, apply_style, selection ops).

### M14 Editing UX and overrides
- [ ] Style inspector: show computed style vs local override.
- [ ] Lock/override semantics: AI edits must not overwrite locked fields.
- [ ] Selection mapping: map UI selection to document ops reliably.
- [ ] Undo/redo across AI and manual edits with stable diff summaries.

### M15 Advanced layout features
- [ ] Multi-column layout (section-level columns).
- [ ] Floating images/text wrap (basic anchors and wrap modes).
- [ ] Footnotes/endnotes (simple flow, no complex numbering yet).
- [ ] Table pagination (split rows across pages, repeat header rows).

### M16 Docx compatibility hardening
- [ ] Style mapping parity (named styles, based-on, next-style).
- [ ] Import/export round-trip tests with common docx fixtures.
- [ ] Compatibility notes for unsupported features and fallbacks.

### M17 Collaboration and review
- [ ] Comments and threaded replies.
- [ ] Track changes (insert/delete/format).
- [ ] Compare and merge revisions.

### M18 QA, performance, and packaging
- [ ] Golden fixture suite for complex layouts and large docs.
- [ ] Perf budgets (layout, pagination, export time).
- [ ] Crash repro harness + stable regression test pipeline.
