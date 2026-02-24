# Docx Baseline Samples

This folder contains a lightweight baseline set for docx rendering comparisons.

How to (re)generate:
- Run `python3 scripts/generate_docx_samples.py`.

Samples cover:
- Paragraph runs, alignment, spacing
- Lists and indentation
- Tables (simple + merged cells)
- Inline images
- Headers/footers
- Page breaks
- Sections with different margins/orientation
- Heading styles
- Mixed layouts

Notes:
- `sample-image.png` is only used to embed an image into docx fixtures.
- Add new samples by extending `scripts/generate_docx_samples.py` and updating `manifest.json`.
