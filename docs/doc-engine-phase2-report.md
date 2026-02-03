# Doc Engine Phase 2 Report (Preview/Export via OpenOffice)

Date: 2026-02-02

## Goal
Provide a reliable preview/export path aligned with OpenOffice output.

## Current Progress
- Added OpenOffice/LibreOffice render command on the backend.
- Added a UI toggle to preview OpenOffice-rendered PDF inside the typesetting pane.
- Export uses OpenOffice PDF when preview is enabled.

## Demo
1) Open a docx in Typesetting Document pane.
2) Click `OpenOffice Preview` and then `Refresh OpenOffice` to render.
3) Export PDF while OpenOffice preview is active to use the rendered output.

## Known Limitations
- Requires `soffice` to be installed or available via doc tools pack.
- Preview is manual refresh (not real-time).
- Rendering is per full document; no incremental update yet.

## Impact Summary
- User-visible: optional OpenOffice preview mode in the UI.
- Technical: new Tauri command for docx -> PDF rendering.

## Rollback Plan
- Remove the new Tauri command and UI toggle.
- Revert to the existing in-app preview/export path.
