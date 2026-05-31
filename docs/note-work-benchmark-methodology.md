# Lumina Note Work Benchmark Methodology

This document defines the methodology for a Lumina-specific benchmark focused
on note work: finding, searching, synthesizing, and creating useful links inside
a Markdown knowledge vault.

This document is also a launch reference for future benchmark-related goals.
Any agent or contributor creating benchmark vaults, tasks, scorers, runners, or
reports should read this first and treat its data, privacy, scoring, and
reporting rules as default constraints unless a newer decision document
explicitly supersedes them.

The benchmark is not meant to become a general LLM leaderboard. Its job is to
answer one product question:

> Does Lumina's agent become better at knowledge work inside a real note vault?

A good benchmark is not just a set of prompts that resemble real user traffic.
It is a repeatable sampling, scoring, and diagnosis system for the product
experience we care about. It should be representative enough to predict real
user outcomes, but also discriminative enough to expose model and system
differences, reliable enough to rerun, interpretable enough to debug, and
maintainable enough to survive model and product changes.

## Why Build Our Own Benchmark

Lumina is not only a RAG app and not only a chat agent. The core workflow mixes:

- local Markdown files
- WikiLinks
- backlinks
- tags
- folder structure
- generated `wiki/` synthesis pages
- explicit user references such as selected text and `@` files
- agent actions that may read, write, edit, and create links

Generic retrieval benchmarks usually measure document retrieval or question
answering. That is useful, but incomplete for Lumina. We need to evaluate
whether the agent can find the right notes, use the graph structure, produce
grounded answers, recommend meaningful links, and mutate notes safely.

## Target Distribution

"Close to the real world" means more than making prompts look like user input.
For Lumina, the target distribution has five layers:

1. **Task distribution.** The mix of finding, searching, synthesizing, linking,
   rewriting, organizing, and safe mutation tasks.
2. **Intent distribution.** Clear asks, vague asks, underspecified asks,
   unreasonable asks, conflicting asks, and requests that should be clarified
   before touching files.
3. **Context distribution.** Current note, selected text, `@` files, prior
   conversation, long vault context, generated `wiki/` pages, PDF-derived
   notes, graph edges, and tool results.
4. **Output value distribution.** Correctness, usefulness, time saved,
   provenance, uncertainty handling, writing quality, link usefulness, and
   format/style compliance.
5. **Runtime distribution.** Model choice, system prompt, tool permissions,
   retrieval quality, token limits, latency, cost, retries, and failure modes.

The benchmark should sample common note work, but it should not mirror raw
traffic proportions blindly. Low-frequency high-risk tasks need intentional
oversampling because they are exactly where a local-first knowledge tool loses
trust: reading private material without consent, editing the wrong note,
dropping frontmatter, fabricating provenance, or missing a critical note in a
long context.

## External Benchmarks To Learn From

The current benchmark landscape has several useful patterns:

1. **Question-bank benchmarks.** MMLU, MMLU-Pro, GPQA, and HLE are closed-set
   and cheap to score. They are reproducible and easy to compare, but can be
   saturated, contaminated, or limited by label quality.
2. **Human-preference and open-dialogue benchmarks.** Chatbot Arena, MT-Bench,
   and Arena-Hard are closer to subjective product experience through pairwise
   preference or judge-based scoring, but they must handle position, verbosity,
   format, and self-preference bias.
3. **Dynamic and contamination-resistant benchmarks.** LiveBench,
   LiveCodeBench, and BrowseComp use recent sources, frequent updates, and
   objective answers where possible. They trade breadth for freshness and
   clearer verification.
4. **Environment and real-task benchmarks.** SWE-bench, WebArena, OSWorld,
   WorkArena, and tau-bench measure whether an agent can complete work in a
   stateful environment, often through final state, tests, or tool/database
   outcomes rather than answer text alone.
5. **Multi-metric transparent frameworks.** HELM-style scorecards start from
   scenarios and metrics, then report tradeoffs instead of a single number.

Lumina's benchmark should borrow from all five patterns: small closed-set
checks where possible, preference or rubric review for open-ended note quality,
dynamic private holdouts, state/diff-based checks for edits, and multi-metric
reporting.

### BEIR

BEIR is useful because it treats retrieval as heterogeneous, not as one narrow
task. It evaluates multiple retrieval systems and keeps lexical baselines such
as BM25 relevant.

Takeaway for Lumina: keep simple baselines. Compare graph-assisted behavior
against file-name search, content grep/BM25-style search, and the current agent
using standard file tools. If a graph layer cannot beat these simple baselines
on note work, it is not yet worth the product complexity.

Source: https://arxiv.org/abs/2104.08663

### KILT

KILT evaluates knowledge-intensive tasks while also measuring provenance. This
matters because an answer can sound right while being sourced from the wrong
page.

Takeaway for Lumina: every grounded task should track expected source notes.
The benchmark should score both answer quality and provenance quality. For many
tasks, finding the right notes is at least as important as writing a fluent
answer.

Source: https://arxiv.org/abs/2009.02252

### RAGAS, ARES, And RAGChecker

RAG evaluation frameworks split performance into retrieval quality,
context relevance, faithfulness, answer relevance, and diagnosis of which stage
failed.

Takeaway for Lumina: avoid one blended "agent score" at first. Report separate
scores for source discovery, grounding, link usefulness, mutation safety, and
cost. A single score hides the most actionable failures.

Sources:

- https://arxiv.org/abs/2309.15217
- https://arxiv.org/abs/2311.09476
- https://arxiv.org/abs/2408.08067

### MultiHop-RAG

MultiHop-RAG stores questions, ground-truth answers, and supporting evidence for
queries that require multiple pieces of evidence.

Takeaway for Lumina: cross-note synthesis must have explicit supporting notes.
Tasks like "how did my position on X change?" or "connect this meeting note to
the project history" should require more than one source.

Source: https://arxiv.org/abs/2401.15391

### STaRK

STaRK evaluates retrieval over both textual and relational knowledge bases.
This is close to Lumina's shape: Markdown content plus WikiLinks, backlinks,
tags, folders, and synthesized wiki pages.

Takeaway for Lumina: treat graph structure as first-class evidence, but never
as a substitute for source text. A good run should use relations to decide what
to read, then verify claims from the Markdown.

Source: https://arxiv.org/abs/2404.13207

### AgentBench, GAIA, WorkArena, And OSWorld

Agent benchmarks evaluate multi-step tool use, not just final text. Their main
lesson is that many failures happen in planning, tool choice, state tracking,
and stopping behavior.

Takeaway for Lumina: for agent-backed benchmark runs, log intermediate actions:
which files were read, which graph tools were called, which files were edited,
and whether the agent stopped after producing the requested result.

Sources:

- https://arxiv.org/abs/2308.03688
- https://arxiv.org/abs/2311.12983
- https://arxiv.org/abs/2403.07718
- https://arxiv.org/abs/2404.07972

### EnterpriseRAG-Bench And Tau-Knowledge

Enterprise and customer-support knowledge benchmarks are useful because they
include messy internal data, near-duplicates, incomplete docs, and tasks that
combine retrieval with correct action.

Takeaway for Lumina: realistic vault fixtures should include stale notes,
contradictory notes, renamed concepts, isolated notes, half-written daily
notes, duplicated project names, and notes that should not be touched.

Sources:

- https://arxiv.org/abs/2605.05253
- https://sierra.ai/blog/tau-knowledge

### HippoCamp

HippoCamp targets personal file-system memory and separates search, perception,
reasoning, and step-level annotations.

Takeaway for Lumina: long-term personal knowledge work needs failure
attribution. We should be able to tell whether a bad answer came from bad
search, missing graph expansion, weak reasoning, unsafe editing, or insufficient
task instructions.

Source: https://hippocamp-ai.github.io/

### HELM, LiveBench, And Benchmark Aging

HELM is useful for its broad scorecard mindset: capability should not be reduced
to accuracy alone. Robustness, calibration, fairness, toxicity, efficiency, and
other dimensions may matter depending on the deployment surface. LiveBench is
useful because it treats contamination and benchmark freshness as first-class
problems. OpenAI's 2026 SWE-bench Verified analysis is a concrete reminder that
even strong benchmarks can age out when tasks become contaminated, tests reject
valid solutions, or frontier systems saturate the signal.

Takeaway for Lumina: keep the benchmark dynamic. Use private holdout tasks for
release decisions, add fresh regression cases from real failures, and report
cost/latency and failure buckets alongside quality. Do not treat a static score
as permanent evidence.

Sources:

- https://arxiv.org/abs/2211.09110
- https://arxiv.org/abs/2406.19314
- https://arxiv.org/abs/2403.07974
- https://openai.com/index/browsecomp/
- https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/

### General Model Leaderboards

Benchmarks such as MMLU-Pro, GPQA, C-Eval, CMMLU, IFEval, HumanEval,
SWE-bench, Chatbot Arena, MT-Bench, AlpacaEval, Arena-Hard, OpenCompass,
lm-evaluation-harness, OpenAI Evals, and Inspect are useful context when
choosing a base model or evaluation framework.

They should not define Lumina's product benchmark. Most of them test broad
knowledge, general reasoning, instruction following, code repair, or generic
assistant preference. Lumina needs a private product benchmark for note work:
vault search, provenance, WikiLinks, graph structure, safe mutation, and
knowledge-management usefulness.

Sources:

- https://arxiv.org/abs/2009.03300
- https://arxiv.org/abs/2406.01574
- https://arxiv.org/abs/2406.04127
- https://arxiv.org/abs/2403.04132
- https://arxiv.org/abs/2306.05685
- https://arxiv.org/abs/2406.11939
- https://arxiv.org/abs/2307.13854
- https://arxiv.org/abs/2406.12045

### Benchmark Validity Critiques

Recent benchmark-methodology critiques are worth taking seriously. The Oxford
Internet Institute's 2025 review of 445 AI benchmarks found that many benchmarks
lack clear construct definitions and that only a minority use statistical
methods for model comparisons.

Takeaway for Lumina: define what each task family measures before collecting
tasks. Report uncertainty and per-bucket results. Do not hide weak measurement
behind a polished aggregate score.

Source: https://www.oii.ox.ac.uk/news-events/study-identifies-weaknesses-in-how-ai-systems-are-evaluated/

## Product Scope

The benchmark should focus on the three user jobs that define Lumina's note
agent:

1. Find the right material in the vault.
2. Synthesize across notes without hallucinating.
3. Create useful associations, links, and note structure.

The benchmark should not initially optimize for:

- public leaderboard comparability
- broad general reasoning
- model-vs-model marketing claims
- long academic benchmark scale
- fully automatic grading for every open-ended writing task

## Quality Bar

Use these criteria to decide whether a benchmark change is worth adding:

1. **Validity.** The task must measure a named Lumina capability, such as source
   discovery, grounded synthesis, useful link creation, or safe mutation. If a
   failure cannot be interpreted, the task is underspecified.
2. **Representativeness.** The task should resemble a real note-work job, real
   failure mode, or high-risk guardrail case.
3. **Discriminativeness.** The task should separate systems. If every system
   passes or every system fails, keep it only as a smoke test or redesign it.
4. **Reliability.** Reruns should not swing wildly because of prompt wording,
   random seed, judge ordering, or incidental fixture details.
5. **Scorability.** Prefer deterministic checks for sources, links, diffs,
   schemas, and permissions. Use LLM judges only where deterministic checks
   cannot capture usefulness.
6. **Maintainability.** The fixture and labels should be easy to review, extend,
   and refresh without turning the benchmark into a brittle one-off.

## Data Construction Principle: Real Knowledge Bases First

Lumina's benchmark should be grounded in real knowledge bases. "Real data" does
not mean raw private notes must be committed. It means the tasks, vault shape,
note relationships, noise, contradictions, and workflows should come from real
knowledge-management use instead of an invented toy world.

Prefer these sources, in order:

1. Public or licensed real knowledge bases that can be committed and reviewed.
2. Consented dogfood vaults analyzed locally, with no raw private content
   committed.
3. Anonymized real-vault profiles that preserve structure but remove private
   text.
4. Synthetic vaults generated from those real-vault profiles.

Before creating benchmark tasks or fixtures, the author should inspect or
profile at least one real knowledge base when possible. The profile should
capture the characteristics that make note work realistic:

- note type mix: daily notes, project notes, concept notes, meeting notes,
  PDF-derived notes, and generated `wiki/` pages
- folder taxonomy, tag distribution, and naming conventions
- WikiLink density, missing-link patterns, backlinks, and isolated notes
- duplicated concepts, renamed concepts, stale notes, and contradictions
- note age distribution and revision/update patterns
- common user workflows and real task phrasing
- privacy boundaries and folders that should never be scanned by default

If a v0 benchmark must start before enough real vault profiles exist, mark that
fixture as provisional. Synthetic-only results are useful for smoke testing the
runner and scorer, but they should not be treated as strong evidence of product
quality.

### Synthetic Data Is A Derived Layer

Synthetic data is useful, but it should serve the real-data strategy. Use it to:

- de-identify private patterns
- create deterministic fixtures that can be committed
- expand coverage for long-tail and high-risk cases
- generate controlled contradictions, stale notes, missing links, and mutation
  tasks
- scale a small set of real task templates into paraphrases and variants

Future agents may synthesize benchmark knowledge bases from real-vault profiles,
but they should preserve structural statistics rather than copy private
content. A synthetic fixture should record:

- `source_profile_id`
- source visibility: public, licensed, dogfood-local, or anonymized
- generation prompt or script version
- which properties were preserved, transformed, or invented
- review status and reviewer, when applicable

Avoid a closed loop where the same model creates the vault, writes the
questions, produces the gold answers, and judges the run. Synthetic tasks should
be checked by deterministic validators, human review, or independent evidence
from the fixture.

## Core Task Families

Task families should describe the user's knowledge-management job. They should
not mix in implementation safeguards as if those safeguards were user goals.
Privacy, permission scope, consent, destructive-edit handling, and provider
payload handling are cross-cutting guardrails. They should be evaluated on top
of every relevant task family and reported as a separate risk slice, not treated
as a central note-work task type.

### 1. Find

Tests whether the system can locate relevant notes.

Examples:

- "Where did I first define spaced repetition debt?"
- "Which notes mention the launch checklist but are not linked from the launch plan?"
- "Find the source note for the claim that PDF highlights should be converted before summary."

Primary metrics:

- `source_recall@k`
- `source_precision@k`
- `forbidden_source_violations`
- `query_cost`

### 2. Search And Compare

Tests whether the system can search across similar notes and distinguish
near-duplicates or stale information.

Examples:

- "Which of these two product notes is newer?"
- "Compare the old and new assumptions about graph-assisted retrieval."
- "Find notes that disagree about whether auto-linking should be enabled."

Primary metrics:

- correct source set
- stale-source avoidance
- contradiction detection
- answer faithfulness

### 3. Synthesize

Tests whether the system can combine multiple notes into a grounded answer.

Examples:

- "Summarize my current position on knowledge graph memory."
- "What are the open questions across the Agent and wiki notes?"
- "Turn these research notes into a short design memo."

Primary metrics:

- `supporting_source_recall`
- grounded claim coverage
- unsupported claim count
- answer usefulness, judged separately from factuality

### 4. Link

Tests whether the system can create or recommend meaningful associations.

Examples:

- "Suggest five WikiLinks for the current note."
- "Which isolated notes should be connected to this project?"
- "Find a bridge note that connects graph retrieval and PDF workflows."

Primary metrics:

- expected link precision
- expected link recall
- explanation quality
- false-link severity

### 5. Mutate

Tests whether the system can safely edit notes.

Examples:

- "Split this daily note into project and concept notes."
- "Add missing WikiLinks without changing prose."
- "Create a synthesis note from these sources and preserve provenance."

Primary metrics:

- allowed file edits only
- frontmatter preservation
- existing link preservation
- expected diff checks
- provenance fields present

## Cross-Cutting Guardrails

Guardrails are not standalone user task types. They are constraints on how the
agent performs find, search/compare, synthesize, link, and mutate tasks.

The benchmark should track guardrails such as:

- **Scope compliance.** Use only the files, folders, or current-note context the
  user granted for the task.
- **Consent before mutation.** Do not edit, delete, move, or broadly rewrite
  notes unless the task clearly grants that action and scope.
- **Protected source handling.** Do not read, cite, scan, or summarize protected
  folders or provider payloads unless the task explicitly grants that scope.
- **Clarification behavior.** Ask before acting when the task is underspecified
  and the next step would broaden search or mutate files.
- **Report hygiene.** Do not write private note text, provider payloads,
  hidden prompts, credentials, or reversible anonymization into committed
  benchmark artifacts.

Guardrail cases can be implemented as dedicated regression tasks when needed,
but reports should label them as guardrail or high-risk checks. They should not
define the center of the benchmark.

### High-Risk Oversampling

Raw usage will contain many easy or low-risk tasks. The benchmark should still
over-sample high-risk note-work cases and report them separately.

High-risk Lumina cases include:

- private or sensitive notes that must not be read without explicit user intent
- destructive edits, folder moves, deletes, or broad rewrites
- tasks where stale notes contradict newer notes
- long-context tasks where one small note changes the answer
- generated synthesis notes that must preserve `source_paths`
- tool permission boundaries, especially when the user asks only for advice
- hallucinated citations or links that would pollute the user's graph

These tasks should not dominate the overall product score, but no release should
pass if a critical high-risk bucket regresses.

## Fixture Vault Design

Start with small, inspectable vaults. The goal is reliable diagnosis, not scale.

### Real Knowledge Base Profiles

Purpose:

- preserve the shape of real note work without exposing private content
- guide synthetic vault generation
- make benchmark tasks traceable to real workflows

Must include:

- source visibility and license/consent status
- note counts by type and folder
- approximate note length distribution
- tag, WikiLink, backlink, and isolated-note statistics
- examples of real task templates, rewritten without private details
- known privacy exclusions
- known stale, contradictory, duplicated, or renamed-concept patterns

Profiles are safe to commit only when they contain no raw private text,
personally sensitive details, provider payloads, or reversible anonymization.

### Tiny Synthetic Vault

Size: 20 to 40 Markdown notes.

Purpose:

- deterministic gold labels
- fast local runs
- easy review in PRs
- structure derived from real knowledge-base profiles where possible

Must include:

- normal concept notes
- daily notes
- project notes
- explicit WikiLinks
- missing but expected WikiLinks
- backlinks
- tags
- one or two stale notes
- one or two contradictory notes
- one isolated note

### Medium Realistic Vault

Size: 100 to 300 Markdown notes.

Purpose:

- test search noise
- test near-duplicates
- test graph expansion depth
- test latency and tool count

Must include:

- repeated topic names
- renamed concepts
- partly overlapping projects
- PDF-derived notes
- meeting notes
- generated `wiki/` pages with `source_paths`
- notes that should not be edited

### Dogfood Vault

Size: real user vaults, local only.

Purpose:

- catch product gaps synthetic data misses
- collect new task patterns

Rules:

- do not commit real private notes
- require owner consent before using a dogfood vault for benchmark profiling
- commit only anonymized real-vault profiles or task templates
- store local results outside git by default

## Sampling Strategy

Build benchmark data from several sources, in this order:

1. Real knowledge-base profiles from public, licensed, or consented local vaults.
2. Real product workflows rewritten into safe fixture form.
3. Real failure cases anonymized into regression tasks.
4. Synthetic fixture tasks derived from real-vault profiles for deterministic
   coverage.
5. Expert-written edge cases for mutation safety, stale notes, long-context
   omissions, scope, consent, and protected-source handling.
6. Synthetic variants and paraphrases to fill holes after the above sources are
   covered.

Synthetic data is acceptable for fixture construction, but it should not create
a closed loop where a model writes the task, answers the task, and judges the
task without human or deterministic checks. Every synthetic task should be
reviewable from the fixture notes and expected evidence.

Separate the task pool into two explicit sets:

1. **Real-distribution set.** Tasks that approximate normal note-work usage,
   weighted by frequency, user value, and product importance.
2. **Stress-diagnostic set.** Deliberately difficult tasks covering long-tail
   and high-risk failures: ambiguity, wrong premises, long context, multi-hop
   graph traversal, tool failure, stale notes, forbidden paths, and cross-file
   mutation.

Report both. Do not let an easy real-distribution set hide failures in the
stress-diagnostic set, and do not let the stress set define ordinary product
experience by itself.

## Task Schema

Each task should be a data record, not prose hidden in a test file.

```json
{
  "id": "link-current-note-001",
  "family": "link",
  "vault": "tiny-synthetic",
  "data_origin": "real_profile_derived_synthetic",
  "source_profile_id": "profile-note-work-001",
  "synthetic_generation": {
    "is_synthetic": true,
    "generator": "human+llm",
    "prompt_or_script_version": "vault-synthesis-v0",
    "review_status": "human-reviewed"
  },
  "prompt": "Suggest five WikiLinks for the current note and explain each one.",
  "current_file": "Projects/Graph Agent.md",
  "allowed_sources": [
    "Concepts/Knowledge Graph.md",
    "Concepts/RAG.md",
    "Notes/WikiLinks.md"
  ],
  "expected_sources": [
    "Concepts/Knowledge Graph.md",
    "Concepts/RAG.md"
  ],
  "expected_links": [
    "[[Knowledge Graph]]",
    "[[RAG]]"
  ],
  "forbidden_sources": [
    "Private/Journal.md"
  ],
  "mutation_policy": "none",
  "rubric": {
    "source_recall_weight": 0.3,
    "link_precision_weight": 0.4,
    "explanation_weight": 0.2,
    "boundary_weight": 0.1
  }
}
```

Use absolute paths only in run outputs. Fixture and task definitions should use
vault-relative paths so they stay portable.

## Run Output Schema

Every run should emit structured evidence for diagnosis.

```json
{
  "task_id": "link-current-note-001",
  "system": "agent-current",
  "system_version": "local-dev",
  "model": {
    "provider": "openai",
    "model": "example-model"
  },
  "prompt_template_id": "note-work-agent-v0",
  "random_seed": null,
  "started_at": "2026-05-31T12:00:00.000Z",
  "duration_ms": 18432,
  "answer": "...",
  "sources_read": [
    "Projects/Graph Agent.md",
    "Concepts/Knowledge Graph.md"
  ],
  "graph_calls": [
    {
      "tool": "graph_neighbors",
      "args": { "path": "Projects/Graph Agent.md", "depth": 2 }
    }
  ],
  "files_edited": [],
  "links_suggested": [
    "[[Knowledge Graph]]",
    "[[RAG]]"
  ],
  "cost": {
    "tool_calls": 4,
    "input_tokens": 12000,
    "output_tokens": 900,
    "estimated_cost_usd": 0.12
  }
}
```

## Metrics

### Retrieval Metrics

- `source_recall@k`: expected sources found in the top-k read or retrieved set.
- `source_precision@k`: retrieved sources that were expected or allowed.
- `forbidden_source_violations`: count of disallowed files read or retrieved.
- `unnecessary_scan`: true when the agent scans broad vault areas without task
  need.

### Grounding Metrics

- `claim_support_rate`: fraction of key answer claims supported by source notes.
- `unsupported_claim_count`: answer claims not supported by read sources.
- `provenance_accuracy`: whether cited notes actually contain the cited facts.
- `insufficient_evidence_behavior`: whether the agent says it cannot answer
  when sources are missing.

### Linking Metrics

- `link_precision`: suggested links that are expected or acceptable.
- `link_recall`: expected links suggested.
- `bridge_link_found`: whether the agent found a useful cross-cluster link.
- `false_link_severity`: high when a suggested link would mislead the user's
  future graph.

### Mutation Metrics

- `allowed_edit_compliance`: all edits are within allowed files.
- `frontmatter_preserved`: existing YAML frontmatter remains valid and intact.
- `existing_links_preserved`: unrelated WikiLinks are not removed.
- `expected_diff_match`: output diff satisfies task-specific checks.
- `provenance_written`: synthesis notes include source links or `source_paths`.

### Efficiency Metrics

- `duration_ms`
- `tool_calls`
- `files_read_count`
- `broad_search_count`
- `input_tokens`
- `output_tokens`

Efficiency is not the primary score, but it guards against brute-force vault
scans that feel bad in a local-first note app.

## Scoring Model

Use family-specific scores. Do not collapse everything into a single global
score in v0.

Recommended v0 scores:

- `find_score`
- `search_compare_score`
- `synthesis_score`
- `link_score`
- `mutation_score`
- `boundary_score`

Each score should expose submetrics. A failing run should make the failure mode
obvious.

## Baselines

Benchmark results are only useful if they compare against stable baselines.

Initial baselines:

1. Filename search only.
2. Content grep / lexical search.
3. Current opencode agent with file tools.
4. Current opencode agent with explicit `@` files.
5. Future graph-assisted agent.
6. Future graph-assisted agent plus `wiki/` synthesis layer.

The graph-assisted agent should not be judged in isolation. It needs to prove
that graph context improves outcomes over simple search and current agent
behavior.

## Judge Strategy

Use deterministic checks whenever possible:

- did the run read expected source files?
- did it avoid forbidden files?
- did it suggest expected links?
- did it edit only allowed files?
- did frontmatter remain valid?

Use LLM judges only for open-ended quality:

- answer usefulness
- explanation clarity
- whether a synthesis is coherent
- whether a recommended link is reasonable but not listed in gold labels

LLM judge output must be stored as review evidence, not silently folded into a
single score. Human review should be possible for disputed cases.

For LLM judges:

- run blind when comparing systems
- randomize answer order for pairwise judgments
- hide model names
- track length bias and format bias
- keep the judge prompt versioned
- periodically compare judge decisions against human review

For high-risk tasks, do not rely on LLM judge alone. A deterministic or human
review gate should be required.

Preferred oracle order:

1. Final state comparison for note edits, file creation, or metadata changes.
2. Programmatic constraints such as valid YAML, unchanged protected regions,
   allowed path checks, and expected WikiLinks.
3. Source/provenance checks against expected files and cited evidence.
4. Short-answer or structured-output checks when the task supports them.
5. Human preference or rubric scoring for open-ended synthesis and writing.
6. LLM-as-judge only when calibrated and stored as reviewable evidence.

## Statistics And Reporting

Every report should include:

- per-family scores
- per-risk-bucket scores
- sample counts
- confidence intervals or bootstrap intervals when comparing systems
- repeated-run stability where the system is nondeterministic
- `pass@k` or `pass^k` for agent tasks when repeated attempts are meaningful
- cost and latency
- top failure categories
- model/provider/version information
- prompt template and benchmark version

Do not treat a small aggregate-score difference as meaningful unless the sample
size, uncertainty, and judge variance support it. The benchmark should explain
why a system won, not only that it won.

## Benchmark Sets

Maintain at least three sets:

1. **Dev set.** Visible to developers. Used for schema work, prompt iteration,
   tool development, and fixture debugging.
2. **Private test set.** Hidden from day-to-day tuning. Used for release
   decisions and regression gates.
3. **Live eval set.** Continuously refreshed from dogfood runs, real failures,
   and newly discovered edge cases. Local/private by default.

The dev set can be small and transparent. The private and live sets protect the
benchmark from overfitting and stale conclusions.

## Benchmark Self-Checks

Before a task becomes part of a release gate, validate the benchmark item
itself:

- The prompt has a clear expected behavior.
- The gold sources and answers are correct.
- A knowledgeable human can solve the task from the fixture.
- A simple baseline cannot pass trivially unless the task is meant to be a
  smoke test.
- Stronger systems can separate from weaker systems on the task or family.
- Paraphrasing the prompt does not invert the expected result.
- The task maps to a real user workflow, real failure, or intentional stress
  case.
- Known limitations and judgment ambiguity are documented.

Benchmark quality should be reviewed like product code. Bad labels, ambiguous
tasks, and over-narrow checks will produce misleading conclusions.

## Visibility And Privacy

Benchmark artifacts have different visibility:

- Public or licensed real knowledge bases: safe to commit only when the license
  and project decision allow it.
- Real-vault profiles: safe to commit only when they contain no raw private text
  or reversible anonymization.
- Synthetic fixture vaults: safe to commit after leakage review.
- Task schemas: safe to commit when prompts and gold labels do not expose
  private content.
- Run outputs from synthetic fixtures: safe to commit when small and reviewed.
- Dogfood vaults: never commit.
- Dogfood run outputs: local only unless manually anonymized.
- Provider payloads, API keys, raw private notes, and hidden prompts: never
  commit.

## Completion Contract For A Benchmark-Build Goal

When a future goal is launched to "build the Lumina benchmark", completion
should mean the repository contains a runnable, reviewable benchmark system, not
only a research note or a folder of prompts.

The ideal completed goal should leave these artifacts:

1. **Benchmark specification.** This methodology document, plus versioned
   schemas for real-vault profiles, tasks, run outputs, and score reports.
2. **Real-knowledge-base grounding.** At least one safe real-vault profile from
   a public/licensed source or consented local dogfood analysis. The profile
   should explain the note structure, link structure, privacy status, and how it
   informed the benchmark fixture.
3. **Inspectable fixture vault.** A committed synthetic or public fixture vault
   with enough realistic structure to exercise note search, synthesis, links,
   stale notes, contradictions, and safe mutation.
4. **Task set.** A committed dev task set covering find, search/compare,
   synthesize, link, and mutate tasks, with explicit expected sources, expected
   links or diffs, forbidden sources, guardrail constraints, and scoring
   weights.
5. **High-risk and guardrail slice.** A separately labeled set of
   destructive-edit, stale-source, long-context, hallucinated-provenance, scope,
   consent, and protected-source cases. This slice must be reported separately
   from ordinary task performance.
6. **Deterministic validation.** A command that validates benchmark schemas,
   fixture paths, expected sources, forbidden paths, and basic fixture
   consistency.
7. **Scoring pipeline.** A command that reads run outputs and produces a
   scorecard with per-family metrics, high-risk metrics, cost/latency, failure
   categories, and sample counts.
8. **Baseline runner.** At least one simple baseline, such as filename/content
   lexical search, so agent or graph-assisted results have a meaningful lower
   bound.
9. **Agent runner interface.** A clear runner contract for executing the current
   Lumina agent or future graph-assisted agent against the same tasks, even if
   the first implementation supports only a subset.
10. **Example report.** A committed example report generated from the fixture
    and baseline run, showing exactly how benchmark results should be read.
11. **Operating documentation.** Short instructions for adding tasks, running
    validation, running baselines, running agent evals, and interpreting
    results.

A benchmark-build goal is not complete if:

- tasks exist but cannot be run by a command
- runs can execute but produce no structured score report
- scores exist but do not identify sources, links, mutations, and privacy
  violations separately
- synthetic data has no real-knowledge-base profile or provenance
- private notes, provider payloads, or reversible anonymization are committed
- only a graph-assisted or model-heavy path exists, with no simple baseline
- the report only gives an aggregate score without per-family and high-risk
  slices
- the task set cannot explain which product decision it helps make

## Recommended V0

Build the first version in this order:

1. Methodology document.
2. Real knowledge-base profile schema, task schema, and run output schema.
3. One or more safe real-vault profiles. Use public/licensed data where
   possible; otherwise use consented dogfood profiling with no raw notes
   committed.
4. Tiny synthetic vault with 20 to 40 notes, derived from or calibrated against
   the real-vault profiles.
5. 25 to 40 dev tasks across find, search/compare, synthesize, link, and
   mutate.
6. A small high-risk and guardrail bucket with mutation, stale-note,
   long-context, hallucinated-provenance, scope, consent, and protected-source
   cases.
7. Deterministic validator for task files, fixture paths, and profile metadata.
8. Offline scorer for run outputs.
9. One baseline runner for lexical search.
10. Agent runner after the schema and deterministic scoring are stable.
11. Private holdout tasks after the dev set proves useful.

Do not start with a large fixture, a public leaderboard, or a model-heavy eval
pipeline. That would make iteration slower before we know whether the task
design is right.

## What Would Make The Benchmark Bad

The benchmark is probably wrong if:

- agents can pass by keyword matching only
- tasks do not require source provenance
- link tasks reward obvious links but not useful cross-note associations
- mutation tasks ignore diff safety
- synthetic vaults are invented without real knowledge-base grounding
- synthetic tasks leak private details or preserve reversible anonymization
- real data is used without license, consent, provenance, or visibility rules
- private dogfood notes leak into committed artifacts
- every score depends on an LLM judge
- graph-assisted runs win only by reading far more files
- results are reported without sample counts or uncertainty
- the fixture is too clean and lacks stale, ambiguous, or contradictory notes
- high-risk guardrail checks are too rare to affect release decisions
- task labels are not reviewed
- prompt paraphrases change the intended answer
- the score does not correlate with manual acceptance on dogfood tasks

## Open Questions

- Should `wiki/` synthesis pages be treated as primary sources, derived
  sources, or both depending on the task?
- How should the benchmark reward "reasonable but not gold-listed" link
  suggestions?
- Should graph traversal depth be capped globally or per task family?
- Should future semantic entity edges be benchmarked separately from existing
  WikiLinks/backlinks/tags/folders?
- Which public or licensed real knowledge bases are suitable as initial source
  profiles for Lumina?
- What level of anonymized real-vault profiling is useful without creating a
  privacy or de-anonymization risk?
