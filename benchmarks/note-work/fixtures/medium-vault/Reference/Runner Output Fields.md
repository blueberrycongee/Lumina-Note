---
title: "Run Output Fields"
type: reference
source_profile_id: profile-collabora-docs-v0
source_profile_ids:
  - profile-collabora-docs-v0
  - profile-opencode-docs-v0
synthetic_generation: note-work-fixture-generator-v0.1
tags:
  - reference
  - runner
---
# Run Output Fields

Anchor: Run output records sources_read, candidate_paths_scanned, files_edited, links_suggested, cost, and latency.

Summary: These fields allow the scorer to identify source, link, mutation, and privacy failures.

Related links: [[Agent Runner Contract]], [[Source Paths Contract]]

Fixture controls:
- ordinary

Profile-derived traits:
- Folder and note type are derived from profile-collabora-docs-v0, profile-opencode-docs-v0.
- Link, stale, duplicate, or boundary structure is synthetic and reviewable.

Deterministic review:
- Gold labels can cite the Anchor line and this vault-relative path.
- No raw private note text or provider payload is included.
