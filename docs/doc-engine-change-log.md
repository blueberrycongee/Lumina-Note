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
