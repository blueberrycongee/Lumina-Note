# Plan: Frontend Integration Notes for Forge-Based Agent

## Goal
Provide guidance for front-end implementation once the agent runtime is migrated to Forge.

## Event Protocol (Forge)
Front-end should consume Forge `Event` records (or a thin wrapper) rather than the old `agent-event` format.
Key events to handle:
- Text streaming: `TextDelta`, `TextFinal`
- Tool lifecycle: `ToolStart`, `ToolUpdate`, `ToolResult`, `ToolError`, `ToolStatus`
- Permissions: `PermissionAsked`, `PermissionReplied`
- Session phases: `SessionPhaseChanged`, `SessionPhaseTransitionRejected`
- Run status: `RunStarted`, `RunCompleted`, `RunFailed`, `RunAborted`

## Tool Rendering
1) ToolStart should open a tool call block with tool name and input payload.
2) ToolUpdate should stream tool output into the block:
   - OutputDelta: incremental output (stdout/stderr)
   - OutputPreview: show preview + "truncated" indicator
   - Progress: show progress bar when total is known
   - Metadata: update metadata UI if provided
3) ToolResult should close the tool block, show summary, and link to attachments if any.
4) ToolError should mark the tool block as failed.

## Permissions UI
1) When `PermissionAsked` arrives:
   - Show a modal/prompt with tool name, permission pattern, and metadata.
   - Provide actions: Allow Once / Allow Always / Reject.
2) On user response, send a `PermissionReply` command to backend.
3) UI should reflect automatic approval for "always" patterns.

## Attachments and Truncation
1) Tool outputs may be returned as attachments when large:
   - Inline attachments: `AttachmentPayload::Inline`
   - Reference attachments: `AttachmentPayload::Reference` (fetch by id)
2) Front-end should support a "view full output" action.

## Sessions + Timeline
1) Event stream is ordered by `EventRecord.meta.seq`.
2) Session state should be kept by session id and message id.
3) UI should support:
   - Per-message streaming
   - Tool call timeline
   - Optional run-level breadcrumbs (run started/completed)

## Tool Naming (App-Specific)
- Do not hardcode tool names in the UI.
- Read tool definitions from the backend (name + description + schema) and render dynamically.
- Tool naming should match Lumina's needs (e.g., read_note/edit_note/etc) unless explicitly changed by the backend.

## Error States
1) RunFailed should render a terminal error block.
2) ToolError should include error text and input payload for debugging.
3) SessionPhaseTransitionRejected should be logged to the debug panel.

## Debug Panel (Recommended)
Include a panel that can toggle:
- raw Event stream (JSON)
- tool call payloads
- permission prompts
- token usage

## Backward Compatibility
Not required. Front-end should be updated to the Forge protocol, not the legacy `agent-event` flow.

## Deliverables
- Event stream consumer (Forge Event -> UI state).
- Tool lifecycle UI (start/update/result/error).
- Permission prompt UI.
- Attachment viewer for large tool outputs.
