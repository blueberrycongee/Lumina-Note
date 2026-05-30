---
title: "PDF Highlight Pipeline"
type: concept
source_profile_id: profile-collabora-docs-v0
source_profile_ids:
  - profile-collabora-docs-v0
synthetic_generation: note-work-fixture-generator-v0.1
tags:
  - pdf
  - workflow
---
# PDF Highlight Pipeline

Anchor: PDF highlights should be converted into reviewable Markdown before synthesis.

Summary: The pipeline preserves the page or section reference, then creates a Markdown note. Summaries should cite the converted note rather than an opaque PDF blob.

Related links: [[PDF Annotation Export]], [[Source Paths Contract]], [[PDF Workflow Summary]]

Fixture controls:
- ordinary

Profile-derived traits:
- Folder and note type are derived from profile-collabora-docs-v0.
- Link, stale, duplicate, or boundary structure is synthetic and reviewable.

Deterministic review:
- Gold labels can cite the Anchor line and this vault-relative path.
- No raw private note text or provider payload is included.
