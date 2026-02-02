# Doc Engine Phase 1 Report (Baseline + Comparison)

Date: 2026-02-02

## Goal
Establish a repeatable baseline docx sample set and dual comparison tooling (visual + structural) against OpenOffice output.

## Scope
- Sample set: 10 generated docx fixtures (tables/images/headers/footers/page breaks/sections).
- Rendering: OpenOffice/soffice headless to PDF (optional PNG/PPM).
- Comparisons:
  - Structural metrics diff (PDF page size + metrics).
  - Visual pixel diff (PPM via pdftoppm).

## Sample Set
- basic-paragraphs
- lists-and-indent
- table-simple
- table-merge
- image-inline
- header-footer
- page-breaks
- sections-margins
- styles-headings
- mixed-layout

## How To Reproduce (Demo)
1) Generate samples:
   - `python3 scripts/generate_docx_samples.py`
2) Render OpenOffice baselines:
   - `node scripts/typesetting_baseline_batch.mjs --format pdf`
3) Export Lumina PDF candidates (requires dev server + Edge):
   - `node scripts/typesetting_lumina_batch_export.mjs --out tests/typesetting/lumina-baselines`
   - This outputs PDF + layout JSON + IR JSON per sample.
4) Compare per-sample (structural + pixel):
   - `node scripts/typesetting_baseline_compare.mjs tests/typesetting/openoffice-baselines/basic-paragraphs/basic-paragraphs.pdf tests/typesetting/lumina-baselines/basic-paragraphs.pdf --out tests/typesetting/compare-reports/basic-paragraphs`
5) Compare manifest batch (all samples):
   - `node scripts/typesetting_baseline_compare_manifest.mjs --baseline tests/typesetting/openoffice-baselines --candidate tests/typesetting/lumina-baselines --out tests/typesetting/compare-reports`
   - If IR/layout JSON exists, this also writes `ir-metrics.json` and `layout-metrics.json` per sample.
6) Aggregate performance timings:
   - `node scripts/typesetting_report_aggregate.mjs --dir tests/typesetting/lumina-baselines --out tests/typesetting/perf/summary.json`
   - Keep `tests/typesetting/perf/` untracked (see `.gitignore`).
7) Compute IR structure metrics (optional):
   - `node scripts/typesetting_ir_metrics.mjs tests/typesetting/lumina-baselines/basic-paragraphs/basic-paragraphs.ir.json --out tests/typesetting/compare-reports/basic-paragraphs/ir-metrics.json`

## Current Results
- Baseline fixtures generated and versioned.
- OpenOffice render outputs are not committed; run the demo commands locally to capture them.
- White-box layout export is available in the export harness via `exportLayoutJson` (lines, pagination info, metadata).

## Quality Gap Notes
- Pending: capture visual diff ratios + PDF metrics once OpenOffice baselines are generated.
- Pending: document failures with minimal repro docx when mismatches occur.

## Impact Summary
- Added baseline fixtures and comparison scripts to make changes traceable and reproducible.

## Rollback Plan
- Remove `tests/typesetting/samples/` and scripts under `scripts/typesetting_*` added for baseline work.
- See `docs/doc-engine-change-log.md` for file-level scope.
