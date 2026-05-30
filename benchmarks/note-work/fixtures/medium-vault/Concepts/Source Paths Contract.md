---
title: "Source Paths Contract"
type: concept
source_profile_id: profile-collabora-docs-v0
source_profile_ids:
  - profile-collabora-docs-v0
  - profile-opencode-docs-v0
synthetic_generation: note-work-fixture-generator-v0.2
tags:
  - provenance
  - scoring
---
# Source Paths Contract

Anchor: Source paths must be vault-relative in fixture labels and reviewable in every answer.

Summary: The contract says generated notes and benchmark answers need explicit source paths. A claim without a source path is treated as unsupported, even when it sounds plausible.

Related links: [[Provenance Contract]], [[Generated Wiki Pages]], [[Run Output Fields]]

Fixture controls:
- ordinary

Profile-derived traits:
- Folder and note type are derived from profile-collabora-docs-v0, profile-opencode-docs-v0.
- Link, stale, duplicate, or boundary structure is synthetic and reviewable.

Deterministic review:
- Gold labels can cite the Anchor line and this vault-relative path.
- No raw sensitive local note text or provider payload is included.
