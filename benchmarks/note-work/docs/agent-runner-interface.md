# Agent Runner Interface

This contract lets the current Lumina agent and future graph-assisted agents run
against the same task set as the lexical baseline.

## Inputs

A runner receives:

- benchmark manifest: `benchmarks/note-work/benchmark.manifest.json`
- task set id: `dev` for v0
- fixture vault root: `benchmarks/note-work/fixtures/medium-vault`
- runtime task records from `tasks/dev.runtime.json`

`tasks/dev.json` is the gold/scoring file. Agent and baseline runners must not
load it while solving tasks. Runtime task paths are vault-relative. A runner may
convert them to absolute paths internally, but it must emit absolute paths in
run output evidence.

The runtime task view intentionally omits:

- `expected_sources`
- `expected_evidence`
- `expected_links`
- `expected_edits`
- `rubric`
- `judge_policy`
- `source_profile_id`
- `synthetic_generation`

## Required Output

The runner writes JSON matching `schemas/run-output.schema.json`.

Required per-task evidence:

- `task_id`
- `status`
- `duration_ms`
- `answer`
- `sources_read`
- `candidate_paths_scanned`
- `files_edited`
- `links_suggested`
- `mutation_checks`
- `cost`
- `failure_notes`

`sources_read`, `candidate_paths_scanned`, and `files_edited` must contain
absolute paths under the fixture vault. The scorer normalizes them back to
vault-relative paths.

## Permissions

The runner must treat task fields as permissions:

- `source_scope: full_vault_except_forbidden`: search the fixture vault, excluding `Restricted/` and explicit `forbidden_sources`.
- `source_scope: specific_sources_only`: search only `allowed_sources`; use this only when the user explicitly scopes the request.
- `source_scope: no_vault_scan`: do not scan the vault.
- `allowed_sources`: runtime source scope only when `source_scope` is `specific_sources_only`; it is not a gold-label candidate list.
- `forbidden_sources`: files that must not be read, scanned, cited, or edited.
- `mutation_policy: none`: do not edit files.
- `mutation_policy: suggest_only`: do not edit files; suggestions only.
- `mutation_policy: allowed_edits`: edit only `allowed_edits`.
- `mutation_policy: clarify_before_mutation`: ask for clarification and do not edit.

Restricted boundary notes under `Restricted/` are synthetic placeholders, but they
still test the permission boundary. A runner should not read them unless a task
explicitly permits that scope; v0 tasks do not grant that permission.

## Runtime Constraints

- No network calls are required for v0.
- No provider request or response payloads may be written into benchmark artifacts.
- No hidden prompts, credentials, or raw local dogfood notes may be committed.
- Agent actions should be deterministic where possible. If retries are used,
  record the final evidence and failure notes.
- If an LLM judge is added later, store judge prompts and judge outputs as
  separate review artifacts. The deterministic scorer must still report source,
  link, mutation, scope, cost, and latency metrics.

## Minimal Runner Pseudocode

```text
load manifest
load runtime task set
for each task:
  construct vault scope from source_scope and forbidden_sources
  run agent with read/edit permissions matching mutation_policy
  collect files read, scanned paths, edits, suggested links, cost, latency
  write a run record matching run-output schema
write one run-output JSON file
run benchmarks/note-work/scripts/score.mjs against that output
run benchmarks/note-work/scripts/validate.mjs
```

## Example Commands

Lexical baseline:

```bash
node benchmarks/note-work/scripts/run-lexical-baseline.mjs
node benchmarks/note-work/scripts/score.mjs
```

Future agent runner:

```bash
node path/to/lumina-agent-runner.mjs \
  --benchmark benchmarks/note-work \
  --task-set dev \
  --tasks benchmarks/note-work/tasks/dev.runtime.json \
  --out benchmarks/note-work/runs/lumina-agent-dev.json

node benchmarks/note-work/scripts/score.mjs \
  --run benchmarks/note-work/runs/lumina-agent-dev.json \
  --out-json benchmarks/note-work/reports/lumina-agent-score-report.json \
  --out-md benchmarks/note-work/reports/lumina-agent-score-report.md
```
