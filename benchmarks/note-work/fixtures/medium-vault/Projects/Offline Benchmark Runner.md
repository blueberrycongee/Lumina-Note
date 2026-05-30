---
title: "Offline Benchmark Runner"
type: project
source_profile_id: profile-collabora-docs-v0
source_profile_ids:
  - profile-collabora-docs-v0
  - profile-opencode-docs-v0
synthetic_generation: note-work-fixture-generator-v0.1
tags:
  - benchmark
---
# Offline Benchmark Runner

Anchor: The offline runner reads task JSON, runs a system, and writes schema-valid run output.

Summary: The runner is intentionally small. It avoids network calls and keeps reproducibility above model-heavy judging.

Related links: [[Lexical Baseline]], [[Offline Scoring]], [[Run Output Fields]]

Fixture controls:
- ordinary

Profile-derived traits:
- Folder and note type are derived from profile-collabora-docs-v0, profile-opencode-docs-v0.
- Link, stale, duplicate, or boundary structure is synthetic and reviewable.

Deterministic review:
- Gold labels can cite the Anchor line and this vault-relative path.
- No raw private note text or provider payload is included.
