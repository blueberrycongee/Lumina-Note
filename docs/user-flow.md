# Lumina Note User Guide

This is a practical guide. The first section is a map of **where every feature lives**. The rest is a few starter workflows that string the pieces together.

## Where to find each feature

The left **ribbon** is the column of icons running down the left edge of the window. The **command palette** is `Ctrl/Cmd + P`. The **selection toolbar** is the floating bar that appears when you select text in the editor.

| You want to... | Where it lives |
|---|---|
| Open the command palette | `Ctrl/Cmd + P`, or the ⌘ icon at the top of the ribbon |
| Search across your vault | Ribbon → Search icon (opens the search panel in the left sidebar) |
| Open AI chat | Ribbon → Bot icon |
| Browse files / open the editor | Ribbon → Files icon |
| Manage all images in the vault | Ribbon → Images icon |
| Open the knowledge graph (whole vault) | Ribbon → Network icon, or "Show graph" in the command palette |
| See the local graph for the current note | Same panel as the knowledge graph; auto-switches based on what you have open |
| Manage installed plugins | Ribbon → Puzzle icon |
| Open settings | Ribbon → Settings (bottom of the ribbon) |
| Toggle dark / light | Sun / Moon icon at the bottom of the ribbon |
| Check for app updates | Download icon at the bottom of the ribbon |
| Pick or edit a theme (15 official + custom) | Settings → General |
| Configure model provider and API key | Settings → AI |
| Sync (WebDAV, self-host cloud account, Mobile Gateway QR) | Settings → Sync |
| HTTP / SOCKS proxy | Settings → Network |
| Voice-record straight into a note | Mic button in the left sidebar quick actions |
| Annotate a PDF | Open any `.pdf` from the file tree — the built-in PDF reader takes over the tab |
| Send selected text to AI / generate flashcards | Select text in the editor → the floating selection toolbar |
| Hover-preview a `[[WikiLink]]` | Hover the cursor over any wikilink (works in editor, reading mode, file tree, graph) |
| Define / edit a custom slash command | Type `/` in the AI chat input → "Manage" |
| Run an agent skill (workspace / user / built-in) | Command palette → "Open Skill Manager", or `/skill` in the AI chat input |
| Export the current AI conversation | The toolbar above the chat thread |
| Pair the iOS / Android companion app | Settings → Sync → Mobile Gateway → scan the QR with the mobile app |
| Set up cross-network mobile access | Deploy `server/` (see `docs/self-host.md`), then sign in from Settings → Sync |

## 5-minute setup

1. Install Lumina Note from [Releases](https://github.com/blueberrycongee/Lumina-Note/releases) and launch it.
2. Pick a local folder as your **vault**.
3. Open **Settings → AI**, add an API key for your provider (OpenAI / Claude / Gemini / DeepSeek / Moonshot / Zhipu / Groq / OpenRouter / Ollama / any OpenAI-compatible endpoint…), and pick a model.
4. Create your first note. Type `[[` to start a wikilink — autocompletion suggests existing notes; pressing Enter creates a new one if it doesn't exist.
5. Open the **knowledge graph** (Network icon in the ribbon). Confirm both notes show up, connected.
6. Open **AI chat** (Bot icon) and ask it something about the note you just wrote.

When all six steps work, the rest of the app is just specialized surfaces for the same primitives: files + AI + graph + sync.

## Starter workflows

### A. Daily notes → structured knowledge

1. Capture quickly in a daily note. Don't overthink structure.
2. As topics repeat, link them with `[[WikiLinks]]`. Use hover-preview (just hover the link) to confirm you're pointing at the right page.
3. In AI chat, ask the agent to extract action items or split sections. The agent edits the file directly when you accept its plan.
4. Switch to the knowledge graph (ribbon → Network icon). Look for isolated nodes — those are notes you forgot to link.

### B. PDFs → reusable Markdown notes

1. Drop a PDF into your vault, then click it in the file tree. The PDF reader opens in place.
2. Highlight, underline, and annotate. Save annotations out as Markdown when you're done.
3. In AI chat, scope the request to the resulting Markdown page (e.g. "summarize the highlighted sections only").
4. Add your own conclusions and tags before linking the page into your knowledge map with `[[WikiLinks]]`.

### C. Agent-assisted refactor

1. State scope **before** asking. "This file" or "everything under `notes/research/`".
2. Ask for a plan first. The agent runtime supports planning; review the plan before letting it edit.
3. Apply changes incrementally. The agent writes to disk through the same FS tools you'd use; nothing is hidden.
4. Manually review the headings and any non-trivial rewrites before saving.

### D. Sync to your phone

1. **Same Wi-Fi**: open **Settings → Sync → Mobile Gateway**. Scan the QR code with the iOS or Android companion app — done.
2. **Different network**: deploy the relay server (`docs/self-host.md`), register an account, then sign into the same account on both desktop (Settings → Sync) and mobile.

## Privacy and data boundary

- The vault is local-first. Nothing leaves the device unless you opt into a cloud model or sync.
- Cloud model requests carry whatever you put in the prompt; the agent does not exfiltrate the rest of the vault.
- For sensitive material, consider keeping a separate vault tied to a different model provider, or sticking to a local model via Ollama.

## Quick FAQ

### AI is not responding

- Check the API key (Settings → AI).
- Confirm the model id matches what your provider exposes.
- Check proxy / network reachability (Settings → Network).

### I can't find a feature mentioned in the README

Open the command palette (`Ctrl/Cmd + P`) and type a few letters. Most features have a command entry, including ones the ribbon doesn't surface.

### What should I learn first?

WikiLinks → AI chat → knowledge graph. Once those three feel natural, the rest of the app is just shortcuts.
