# Typesetting Failure Repros

Store minimized docx repro cases here when diffs are detected.

Guidelines:
- Keep the docx as small as possible while still reproducing the mismatch.
- Name files with the pattern: `<date>_<short-id>.docx` (e.g. `2026-02-02_table-header.docx`).
- Capture the origin sample and diff summary in `manifest.json`.

How to add:
1) Duplicate the failing sample docx.
2) Remove unrelated content until the mismatch still reproduces.
3) Save it here and add an entry to `manifest.json`.

This directory is intended for regression tracking and should remain small.
