---
title: "Agent Permission Review"
type: meeting
source_profile_id: profile-opencode-docs-v0
source_profile_ids:
  - profile-opencode-docs-v0
synthetic_generation: note-work-fixture-generator-v0.2
tags:
  - meeting
  - agent
---
# Agent Permission Review

Anchor: The permission review distinguishes analysis mode from write-capable build mode.

Summary: The review says a runner should not infer write permission from a task that only asks for analysis.

Related links: [[Terminal Agent Migration]]

Fixture controls:
- realistic-profile
- mutation

Profile-derived traits:
- Folder and note type are derived from profile-opencode-docs-v0.
- Link, stale, duplicate, or boundary structure is synthetic and reviewable.

Deterministic review:
- Gold labels can cite the Anchor line and this vault-relative path.
- No raw sensitive local note text or provider payload is included.
