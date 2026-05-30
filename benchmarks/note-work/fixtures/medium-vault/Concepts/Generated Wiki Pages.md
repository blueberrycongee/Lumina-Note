---
title: "Generated Wiki Pages"
type: concept
source_profile_id: profile-collabora-docs-v0
source_profile_ids:
  - profile-collabora-docs-v0
synthetic_generation: note-work-fixture-generator-v0.1
tags:
  - wiki
  - provenance
---
# Generated Wiki Pages

Anchor: Generated wiki pages must keep source_paths so readers can audit the synthesis.

Summary: A wiki page without source_paths is treated as lower trust. The source list should use vault-relative Markdown paths.

Related links: [[Source Paths Contract]], [[Source Provenance Summary]]

Fixture controls:
- ordinary

Profile-derived traits:
- Folder and note type are derived from profile-collabora-docs-v0.
- Link, stale, duplicate, or boundary structure is synthetic and reviewable.

Deterministic review:
- Gold labels can cite the Anchor line and this vault-relative path.
- No raw private note text or provider payload is included.
