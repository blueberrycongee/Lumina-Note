# Lumina Note Work Benchmark v0 Example Report

Run output: `runs/baseline-lexical-dev.json`
System: `lexical-baseline@v0.1`
Task set: `dev`
Fixture: `medium-synthetic-v0`

## Summary

- Tasks scored: 76
- High-risk tasks: 49
- Primary task score: 0.7197
- Ungated outcome score: 0.7197
- High-risk mean score: 0.6907
- Hard-gate pass rate: 1
- Blocking failures: 0
- Total estimated cost USD: 0

## Per-Family Metrics

| Family | Count | Primary score | Ungated outcome | Hard-gate pass rate | Answer source recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| boundary | 8 | 0.9375 | 0.9375 | 1 | 0.875 |
| find | 14 | 0.8929 | 0.8929 | 1 | 0.8929 |
| link | 13 | 0.9103 | 0.9103 | 1 | 0.9744 |
| mutate | 12 | 0.1667 | 0.1667 | 1 | 0.9445 |
| search_compare | 14 | 0.8952 | 0.8952 | 1 | 0.8691 |
| synthesize | 15 | 0.5553 | 0.5553 | 1 | 0.7556 |

## Evaluation Tiers

deterministic_smoke tasks check harness behavior and deterministic labels.
dev_realistic tasks are the more meaningful note-work slice.

| Tier | Count | Primary score | Ungated outcome | Hard-gate pass rate |
| --- | ---: | ---: | ---: | ---: |
| deterministic_smoke | 56 | 0.7546 | 0.7546 | 1 |
| dev_realistic | 20 | 0.6219 | 0.6219 | 1 |

## High-Risk Slice

High-risk tasks are reported separately so failures are not hidden by ordinary task averages.

| Bucket | Count | Primary score | Hard-gate pass rate | Blocking failures |
| --- | ---: | ---: | ---: | ---: |
| boundary | 13 | 0.9415 | 1 | 0 |
| destructive-edit | 3 | 0.903 | 1 | 0 |
| hallucinated-provenance | 7 | 0.4719 | 1 | 0 |
| long-context | 3 | 0.9037 | 1 | 0 |
| mutation | 21 | 0.4726 | 1 | 0 |
| stale-source | 22 | 0.6431 | 1 | 0 |

## Dimension Scores

- Answer source recall: 0.8816
- Evidence coverage: 0.0959
- Link recall: 0.9242
- Mutation score: 0.625
- Hard-gate pass rate: 1
- Source-read recall diagnostic: 0.8377
- Source-read precision diagnostic: 0.5158
- Average latency ms: 141.4605
- P95 latency ms: 183

## Failure Categories

- answer_evidence_miss: 73
- source_read_precision_loss: 69
- source_read_miss: 26
- answer_source_miss: 19
- mutation_expected_diff_missing: 10
- link_miss: 4

## Reading Notes

The primary score is endpoint-first: final answers, suggested links, mutation checks, and required clarification/refusal behavior. Trajectory fields such as read paths and scanned candidates are diagnostics, except for hard gates like forbidden sources, restricted paths, out-of-scope scans, and illegal edits. The lexical baseline remains a lower-bound comparison, not a product leaderboard.
