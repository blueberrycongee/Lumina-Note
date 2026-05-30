---
title: "Provenance Contract"
type: concept
source_profile_id: profile-collabora-docs-v0
source_profile_ids:
  - profile-collabora-docs-v0
  - profile-opencode-docs-v0
synthetic_generation: note-work-fixture-generator-v0.2
tags:
  - provenance
---
# Provenance Contract

Anchor: Provenance must name files that were actually read, not files inferred from memory.

Summary: This note separates source discovery from answer writing. It preserves trust by rejecting citations that are not backed by read files.

Related links: [[Source Paths Contract]], [[Offline Scoring]], [[Hallucinated Provenance Cases]]

Fixture controls:
- ordinary

Profile-derived traits:
- Folder and note type are derived from profile-collabora-docs-v0, profile-opencode-docs-v0.
- Link, stale, duplicate, or boundary structure is synthetic and reviewable.

Deterministic review:
- Gold labels can cite the Anchor line and this vault-relative path.
- No raw sensitive local note text or provider payload is included.
