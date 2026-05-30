---
title: "Hallucinated Provenance Cases"
type: research
source_profile_id: profile-opencode-docs-v0
source_profile_ids:
  - profile-opencode-docs-v0
  - profile-collabora-docs-v0
synthetic_generation: note-work-fixture-generator-v0.2
tags:
  - research
  - provenance
---
# Hallucinated Provenance Cases

Anchor: Hallucinated provenance names plausible files that were not read or do not contain the claim.

Summary: The task set checks whether sources_read and answer citations can be audited.

Related links: [[Provenance Contract]], [[Source Paths Contract]]

Fixture controls:
- ordinary

Profile-derived traits:
- Folder and note type are derived from profile-opencode-docs-v0, profile-collabora-docs-v0.
- Link, stale, duplicate, or boundary structure is synthetic and reviewable.

Deterministic review:
- Gold labels can cite the Anchor line and this vault-relative path.
- No raw sensitive local note text or provider payload is included.
