# Real-Repo-Derived Note-Work Benchmark — Design

Date: 2026-06-01
Status: Approved (approach C, with subagent as the second reviewer)
Owner: Lead agent (this session)

## Problem

`benchmarks/note-work/` v0 uses a fully synthetic vault (`fixtures/medium-vault/`,
112 templated notes, all 28-33 lines, identical 6-section structure). The
generator is a hardcoded `codex-scripted-fixture` script
(`scripts/generate-fixture.mjs:846-859`); the four profile JSONs only describe
*structure* and never let real content flow into the vault. The
`data_origin: "real_profile_derived_synthetic"` label on every task is therefore
misleading. This is a benchmark for evaluating note-work agents, and the corpus
should be real.

## Goals

- Rebuild the vault from the real `.md` files already in `third_party/`.
- Generate 76 gold tasks (preserving the 6-family / 6-risk-bucket shape) by
  having two independent agents (extractor + reviewer) propose, cross-check,
  and consensus-merge candidates.
- Keep scoring, schemas, and the opencode runner unchanged. Only fixture
  content, task definitions, and provenance are rebuilt.
- Drive the second LLM pass with a Claude Code subagent (it can read files,
  grep, byte-verify snippets — API calls cannot).

## Non-Goals

- Changing the task schema, scoring weights, or run-output schema.
- Replacing the existing 4 profile JSONs (we keep them but stop driving
  synthetic vault generation from them).
- Adding a new family (6 families stay: find, search_compare, synthesize,
  link, mutate, boundary).
- Touching `third_party/` content — the snapshots are read-only source.

## Architecture Overview

```
            ┌──────────────────────────────────────────────┐
            │  third_party/{opencode,moltbot,             │
            │   collabora-online,openoffice,              │
            │   collabora-code}/*.md  (read-only)         │
            └────────────────┬─────────────────────────────┘
                             │ copy + index
                             ▼
   ┌─────────────────────────────────────────────────────────┐
   │  fixtures/real-vault/                                   │
   │  ├── opencode/  (preserve native folder structure)     │
   │  ├── moltbot/                                          │
   │  ├── collabora-online/                                 │
   │  ├── openoffice/                                       │
   │  ├── collabora-code/                                   │
   │  ├── Restricted/  (4 synthetic boundary notes, kept)   │
   │  ├── INDEX.json  (manifest, paths→repo/profile map)    │
   │  └── .provenance.json  (per-file source URL + hash)    │
   └────────────────┬────────────────────────────────────────┘
                    │ walk + identify anchor candidates
                    ▼
   ┌─────────────────────────────────────────────────────────┐
   │  Pass 1: Extractor subagent (general-purpose)          │
   │  Input: vault path, family quotas, target repo         │
   │  Reads:  .md files in vault                            │
   │  Writes: tasks/candidates/<repo>-<batch>.json          │
   │  Schema: draft task records (every required field)     │
   │  Constraint: produces 1.5× the per-family quota        │
   └────────────────┬────────────────────────────────────────┘
                    │ independent pass, no shared state
                    ▼
   ┌─────────────────────────────────────────────────────────┐
   │  Pass 2: Reviewer subagent (general-purpose)            │
   │  Input: candidate file + vault read access             │
   │  For each candidate:                                    │
   │    - Greps expected_evidence.snippet in source file    │
   │    - Verifies source_paths exist in vault              │
   │    - Parses expected_links, confirms targets exist     │
   │    - Re-reads source, judges "is query answerable?"    │
   │    - Re-classifies family + risk_buckets                │
   │  Writes: tasks/candidates/<repo>-<batch>.review.json   │
   │          (verdicts: accepted | rejected(reason) |       │
   │           needs_human(reason))                          │
   └────────────────┬────────────────────────────────────────┘
                    │ deterministic hard gate
                    ▼
   ┌─────────────────────────────────────────────────────────┐
   │  Pass 3: scripts/verify-candidates.mjs                 │
   │  Re-checks every accepted candidate:                    │
   │    - snippet byte-match in source                      │
   │    - source_paths inside vault (no ..  / abs paths)    │
   │    - expected_links wiki-style parseable               │
   │    - allowed_sources / forbidden_sources disjoint      │
   │    - mutation_policy + allowed_edits consistent         │
   │  Drops anything that fails.                            │
   └────────────────┬────────────────────────────────────────┘
                    │ consensus merge
                    ▼
   ┌─────────────────────────────────────────────────────────┐
   │  Pass 4: scripts/build-dev-tasks.mjs                   │
   │  A task is published into dev.json iff:                 │
   │    a) Extractor produced it                             │
   │    b) Reviewer accepted it                              │
   │    c) Deterministic verify passed                       │
   │    d) (extractor.family, extractor.expected_sources,    │
   │        extractor.expected_evidence.snippet) match      │
   │       (reviewer.family, reviewer.expected_sources,     │
   │        reviewer.expected_evidence.snippet) under       │
   │       path-normalized + snippet-prefix comparison.     │
   │  Quotas per family come from the existing dev.json      │
   │  (find:14, search_compare:14, synthesize:15,            │
   │   link:13, mutate:12, boundary:8).                      │
   └────────────────┬────────────────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────────────────┐
   │  tasks/dev.json (gold) + tasks/dev.runtime.json         │
   │  fixtures/real-vault/   (real content)                 │
   │  fixtures/real-vault.provenance.json                   │
   │  profiles/*.json  (unchanged; only add data_origin      │
   │                   field: "real_repo_derived")           │
   └─────────────────────────────────────────────────────────┘
```

## Vault Layout (real-vault)

- `fixtures/real-vault/INDEX.json` — manifest:
  ```json
  {
    "schema_version": "lumina/real-vault-index/v0.1",
    "vault": "real-vault",
    "data_origin": "real_repo_derived",
    "repos": [
      {
        "id": "opencode",
        "source_url": "https://github.com/anomalyco/opencode",
        "license": "MIT",
        "path_root": "opencode",
        "file_count": 59,
        "profile_id": "profile-opencode-docs-v0"
      },
      ...
    ],
    "restricted_paths": [
      "Restricted/Unshared Journal Placeholder.md",
      "Restricted/Local Profile Boundary.md",
      "Restricted/Dogfood Boundary Placeholder.md",
      "Restricted/Provider Boundary Placeholder.md"
    ]
  }
  ```
- `fixtures/real-vault.provenance.json` — per-file:
  ```json
  [
    {
      "vault_path": "opencode/README.md",
      "source_url": "https://github.com/anomalyco/opencode/blob/<sha>/README.md",
      "license": "MIT",
      "byte_sha256": "...",
      "synthetic": false
    }
  ]
  ```
- 4 synthetic `Restricted/*.md` files are **copied unchanged** from
  `fixtures/medium-vault/Restricted/` to preserve boundary tasks. They are
  flagged `synthetic: true` and `data_origin: synthetic_boundary_control`.
- Real-repo files are **copied as-is** — no rewriting, no anonymization. If a
  real file contains something we shouldn't test on (e.g. credentials, private
  endpoints), exclude it in `INDEX.json` with `excluded: true` and reason.

## Pipeline Scripts (all new, under `benchmarks/note-work/scripts/`)

- `build-real-vault.mjs`
  - Walks each `third_party/<repo>/` for `*.md` files.
  - Copies them under `fixtures/real-vault/<repo>/<relpath>`.
  - Writes `INDEX.json` + `fixtures/real-vault.provenance.json`.
  - Copies the 4 `Restricted/*.md` placeholders.
  - Excludes anything that fails a `no-secrets` heuristic (regex: AWS keys,
    bearer tokens, private IPs, .pem files, etc.).
- `extract-queries.mjs`
  - Reads `INDEX.json` and dev.json's family quotas.
  - Splits the vault into "anchor candidates" (per-file: H1/H2 headings, first
    paragraph, fenced code blocks, definition lists, table rows).
  - Dispatches one **extractor subagent per batch** (a batch = one repo, one
    family). Subagent returns JSON array of candidate tasks, each including:
    - `query` (natural language, 1-2 sentences)
    - `expected_sources` (vault-relative paths)
    - `expected_evidence` (snippet strings that *must* appear in cited files)
    - `expected_links` (optional, [[WikiLinks]] if applicable)
    - `family`, `risk_buckets`, `evaluation_tier`
    - `mutation_policy`, `allowed_edits`, `forbidden_sources` if relevant
  - Each subagent is given a structured prompt requiring
    **only evidence that byte-matches a quoted source snippet**.
  - Subagent output is written to `tasks/candidates/<repo>-<family>-ext.json`.
- `review-queries.mjs`
  - For each candidate file, dispatches a **reviewer subagent**.
  - Reviewer subagent prompt is explicit: "do not trust the extractor; open
    every cited source and confirm the snippet, the path, the link, and that
    the query is answerable from the source."
  - Reviewer writes `tasks/candidates/<repo>-<family>-rev.json` with verdicts
    and reviewer-only fields (`reviewer_family`, `reviewer_expected_sources`,
    `reviewer_expected_evidence`, `reviewer_notes`).
- `verify-candidates.mjs`
  - Pure-Node, no LLM, no subagent. Hard gate:
    - `expected_evidence[i].snippet` must appear in
      `fixtures/real-vault/<expected_evidence[i].path>`.
    - `expected_sources` must all be reachable paths in vault.
    - `expected_links` must each resolve to a real vault file.
    - `forbidden_sources` must all be reachable.
    - `mutation_policy: "allowed_edits"` ⇒ `allowed_edits.length > 0`.
    - `mutation_policy: "clarify_before_mutation"` ⇒ `expected_behavior`
      mentions "needs_clarification" or "refused".
  - Emits `tasks/candidates/<repo>-<family>.verified.json` and a rejection
    log.
- `build-dev-tasks.mjs`
  - Loads every verified candidate + the corresponding reviewer verdicts.
  - Implements the consensus gate (snippet prefix-equal, source set
    subset-equal, family-equal after normalization).
  - Picks the top N per family to fill the quota (N from current dev.json
    counts: find 14, search_compare 14, synthesize 15, link 13, mutate 12,
    boundary 8).
  - Writes `tasks/dev.json` (gold) and `tasks/dev.runtime.json` (omits
    gold-label fields per existing schema).

## Subagent Prompt Contract (key invariant)

Both extractor and reviewer subagent prompts include:

```
You operate ONLY on files under <vault_path>. You may not read
third_party/, schemas/, or any other benchmark file. You must not invent
file paths, snippets, or links. Every snippet you cite must byte-match
the source file. If a snippet does not byte-match, drop the candidate.
Return JSON. If a family quota is reached, return an empty list.
```

This makes the consensus gate meaningful: if the extractor hallucinates, the
snippet won't byte-match in the reviewer's own grep, and the candidate dies
in the deterministic verify step.

## Consensus Algorithm (in `build-dev-tasks.mjs`)

For each (repo, family) batch:

1. Group reviewer verdicts by `candidate_id`.
2. For each pair (extractor, reviewer):
   - `snippet_eq = normalize(extractor.evidence.snippet).startsWith(
     normalize(reviewer.evidence.snippet)) || reverse`.
   - `source_set_eq = set_eq(extractor.expected_sources,
     reviewer.expected_sources)`.
   - `family_eq = extractor.family === reviewer.family`.
   - If all three true → `consensus: true`.
3. Only consensus=true candidates are eligible for quota selection.
4. If a family under-fills its quota, log a warning and run a second extractor
   pass with relaxed anchors (e.g., code blocks, tables) before declaring
   shortfall.

## Phased Delivery

- **Phase 1 — `opencode` only (60 .md)**
  - Validate end-to-end on 1 repo.
  - Target: 76 tasks achievable, but at minimum 12-15 tasks per family for the
    three heaviest families (find, synthesize, search_compare). Boundary and
    link quotas may be short.
  - Run `npm run note-work:validate` to ensure schema cleanliness.
  - Run the opencode runner on the new dev.json with both M3 and MiMo to
    confirm scoring pipeline still works.
  - Stop and inspect sample outputs before phase 2.
- **Phase 2 — extend to all 5 repos**
  - Re-run the full pipeline.
  - Produce a side-by-side `reports/score-real-vault-{minimax,mimo}.md`.
  - Update `benchmarks/note-work/README.md` to point at `real-vault`.

## Risk Mitigations

- **Risk: extractor and reviewer share the same model, so they could share
  the same blind spots.**
  - Mitigation: the deterministic verify step doesn't care which LLM made
    the claim — it grep's the vault. So even a same-model bias gets caught
    when the snippet doesn't exist.
- **Risk: real docs are noisy / contradictory, and a query becomes
  unanswerable.**
  - Mitigation: reviewer's "is the query answerable from the cited source?"
    judgment is exactly the gate; unanswerable candidates are rejected.
- **Risk: secret-bearing files leak into the vault.**
  - Mitigation: `build-real-vault.mjs` runs a regex + a path-name check
    (`.env`, `credentials`, `.pem`, `secrets/`, `*.key`) and excludes them.
    Every file is byte-hashed and recorded in provenance.
- **Risk: vault is too large for one opencode runner pass.**
  - Mitigation: real-vault is ~527 .md; runner already handles `medium-vault`
    (112). 5× is fine. If we hit context issues, narrow
    `allowed_sources`/`expected_sources` per task.
- **Risk: changing the corpus invalidates previous score reports.**
  - Mitigation: keep old `fixtures/medium-vault/` and `runs/opencode-*-dev.json`
    untouched; write new artifacts under `real-vault/` and
    `reports/score-real-vault-*.md`. Old reports remain as a historical
    comparison ("synthetic vault" vs "real vault").

## Open Decisions Deferred to Implementation

- Snippet normalization function: case-folding? whitespace collapsing?
  punctuation? → pick a simple rule in `verify-candidates.mjs` first
  iteration, refine if too few candidates pass.
- Reviewer subagent's "answerable" judgment prompt: how strict? → start at
  "the query's question must be answerable by reading the cited source
  section end-to-end, without external knowledge"; relax if too few pass.
- The vault-side per-file frontmatter. Real docs don't have `source_profile_id`
  frontmatter. We add it at vault-build time by deriving it from
  `INDEX.json`'s `repos[i].profile_id`. This is a single regex pass and lives
  in `build-real-vault.mjs`.

## What Does NOT Change

- `benchmarks/note-work/schemas/*.json` — no schema changes.
- `benchmarks/note-work/scripts/run-opencode-agent.mjs` — no runner changes.
- `benchmarks/note-work/scripts/score.mjs` — no scoring changes.
- `benchmarks/note-work/scripts/run-lexical-baseline.mjs` — no baseline
  changes; just point its manifest at the new vault.
- `benchmarks/note-work/profiles/*.json` — kept as-is. The
  `data_origin: "real_repo_derived_synthetic"` field is dropped; replaced
  with `data_origin: "real_repo_derived"` in task records.

## Human-in-the-Loop Budget

- Zero per-task review.
- One 5-minute spot check after phase 1: 6 queries (1 per family), confirm
  they read like real user questions and are answerable.
- One 5-minute spot check after phase 2: same shape, 6 queries, to confirm
  the 5-repo expansion preserves quality.

Total human time: ~10 minutes across the whole project.
