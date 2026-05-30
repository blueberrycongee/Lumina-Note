# Lumina Note Work Benchmark v0

This directory contains a runnable, reviewable v0 benchmark for note work in
Lumina. It is intentionally small enough to inspect locally and large enough to
exercise source discovery, synthesis, link recommendation, safe mutation, and
explicit scope boundaries.

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
- `tasks/dev.json`: visible gold dev task set for validation and scoring.
- `tasks/dev.runtime.json`: runtime task view for runners; it omits gold labels such as expected sources, expected links, expected evidence, rubrics, and judge policy.
- `runs/baseline-lexical-dev.json`: lexical baseline output.
- `reports/example-score-report.json`: structured deterministic score report.
- `reports/example-score-report.md`: human-readable example report.
- `docs/agent-runner-interface.md`: contract for Lumina or graph-assisted agent runners.

## Adding A Profile

1. Inspect a real public, licensed, project-committed, anonymized, or consented local knowledge base.
2. Add a profile JSON under `profiles/` that matches `schemas/profile.schema.json`.
3. Record source URL or local source, visibility, license or consent, profiled paths, folder taxonomy, note type mix, link/tag/backlink patterns, stale/duplicate/contradiction patterns, and data-exclusion boundary.
4. Do not commit raw sensitive local notes, provider payloads, secrets, hidden prompts, or reversible anonymization.
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
4. Keep restricted boundary notes as obvious placeholders with no real sensitive content.
5. Run `npm run note-work:validate`.

## Adding A Task

1. Add a task record to `tasks/dev.json` using vault-relative paths.
2. Choose one family: `find`, `search_compare`, `synthesize`, `link`, `mutate`, or `boundary`.
3. Set `evaluation_tier` to `deterministic_smoke` for harness checks or `dev_realistic` for natural note-work cases.
4. Fill `expected_sources`, `allowed_sources`, `forbidden_sources`, `mutation_policy`, and `rubric`.
5. Add `expected_evidence` snippets that appear in the fixture Markdown.
6. For link tasks, add `expected_links`.
7. For mutate tasks, add `allowed_edits` and `expected_edits` when edits are allowed. Use `clarify_before_mutation` for destructive or ambiguous requests.
8. Mark high-risk tasks with `high_risk: true` and risk buckets such as `mutation`, `stale-source`, `long-context`, `hallucinated-provenance`, `destructive-edit`, or `boundary`.
9. Regenerate `tasks/dev.runtime.json` with `npm run note-work:generate`. Do not hand-copy gold labels into the runtime view.
10. Run `npm run note-work:validate`.

## Running Baselines

The lexical baseline supports filename and content lexical search. It writes a
schema-valid run output:

```bash
npm run note-work:baseline
```

The baseline is a lower bound, not a product score. Future Lumina agent and
graph-assisted systems must emit the same run-output schema so the same scorer
can compare them.

The baseline reads `tasks/dev.runtime.json`, not the gold task file. For normal
tasks it searches the full fixture vault minus `Restricted/` and explicit
`forbidden_sources`; it does not use `allowed_sources` as a candidate whitelist.
Only `source_scope: no_vault_scan` and `source_scope: specific_sources_only`
runtime tasks narrow the candidate set.

## Running Or Connecting Agent Eval

See `docs/agent-runner-interface.md`. A runner must:

- read the same manifest and runtime task set,
- operate only inside the fixture vault,
- honor source scope, forbidden paths, and mutation-policy fields,
- emit `schemas/run-output.schema.json`,
- preserve review evidence for sources read, scanned paths, edits, suggested links, cost, and latency.

## Interpreting Score Reports

Use `reports/example-score-report.json` for automated inspection and
`reports/example-score-report.md` for review.

Do not rely on a single aggregate score. The report separates:

- per-family metrics,
- deterministic smoke versus dev-realistic metrics,
- high-risk metrics,
- source discovery,
- link quality,
- mutation safety,
- scope and boundary violations,
- cost and latency,
- failure categories.

High-risk failures must be read separately. They are not release-safe just
because ordinary tasks have a higher average.

`deterministic_smoke` tasks are useful for checking that schemas, runners, and
scorers work. Use `dev_realistic` results when judging whether search behavior
is improving.

## Data Safety, Provenance, And Reporting Constraints

The constraints come from `docs/note-work-benchmark-methodology.md`:

- Real profiles must record source, visibility, license or consent, profiled paths, structure, and data-exclusion boundary.
- Synthetic fixture notes must record provenance and distinguish profile-derived traits from constructed controls.
- Gold labels must be checkable from fixture Markdown and deterministic validation.
- LLM judge output, if added later, must be saved as review evidence and must not be silently folded into a single score.
- Raw sensitive local notes, provider payloads, secrets, and reversible anonymization must never be committed.
