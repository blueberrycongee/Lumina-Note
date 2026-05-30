---
title: "Lexical Baseline"
type: concept
source_profile_id: profile-opencode-docs-v0
source_profile_ids:
  - profile-opencode-docs-v0
  - profile-collabora-docs-v0
  - profile-openclaw-docs-v0
synthetic_generation: note-work-fixture-generator-v0.2
tags:
  - baseline
  - search
---
# Lexical Baseline

Anchor: The lexical baseline uses filename and content token overlap as the lower-bound comparison.

Summary: Filename search catches direct references while content search catches repeated phrases. The baseline is deliberately simple so graph-assisted runs must beat it clearly.

Related links: [[Offline Scoring]], [[Task Family Taxonomy]], [[Run Lexical Baseline]]

Fixture controls:
- ordinary

Profile-derived traits:
- Folder and note type are derived from profile-opencode-docs-v0, profile-collabora-docs-v0, profile-openclaw-docs-v0.
- Link, stale, duplicate, or boundary structure is synthetic and reviewable.

Deterministic review:
- Gold labels can cite the Anchor line and this vault-relative path.
- No raw sensitive local note text or provider payload is included.
