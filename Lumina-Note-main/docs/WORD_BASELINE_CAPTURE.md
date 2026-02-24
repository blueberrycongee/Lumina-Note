# Word Baseline Capture Guide

Use this guide when exporting Word PDFs for baseline comparisons.

## Prerequisites
- Microsoft Word (desktop)
- Consistent fonts installed (match project baseline fonts)

## Steps
1) Open the target docx in Word.
2) Confirm page size, margins, and section settings.
3) Export as PDF (File → Save As → PDF).
4) Store the PDF in `tests/typesetting/word-baselines/`.
5) Record metadata below.

## Metadata to record
- Word version/build
- OS version
- Fonts installed
- Export time
- PDF settings (standard/minimum size)

## Notes
- Keep exports deterministic; avoid background updates or autosave during export.
- If the docx uses linked assets, ensure paths resolve before export.
