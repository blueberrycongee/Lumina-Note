# Doc Engine Change Log

## 2026-02-02
- Change: Add baseline docx sample set and generator script for repeatable fixtures.
- Scope: `scripts/generate_docx_samples.py`, `tests/typesetting/samples/*`.
- Impact: Establishes 10 baseline docx fixtures for render comparison and future OpenOffice diffing.
- Rollback: Remove `tests/typesetting/samples/` fixtures and delete `scripts/generate_docx_samples.py`.

## 2026-02-02 (baseline comparison tooling)
- Change: Add OpenOffice rendering and pixel-diff scripts for docx baseline comparison.
- Scope: `scripts/typesetting_openoffice_render.mjs`, `scripts/typesetting_pixel_diff.mjs`, `scripts/typesetting_baseline_compare.mjs`.
- Impact: Enables OpenOffice-based PDF rendering, pixel-level diffing via pdftoppm, and combined structural+visual comparisons.
- Rollback: Remove the new scripts; existing pdf diff tooling remains intact.

## 2026-02-02 (baseline batch render)
- Change: Add batch renderer to generate OpenOffice baselines from the sample manifest.
- Scope: `scripts/typesetting_baseline_batch.mjs`.
- Impact: Enables repeatable baseline PDF/PNG generation across sample fixtures.
- Rollback: Delete the batch script; manual rendering remains possible.

## 2026-02-02 (baseline manifest compare)
- Change: Add manifest-level compare script and Phase 1 report for reproducible baseline evaluation.
- Scope: `scripts/typesetting_baseline_compare_manifest.mjs`, `docs/doc-engine-phase1-report.md`.
- Impact: Enables batch structural+visual comparison and documents Phase 1 demo steps.
- Rollback: Delete the new script and report.

## 2026-02-02 (ignore generated baselines)
- Change: Ignore generated baseline outputs (OpenOffice/Lumina/compare reports) from git.
- Scope: `.gitignore`.
- Impact: Prevents large binary baseline outputs from polluting the repo.
- Rollback: Remove the ignore entries.

## 2026-02-02 (layout debug export)
- Change: Expose layout debug payload (lines + layout metadata) via typesetting harness.
- Scope: `src/components/typesetting/TypesettingDocumentPane.tsx`, `src/components/typesetting/TypesettingExportHarness.tsx`.
- Impact: Enables white-box inspection of line breaks/layout in headless export runs.
- Rollback: Remove harness debug payload wiring and API method.

## 2026-02-02 (export harness metrics)
- Change: Add optional layout dump + timing report outputs to the typesetting export harness.
- Scope: `scripts/typesetting_export_harness.mjs`.
- Impact: Enables perf timing capture and layout JSON export during headless PDF runs.
- Rollback: Remove the new flags and report output logic.

## 2026-02-02 (failure repro registry)
- Change: Add placeholder registry for minimized failure docx repro cases.
- Scope: `tests/typesetting/failures/README.md`, `tests/typesetting/failures/manifest.json`.
- Impact: Provides a structured place to track minimal mismatch repros.
- Rollback: Remove the failure repro folder and manifest.

## 2026-02-02 (perf report aggregation)
- Change: Add report aggregator to summarize lumina export timings.
- Scope: `scripts/typesetting_report_aggregate.mjs`, `docs/doc-engine-phase1-report.md`.
- Impact: Provides a simple performance baseline summary from export reports.
- Rollback: Remove the script and related doc references.

## 2026-02-02 (lumina batch export)
- Change: Add Lumina batch export script to generate candidate PDFs + layout reports from manifest.
- Scope: `scripts/typesetting_lumina_batch_export.mjs`, `docs/doc-engine-phase1-report.md`.
- Impact: Simplifies candidate generation and ensures layout/perf artifacts per sample.
- Rollback: Remove the batch script and doc references.

## 2026-02-02 (IR schema draft)
- Change: Add initial IR schema draft (types + doc) for AI-editable structure.
- Scope: `src/typesetting/irSchema.ts`, `docs/typesetting-ir-schema.md`.
- Impact: Establishes a stable schema target for Phase 3 and future IR-driven editing.
- Rollback: Remove the schema file and doc.

## 2026-02-02 (IR operation set)
- Change: Add draft IR operation set for AI edits.
- Scope: `src/typesetting/irOps.ts`, `docs/typesetting-ir-ops.md`.
- Impact: Defines minimal op vocabulary (insert/replace/move/style/delete) for future AI editing.
- Rollback: Remove the ops file and doc.

## 2026-02-02 (docx -> IR draft)
- Change: Add draft converter to map current docx blocks into IR.
- Scope: `src/typesetting/docxToIr.ts`, `docs/typesetting-ir-schema.md`.
- Impact: Provides a starting point for IR adoption without wiring it into runtime yet.
- Rollback: Remove the converter file and doc reference.

## 2026-02-02 (IR export in harness)
- Change: Add IR JSON export to typesetting harness and batch exporter.
- Scope: `src/components/typesetting/TypesettingExportHarness.tsx`, `scripts/typesetting_export_harness.mjs`, `scripts/typesetting_lumina_batch_export.mjs`.
- Impact: Enables IR snapshots per sample alongside layout/perf data.
- Rollback: Remove the IR export function and related flags.

## 2026-02-02 (IR metrics + diff)
- Change: Add IR structure metrics and diff scripts.
- Scope: `scripts/typesetting_ir_metrics.mjs`, `scripts/typesetting_ir_diff.mjs`, `docs/doc-engine-phase1-report.md`.
- Impact: Provides structural comparisons for paragraph/list/table counts independent of rendering.
- Rollback: Remove the scripts and doc references.

## 2026-02-02 (roadmap update)
- Change: Document baseline tooling references in roadmap.
- Scope: `docs/doc-engine-roadmap.md`.
- Impact: Keeps roadmap aligned with new scripts.
- Rollback: Revert the roadmap additions.

## 2026-02-02 (Word baseline guide)
- Change: Add missing Word baseline capture guide referenced by fixtures.
- Scope: `docs/WORD_BASELINE_CAPTURE.md`.
- Impact: Documents how to produce Word PDF baselines with metadata.
- Rollback: Remove the guide.

## 2026-02-02 (layout pagination info)
- Change: Include total page count and per-line page index in layout export.
- Scope: `src/components/typesetting/TypesettingDocumentPane.tsx`.
- Impact: Enables white-box pagination inspection alongside line metrics.
- Rollback: Remove the new layout fields.
