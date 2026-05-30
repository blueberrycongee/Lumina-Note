# Lumina Note Work Benchmark v0 Example Report

Run output: `runs/baseline-lexical-dev.json`
System: `lexical-baseline@v0.1`
Task set: `dev`
Fixture: `medium-synthetic-v0`

## Summary

- Tasks scored: 76
- High-risk tasks: 49
- Mean task score: 0.8102
- High-risk mean score: 0.8275
- Scope violations: 0
- Forbidden source violations: 0
- Total estimated cost USD: 0

## Per-Family Metrics

| Family | Count | Mean score | Source recall | Scope score |
| --- | ---: | ---: | ---: | ---: |
| boundary | 8 | 0.85 | 0.875 | 1 |
| find | 14 | 0.8107 | 0.8929 | 1 |
| link | 13 | 0.8435 | 0.7821 | 1 |
| mutate | 12 | 0.75 | 0.875 | 1 |
| search_compare | 14 | 0.8682 | 0.8691 | 1 |
| synthesize | 15 | 0.7538 | 0.7556 | 1 |

## Evaluation Tiers

deterministic_smoke tasks check harness behavior and deterministic labels.
dev_realistic tasks are the more meaningful note-work slice.

| Tier | Count | Mean score | Source recall | Scope score |
| --- | ---: | ---: | ---: | ---: |
| deterministic_smoke | 56 | 0.8339 | 0.8571 | 1 |
| dev_realistic | 20 | 0.744 | 0.7833 | 1 |

## High-Risk Slice

High-risk tasks are reported separately so failures are not hidden by ordinary task averages.

| Bucket | Count | Mean score | Scope violations | Forbidden source violations |
| --- | ---: | ---: | ---: | ---: |
| boundary | 13 | 0.869 | 0 | 0 |
| destructive-edit | 3 | 0.9867 | 0 | 0 |
| hallucinated-provenance | 7 | 0.7549 | 0 | 0 |
| long-context | 3 | 0.9533 | 0 | 0 |
| mutation | 21 | 0.7924 | 0 | 0 |
| stale-source | 22 | 0.8185 | 0 | 0 |

## Dimension Scores

- Source recall: 0.8377
- Source precision: 0.5158
- Link recall: 0.9242
- Mutation score: 0.625
- Scope score: 1
- Average latency ms: 141.4605
- P95 latency ms: 183

## Failure Categories

- source_precision_loss: 69
- source_miss: 26
- mutation_expected_diff_missing: 10
- boundary_violation: 4
- link_miss: 4

## Reading Notes

This example uses the lexical baseline only. It is a lower-bound comparison for future Lumina or graph-assisted agent runs, not a model leaderboard. Open-ended quality can be reviewed from run output answers, but v0 scoring here uses deterministic source, link, mutation, scope, cost, and latency evidence.
