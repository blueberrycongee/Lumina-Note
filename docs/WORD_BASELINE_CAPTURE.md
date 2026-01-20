# Word PDF Baseline Capture (M19)

Purpose: establish Word-rendered PDF baselines for the golden docx fixtures so we
can diff Lumina output against Word on the same machine.

## Prerequisites
- Windows 11 machine running Microsoft Word (Microsoft 365).
- Required fonts installed: SimSun (zh) and Times New Roman (en).
- Use the same machine for Word export and Lumina rendering.

## Inputs
- Golden docx fixtures from M12 (short/long/bilingual).

## Output location + naming
- Store PDFs under `tests/typesetting/word-baselines/`.
- Naming convention: `<fixture-id>.word.pdf`
  - Example: `short.word.pdf`, `long.word.pdf`, `bilingual.word.pdf`

## Export steps (per fixture)
1. Open the docx in Word.
2. Confirm page size + margins match the fixture definition.
3. File -> Save As -> PDF.
4. Choose "Standard (publishing online and printing)" (not "Minimum size").
5. Save into `tests/typesetting/word-baselines/` with the naming convention.

## Capture metadata (record once per baseline batch)
- Word version/build.
- Windows version.
- Fonts installed (confirm SimSun + Times New Roman).
- Date/time exported.

