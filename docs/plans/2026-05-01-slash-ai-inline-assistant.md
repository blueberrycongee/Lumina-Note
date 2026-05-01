# Slash AI Inline Assistant

Date: 2026-05-01
Status: Design baseline for first implementation

## Goal

Turn the editor slash AI commands into an inline writing assistant anchored
near the insertion point. The assistant should keep the writer in the note,
show useful progress without writing intermediate events into Markdown, and
make insertion explicit through a preview and accept/cancel step.

## User Scenarios

- Empty note: the user expects help starting a draft, outline, title, or
  first paragraph. The assistant should treat the blank page as intentional
  and avoid saying there is no context.
- Existing short draft: the user expects style continuity. Nearby paragraphs
  matter more than the whole document.
- Long note middle: the user expects local continuity and not a summary of
  the entire note. Context should be windowed around the insertion point.
- Selected text: rewrite/expand/summarize should operate on the selection
  first, then the current block fallback.
- Block-adjacent use: continue should insert at the slash position, rewrite
  should replace the target block, expand should replace with a richer block,
  and summarize should append after the target block.

## Interaction Model

The slash menu still finds commands. Choosing an AI command opens a lightweight
inline panel in the same anchored position instead of opening the chat panel.

States:

1. Prompt: input is focused, Enter starts generation, Escape closes.
2. Running: the input is preserved, a compact stage list shows progress, and
   Escape or the cancel button aborts without changing the document.
3. Preview: generated Markdown is shown in a bounded preview area. Enter or
   the primary button accepts; Escape or cancel closes without writing.
4. Error: the prompt stays editable, the error is shown in the panel, and retry
   is available.

Process visibility should be paced and coarse-grained:

- Show stable stages such as understanding request, reading note context,
  preparing related context, generating candidate, and ready to insert.
- Do not stream raw model deltas, reasoning text, prompt text, or tool output
  into the editor or the preview.
- Tool/retrieval details can be represented as short collapsed evidence rows
  later. The first version keeps them as status labels only because opencode
  event shapes are not yet normalized for this UI.

## Positioning And Visual Rules

- Anchor to the slash insertion point and clamp to viewport edges.
- Keep a stable panel width and bounded height so generation and long previews
  do not push the editor around.
- Use the existing popover, border, muted text, accent, and primary token
  language. This should feel like an editor affordance, not a chat window.
- Preview content is visually distinct from Markdown body with a muted surface,
  monospace-ish Markdown preservation, and a max-height scroll region.
- Animation should be limited to opacity/translate transitions already implied
  by CSS classes; avoid layout jumps.

## Data Flow

```
SlashMenu command
  -> capture slash range and insertion position
  -> open inline panel prompt state
  -> runSlashAIAction(..., callbacks)
  -> generateInlineAIMarkdown emits UI stage updates only
  -> fetch final assistant message text
  -> sanitize to insertable Markdown
  -> return candidate text
  -> panel preview state
  -> user accepts
  -> apply final Markdown to original insertion/replacement range
```

The editor document is changed only at accept time, except for removing the
typed slash/filter text when the command starts. Intermediate AI events are
not document mutations.

## Prompt And Context

The model receives:

- user request or command-derived instruction,
- current note path/name when available,
- selected or target block content for block actions,
- a bounded context window around the insertion point,
- explicit instructions to return only Markdown for the target range.

The prompt should bias toward local insertion. It must not ask the model to
return the whole note, echo the prompt, expose reasoning, or include fences.

## Failure Behavior

- No prompt for freeform insert: keep the panel open rather than silently doing
  work.
- No target block for block actions: show a panel error instead of alerting.
- API/provider/session failure: show a concise error, preserve input, allow
  retry.
- Timeout or user cancel: stop the run and leave the document unchanged.

## Non-Goals

- No general chat panel inside the editor.
- No persistent assistant framework or global workflow engine.
- No full retrieval source browser in the first pass.
- No live insertion of streaming text into Markdown.
