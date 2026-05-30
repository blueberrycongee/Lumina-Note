---
title: "PDF Annotation Export"
type: pdf_derived
source_profile_id: profile-collabora-docs-v0
source_profile_ids:
  - profile-collabora-docs-v0
synthetic_generation: note-work-fixture-generator-v0.2
tags:
  - pdf
---
# PDF Annotation Export

Anchor: PDF annotation export writes Markdown excerpts before any synthesis note is created.

Summary: The export note is the deterministic source for claims about converted highlights.

Related links: [[PDF Highlight Pipeline]], [[Source Paths Contract]]

Fixture controls:
- ordinary

Profile-derived traits:
- Folder and note type are derived from profile-collabora-docs-v0.
- Link, stale, duplicate, or boundary structure is synthetic and reviewable.

Deterministic review:
- Gold labels can cite the Anchor line and this vault-relative path.
- No raw sensitive local note text or provider payload is included.
