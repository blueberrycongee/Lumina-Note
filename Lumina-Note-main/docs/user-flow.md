# Lumina Note User Flow Guide

This guide is for new users who want a practical workflow, not a full feature reference.

## Who This Is For

- First-time Lumina Note users
- Users who want to connect editor, AI, graph, and PDF workflows quickly

## 5-Minute Setup

### Prerequisites

- Lumina Note installed from Releases
- A local folder for your vault
- An API key for your model provider (OpenAI / Claude / Gemini, etc.)

### Steps

1. Launch the app and choose a local folder as your vault.
2. Configure model provider and API key in the right AI panel.
3. Create your first note and add some content.
4. Add a `[[WikiLink]]` to another page and fill that page.
5. Open Knowledge Graph and confirm both notes are connected.

### Expected Outcome

- You can create/edit/save Markdown notes
- AI chat is available
- Graph shows relationships between notes

## Workflow A: Daily Notes to Structured Knowledge

### Goal

Turn scattered notes into searchable and connected knowledge.

### Steps

1. Capture quickly in a daily note.
2. Link important lines to topic pages via `[[WikiLinks]]`.
3. Ask Agent to organize sections and action items.
4. Use graph view to find isolated notes and add links.

## Workflow B: PDF to Reusable Notes

### Goal

Convert reading highlights into long-term Markdown assets.

### Steps

1. Highlight and annotate inside PDF Reader.
2. Save/export annotations into a Markdown page.
3. Add your own conclusions and tags.
4. Ask AI to summarize based on that page only.

## Workflow C: Agent/Codex-Assisted Refactor

### Goal

Use AI for controlled restructuring, not one-shot rewrite.

### Steps

1. Define scope first (current file or a specific folder).
2. Give a concrete task (for example, "restructure headings, keep facts unchanged").
3. Ask for a plan, then apply edits.
4. Manually review key sections before final save.

## Privacy and Data Boundary

- Notes are local-first by default.
- Cloud model requests depend on your prompt and provider settings.
- For sensitive data, use stricter provider/config separation.

## Quick FAQ

### AI is not responding

- Check API key validity
- Confirm model/provider config
- Verify network/proxy setup

### Retrieval quality is weak

- Use clearer headings and shorter sections
- Add consistent tags and WikiLinks

### What should I learn first

- Start with `WikiLinks + AI panel + Knowledge Graph`

