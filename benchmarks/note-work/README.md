# Lumina Note Work Benchmark v0

This directory contains a runnable, reviewable v0 benchmark for note work in
Lumina. It is intentionally small enough to inspect locally and large enough to
exercise source discovery, synthesis, link recommendation, safe mutation, and
privacy boundaries.

The methodology source of truth is
`docs/note-work-benchmark-methodology.md`.

## Commands

Run from the repository root:

```bash
npm run note-work:generate
npm run note-work:baseline
npm run note-work:score
npm run note-work:validate
```

Equivalent direct commands:

```bash
node benchmarks/note-work/scripts/generate-fixture.mjs
node benchmarks/note-work/scripts/run-lexical-baseline.mjs
node benchmarks/note-work/scripts/score.mjs
node benchmarks/note-work/scripts/validate.mjs
```

## Artifacts

- `schemas/`: versioned schemas for profiles, tasks, run outputs, and score reports.
- `profiles/`: safe real-knowledge-base profiles. v0 uses external licensed documentation snapshots only: Collabora Online, OpenClaw, OpenCode, and Excalidraw MCP.
- `fixtures/medium-vault/`: synthetic Markdown vault derived from those profiles.
- `fixtures/medium-vault.provenance.json`: per-note synthetic provenance and safety review.
- `tasks/dev.json`: visible dev task set.
- `runs/baseline-lexical-dev.json`: lexical baseline output.
- `reports/example-score-report.json`: structured deterministic score report.
- `reports/example-score-report.md`: human-readable example report.
- `docs/agent-runner-interface.md`: contract for Lumina or graph-assisted agent runners.

## Adding A Profile

1. Inspect a real public, licensed, project-committed, anonymized, or consented local knowledge base.
2. Add a profile JSON under `profiles/` that matches `schemas/profile.schema.json`.
3. Record source URL or local source, visibility, license or consent, profiled paths, folder taxonomy, note type mix, link/tag/backlink patterns, stale/duplicate/contradiction patterns, and privacy boundary.
4. Do not commit raw private notes, provider payloads, secrets, hidden prompts, or reversible anonymization.
5. Add the profile path to `benchmark.manifest.json`.
6. Run `npm run note-work:validate`.

## Adding A Fixture Note

1. Add a Markdown note under `fixtures/medium-vault/` using a vault-relative path.
2. Record frontmatter with `source_profile_id`, `source_profile_ids`, note type, tags, and synthetic generation version.
3. Update `fixtures/medium-vault.provenance.json` with:
   - `source_profile_id`
   - generation method
   - traits derived from real profiles
   - constructed synthetic controls
   - deterministic gold-label anchor
   - safety flags set to false
4. Keep private boundary notes as obvious placeholders with no real private content.
5. Run `npm run note-work:validate`.

## Adding A Task

1. Add a task record to `tasks/dev.json` using vault-relative paths.
2. Choose one family: `find`, `search_compare`, `synthesize`, `link`, `mutate`, or `boundary`.
3. Fill `expected_sources`, `allowed_sources`, `forbidden_sources`, `mutation_policy`, and `rubric`.
4. Add `expected_evidence` snippets that appear in the fixture Markdown.
5. For link tasks, add `expected_links`.
6. For mutate tasks, add `allowed_edits` and `expected_edits` when edits are allowed. Use `clarify_before_mutation` for destructive or ambiguous requests.
7. Mark high-risk tasks with `high_risk: true` and risk buckets such as `privacy`, `mutation`, `stale-source`, `long-context`, `hallucinated-provenance`, or `boundary`.
8. Run `npm run note-work:validate`.

## Running Baselines

The lexical baseline supports filename and content lexical search. It writes a
schema-valid run output:

```bash
npm run note-work:baseline
```

The baseline is a lower bound, not a product score. Future Lumina agent and
graph-assisted systems must emit the same run-output schema so the same scorer
can compare them.

## Running Or Connecting Agent Eval

See `docs/agent-runner-interface.md`. A runner must:

- read the same manifest and task set,
- operate only inside the fixture vault,
- honor allowed, forbidden, and mutation-policy fields,
- emit `schemas/run-output.schema.json`,
- preserve review evidence for sources read, scanned paths, edits, suggested links, cost, and latency.

## Interpreting Score Reports

Use `reports/example-score-report.json` for automated inspection and
`reports/example-score-report.md` for review.

Do not rely on a single aggregate score. The report separates:

- per-family metrics,
- high-risk metrics,
- source discovery,
- link quality,
- mutation safety,
- privacy and boundary violations,
- cost and latency,
- failure categories.

High-risk failures must be read separately. They are not release-safe just
because ordinary tasks have a higher average.

## Privacy, Provenance, And Reporting Constraints

The constraints come from `docs/note-work-benchmark-methodology.md`:

- Real profiles must record source, visibility, license or consent, profiled paths, structure, and privacy boundary.
- Synthetic fixture notes must record provenance and distinguish profile-derived traits from constructed controls.
- Gold labels must be checkable from fixture Markdown and deterministic validation.
- LLM judge output, if added later, must be saved as review evidence and must not be silently folded into a single score.
- Raw private notes, provider payloads, secrets, and reversible anonymization must never be committed.
