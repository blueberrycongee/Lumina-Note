---
title: "WikiLink Hygiene"
type: concept
source_profile_id: profile-excalidraw-mcp-v0
source_profile_ids:
  - profile-excalidraw-mcp-v0
  - profile-collabora-docs-v0
synthetic_generation: note-work-fixture-generator-v0.2
tags:
  - links
---
# WikiLink Hygiene

Anchor: WikiLinks should be suggested first and applied only inside allowed edit scopes.

Summary: The current policy prefers link suggestions unless the task explicitly allows edits. Bulk auto-linking is risky because stale or restricted notes can pollute the graph.

Related links: [[Backlink Gap]], [[Auto-Linking Current Position]], [[Wiki Cleanup Sprint]]

Fixture controls:
- ordinary

Profile-derived traits:
- Folder and note type are derived from profile-excalidraw-mcp-v0, profile-collabora-docs-v0.
- Link, stale, duplicate, or boundary structure is synthetic and reviewable.

Deterministic review:
- Gold labels can cite the Anchor line and this vault-relative path.
- No raw sensitive local note text or provider payload is included.
