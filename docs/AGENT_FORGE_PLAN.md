# Plan: Forge-Based Agent Core (OpenCode-Style Loop)

## Goal
Replace Lumina's current LangGraph-based agent runtime with Forge as the core runtime, reusing OpenCode's core agent loop semantics (LLM ↔ tools ↔ loop ↔ finish) without enforcing OpenCode tool naming.

## Non-Goals (for this phase)
- Full parity with OpenCode UI/CLI.
- Rewriting all Lumina business tools. Existing tool names and contracts can remain.
- Backward compatibility with the current Lumina agent implementation or its event protocol.

## Success Criteria
- Single agent loop runs on Forge LoopNode and ToolRegistry.
- LLM can drive tools through Forge LoopNode + ToolRegistry.
- Tool calls, permission gating, and tool results are evented via Forge Event stream.
- Legacy Lumina agent implementation is removed (no LangGraph path or fallback).

## Phase 0 - Inventory and Interface Freeze
1) Freeze the current tool surface for migration reference only.
2) Define the target tool schema list and required permissions (tool names remain Lumina-specific where appropriate).
3) Define the Forge Event -> Frontend contract (new protocol). (See companion frontend plan.)

## Phase 1 - Forge Runtime Rewrite (No Legacy Fallback)
1) Build a new Forge-backed agent runtime module (fresh implementation).
   - Use `forge::runtime::r#loop::LoopNode` as the core loop.
   - Single LoopNode handles the LLM -> tool -> LLM loop.
2) Reimplement Tauri commands to call the Forge runtime directly.
3) Emit Forge Events directly to the app event bus.
4) Do not keep the old graph executor or dual-path execution flags.

## Phase 2 - Tool Layer (Lumina Tools + Optional General Tools)
1) Keep Lumina tool names and schemas as the primary surface (read_note/edit_note/list_notes/search_notes/etc).
2) Optionally add generic tools (bash/webfetch/glob/grep) only if they are needed for non-note workflows.
3) Implement ToolOutput metadata for each tool (mime_type, schema, attributes).
4) Add attachment support for large outputs (truncation + attachment ref).

## Phase 3 - Permission + Approval Flow
1) Map Lumina tool permissions into Forge PermissionPolicy rules.
2) Enforce per-tool permission (allow/ask/deny) via PermissionSession.
3) Add resume/approve API for front-end to respond to PermissionAsked.
4) Persist PermissionSession snapshots by session id.

## Phase 4 - LLM Adapter + Tool Call Parsing
1) LLM adapter interface:
   - OpenAI-style function calling if supported.
   - XML fallback parser for tool calls if needed.
2) Tool call schema validation before execution.
3) Tool execution loop:
   - Step events for each tool call.
   - ToolUpdate for streaming outputs (bash/webfetch).

## Phase 5 - Session + Event Integration
1) Use Forge SessionState to persist:
   - message parts
   - tool call timeline
   - partial streaming output
2) Emit:
   - TextDelta/TextFinal
   - ToolStart/ToolUpdate/ToolResult
   - PermissionAsked/PermissionReplied
   - SessionPhaseChanged
3) Optional: JSONL/SSE sinks for testing and headless runs.

## Phase 6 - Remove Legacy Agent Implementation
1) Delete/disable LangGraph agent graph code and legacy agent loop.
2) Remove old agent-specific tests tied to LangGraph.
3) Remove legacy flags or switches that select between runtimes.

## Phase 7 - Validation
1) Unit tests: tool schema validation, permission flow, output metadata.
2) Integration tests: minimal "read_note -> edit_note -> create_note" loop.
3) Regression: ensure MCP tool calling still works (via new tool bridge).

## Deliverables
- Forge-powered agent runtime module (sole runtime).
- Tool registry aligned to Lumina needs (no enforced OpenCode naming).
- Permission/approval flow with session persistence.
- Updated documentation.

## Risks
- Tool output shape changes may break frontend rendering.
- Some Lumina tools have semantics that do not map 1:1 to Forge tool contracts.
- MCP tool integration may need a custom adapter.
