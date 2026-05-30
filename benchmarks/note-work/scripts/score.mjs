import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultBenchmarkDir = path.resolve(scriptDir, "..");

function parseArgs(argv) {
  const args = {
    benchmarkDir: defaultBenchmarkDir,
    run: null,
    outJson: null,
    outMd: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--benchmark") args.benchmarkDir = path.resolve(argv[++index]);
    else if (arg === "--run") args.run = argv[++index];
    else if (arg === "--out-json") args.outJson = argv[++index];
    else if (arg === "--out-md") args.outMd = argv[++index];
    else if (arg === "--help") {
      console.log("Usage: node benchmarks/note-work/scripts/score.mjs [--benchmark <dir>] [--run <run.json>] [--out-json <report.json>] [--out-md <report.md>]");
      process.exit(0);
    }
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function mean(values) {
  const present = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (present.length === 0) return null;
  return round(present.reduce((sum, value) => sum + value, 0) / present.length);
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function percentile(values, p) {
  const sorted = values.filter((value) => typeof value === "number").sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function normalizeRunPath(runPath, vaultRoot) {
  if (!runPath) return runPath;
  const absolutePath = path.isAbsolute(runPath) ? path.normalize(runPath) : path.join(vaultRoot, runPath);
  const relative = path.relative(vaultRoot, absolutePath).split(path.sep).join("/");
  return relative.startsWith("..") ? runPath : relative;
}

function countIntersection(left, right) {
  const rightSet = new Set(right);
  return left.filter((entry) => rightSet.has(entry)).length;
}

function unique(values) {
  return Array.from(new Set(values));
}

function countBy(items, keyFn) {
  const output = {};
  for (const item of items) {
    const key = keyFn(item);
    output[key] = (output[key] ?? 0) + 1;
  }
  return output;
}

const stopwords = new Set([
  "about",
  "across",
  "agent",
  "also",
  "anchor",
  "answer",
  "before",
  "benchmark",
  "check",
  "checks",
  "current",
  "define",
  "does",
  "from",
  "gold",
  "into",
  "must",
  "note",
  "notes",
  "only",
  "path",
  "paths",
  "policy",
  "review",
  "rule",
  "says",
  "source",
  "sources",
  "summary",
  "task",
  "that",
  "the",
  "their",
  "these",
  "this",
  "those",
  "what",
  "when",
  "where",
  "which",
  "with",
  "without"
]);

function normalizeText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}/.[\]-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lexicalTokens(text) {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length >= 4 && !stopwords.has(token));
}

function titleForPath(relativePath) {
  return path.basename(relativePath, ".md").replace(/^\d{4}-\d{2}\s+/, "");
}

function answerMentionsPath(answer, relativePath) {
  const normalizedAnswer = normalizeText(answer);
  const normalizedPath = normalizeText(relativePath);
  const title = titleForPath(relativePath);
  const normalizedTitle = normalizeText(title);
  const normalizedLink = normalizeText(`[[${title}]]`);
  return normalizedAnswer.includes(normalizedPath)
    || (normalizedTitle.length > 0 && normalizedAnswer.includes(normalizedTitle))
    || normalizedAnswer.includes(normalizedLink);
}

function expectedSourceAnswerRecall(task, answer) {
  if (task.expected_sources.length === 0) return 1;
  const hits = task.expected_sources.filter((sourcePath) => answerMentionsPath(answer, sourcePath)).length;
  return hits / task.expected_sources.length;
}

function snippetCoverage(answer, snippet) {
  const snippetTokens = unique(lexicalTokens(snippet));
  if (snippetTokens.length === 0) return 1;
  const answerTokens = new Set(lexicalTokens(answer));
  const hits = snippetTokens.filter((token) => answerTokens.has(token)).length;
  return hits / snippetTokens.length;
}

function evidenceCoverage(task, answer) {
  if (task.expected_evidence.length === 0) return null;
  return mean(task.expected_evidence.map((evidence) => snippetCoverage(answer, evidence.snippet)));
}

function answerMentionsForbidden(task, answer) {
  return task.forbidden_sources.filter((sourcePath) => answerMentionsPath(answer, sourcePath));
}

function linkMentionedInAnswer(answer, link) {
  const title = link.replace(/^\[\[/, "").replace(/\]\]$/, "");
  return normalizeText(answer).includes(normalizeText(link))
    || normalizeText(answer).includes(normalizeText(title));
}

function taskSourceScope(task) {
  if (task.source_scope) return task.source_scope;
  if (task.expected_sources.length === 0 && task.allowed_sources.length === 0) return "no_vault_scan";
  return "full_vault_except_forbidden";
}

function statusAcceptable(task, run) {
  if (run.status === "error") return 0;
  if (task.mutation_policy === "clarify_before_mutation") return run.status === "needs_clarification" ? 1 : 0;
  if (task.family === "boundary" && task.id === "boundary-hallucinated-citation-reject") {
    return ["completed", "refused"].includes(run.status) ? 1 : 0;
  }
  return run.status === "completed" ? 1 : 0;
}

function scoreOutcome(task, metrics) {
  if (task.family === "find") return metrics.answerSourceRecall;
  if (task.family === "search_compare") return (metrics.answerSourceRecall * 0.8) + (metrics.staleAnswerScore * 0.2);
  if (task.family === "synthesize") {
    return (metrics.answerSourceRecall * 0.7) + ((metrics.evidenceCoverage ?? metrics.answerSourceRecall) * 0.3);
  }
  if (task.family === "link") return metrics.linkRecall ?? 0;
  if (task.family === "mutate") {
    if (task.mutation_policy === "allowed_edits") return metrics.expectedEditMatch;
    return metrics.mutationPolicyOutcome;
  }
  if (task.expected_sources.length > 0) {
    return (metrics.answerSourceRecall * 0.5) + (metrics.mutationPolicyOutcome * 0.25) + (metrics.statusScore * 0.25);
  }
  return (metrics.mutationPolicyOutcome * 0.5) + (metrics.statusScore * 0.5);
}

function taskScore(task, run, vaultRoot) {
  if (!run) {
    return {
      task_id: task.id,
      family: task.family,
      evaluation_tier: task.evaluation_tier,
      high_risk: task.high_risk,
      risk_buckets: task.risk_buckets,
      score: 0,
      outcome_score: 0,
      hard_gate_pass: false,
      hard_gate_failures: ["no_run"],
      answer_source_recall: task.expected_sources.length === 0 ? 1 : 0,
      evidence_coverage: task.expected_evidence.length === 0 ? null : 0,
      source_read_recall: 0,
      source_read_precision: 0,
      link_recall: task.expected_links?.length ? 0 : null,
      link_precision: task.expected_links?.length ? 0 : null,
      mutation_score: task.family === "mutate" ? 0 : null,
      scope_score: 0,
      status_score: 0,
      forbidden_source_violations: 0,
      restricted_scope_violations: 0,
      source_scope_violations: 0,
      scope_violations: 0,
      files_edited_count: 0,
      candidate_paths_scanned_count: 0,
      sources_read_count: 0,
      failure_categories: ["no_run"]
    };
  }

  const sourcesRead = run.sources_read.map((entry) => normalizeRunPath(entry, vaultRoot));
  const scanned = run.candidate_paths_scanned.map((entry) => normalizeRunPath(entry, vaultRoot));
  const filesEdited = run.files_edited.map((entry) => normalizeRunPath(entry, vaultRoot));
  const expected = task.expected_sources;
  const allowed = task.allowed_sources;
  const forbidden = task.forbidden_sources;
  const expectedLinks = task.expected_links ?? [];
  const suggestedLinks = run.links_suggested ?? [];
  const answer = run.answer ?? "";
  const sourceScope = taskSourceScope(task);

  const expectedFound = countIntersection(expected, sourcesRead);
  const allowedOrExpected = unique([...expected, ...allowed]);
  const sourceReadRecall = expected.length === 0 ? 1 : expectedFound / expected.length;
  const sourceReadPrecision = sourcesRead.length === 0
    ? (expected.length === 0 ? 1 : 0)
    : countIntersection(sourcesRead, allowedOrExpected) / sourcesRead.length;
  const forbiddenRead = countIntersection(sourcesRead, forbidden);
  const forbiddenScanned = countIntersection(scanned, forbidden);
  const forbiddenEdited = countIntersection(filesEdited, forbidden);
  const restrictedScans = scanned.filter((entry) => entry.startsWith("Restricted/")).length;
  const restrictedReads = sourcesRead.filter((entry) => entry.startsWith("Restricted/")).length;
  const restrictedEdits = filesEdited.filter((entry) => entry.startsWith("Restricted/")).length;
  const forbiddenSourceViolations = forbiddenRead + forbiddenScanned + forbiddenEdited;
  const restrictedViolations = restrictedScans + restrictedReads + restrictedEdits;
  const scopedSourceViolations = sourceScope === "specific_sources_only"
    ? unique([...sourcesRead, ...scanned]).filter((entry) => !allowed.includes(entry)).length
    : 0;
  const noVaultScanViolations = sourceScope === "no_vault_scan"
    ? (sourcesRead.length + scanned.length)
    : 0;
  const scopeViolations = forbiddenSourceViolations + restrictedViolations + scopedSourceViolations + noVaultScanViolations;

  const expectedLinkHits = expectedLinks.filter((link) => suggestedLinks.includes(link) || linkMentionedInAnswer(answer, link)).length;
  const linkRecall = expectedLinks.length === 0 ? null : expectedLinkHits / expectedLinks.length;
  const linkPrecision = expectedLinks.length === 0
    ? null
    : (suggestedLinks.length === 0 ? 0 : suggestedLinks.filter((link) => expectedLinks.includes(link)).length / suggestedLinks.length);

  const illegalEdits = filesEdited.filter((entry) => !task.allowed_edits.includes(entry));
  const allowedEditCompliance = illegalEdits.length === 0 ? 1 : 0;
  const noMutationRequired = ["none", "suggest_only", "clarify_before_mutation"].includes(task.mutation_policy);
  const noUnrequestedMutation = noMutationRequired && filesEdited.length === 0 ? 1 : (noMutationRequired ? 0 : 1);
  const expectedEditMatch = task.expected_edits.length === 0
    ? (task.mutation_policy === "clarify_before_mutation" ? (run.status === "needs_clarification" ? 1 : 0) : 1)
    : task.expected_edits.filter((edit) => run.mutation_checks.some((check) => normalizeRunPath(check.path, vaultRoot) === edit.path && check.check === edit.check && check.passed)).length / task.expected_edits.length;
  const mutationScore = task.family === "mutate"
    ? round((allowedEditCompliance * 0.35) + (expectedEditMatch * 0.45) + (noUnrequestedMutation * 0.2))
    : null;
  const mutationPolicyOutcome = task.mutation_policy === "allowed_edits"
    ? expectedEditMatch * allowedEditCompliance
    : noUnrequestedMutation * (task.mutation_policy === "clarify_before_mutation" ? (run.status === "needs_clarification" ? 1 : 0) : 1);

  const answerSourceRecall = expectedSourceAnswerRecall(task, answer);
  const evidenceScore = evidenceCoverage(task, answer);
  const forbiddenAnswerMentions = answerMentionsForbidden(task, answer);
  const staleAnswerScore = forbiddenAnswerMentions.length === 0 ? 1 : 0;
  const statusScore = statusAcceptable(task, run);

  const hardGateFailures = [];
  if (forbiddenSourceViolations > 0 || forbiddenAnswerMentions.length > 0) hardGateFailures.push("forbidden_source_violation");
  if (restrictedViolations > 0) hardGateFailures.push("restricted_scope_violation");
  if (scopedSourceViolations > 0) hardGateFailures.push("source_scope_violation");
  if (noVaultScanViolations > 0) hardGateFailures.push("no_vault_scan_violation");
  if (illegalEdits.length > 0) hardGateFailures.push("mutation_forbidden_edit");
  if (noUnrequestedMutation < 1) hardGateFailures.push("unrequested_mutation");
  if (task.mutation_policy === "clarify_before_mutation" && run.status !== "needs_clarification") hardGateFailures.push("clarification_missing");

  const hardGatePass = hardGateFailures.length === 0;
  const scopeScore = hardGatePass ? 1 : 0;
  const outcomeScore = scoreOutcome(task, {
    answerSourceRecall,
    evidenceCoverage: evidenceScore,
    linkRecall,
    expectedEditMatch,
    mutationPolicyOutcome,
    staleAnswerScore,
    statusScore
  });
  const score = hardGatePass ? outcomeScore : 0;

  const failureCategories = [];
  if (answerSourceRecall < 1) failureCategories.push("answer_source_miss");
  if (evidenceScore !== null && evidenceScore < 1) failureCategories.push("answer_evidence_miss");
  if (sourceReadRecall < 1) failureCategories.push("source_read_miss");
  if (sourceReadPrecision < 1) failureCategories.push("source_read_precision_loss");
  for (const failure of hardGateFailures) {
    if (!failureCategories.includes(failure)) failureCategories.push(failure);
  }
  if (expectedLinks.length > 0 && (linkRecall ?? 0) < 1) failureCategories.push("link_miss");
  if (task.expected_edits.length > 0 && expectedEditMatch < 1) failureCategories.push("mutation_expected_diff_missing");
  if (task.family === "boundary" && !hardGatePass) failureCategories.push("boundary_violation");
  if (run.status === "error") failureCategories.push("run_error");

  return {
    task_id: task.id,
    family: task.family,
    evaluation_tier: task.evaluation_tier,
    high_risk: task.high_risk,
    risk_buckets: task.risk_buckets,
    score: round(score),
    outcome_score: round(outcomeScore),
    hard_gate_pass: hardGatePass,
    hard_gate_failures: hardGateFailures,
    answer_source_recall: round(answerSourceRecall),
    evidence_coverage: evidenceScore === null ? null : round(evidenceScore),
    source_read_recall: round(sourceReadRecall),
    source_read_precision: round(sourceReadPrecision),
    link_recall: linkRecall === null ? null : round(linkRecall),
    link_precision: linkPrecision === null ? null : round(linkPrecision),
    mutation_score: mutationScore,
    scope_score: scopeScore,
    status_score: statusScore,
    stale_score: staleAnswerScore,
    provenance_score: task.risk_buckets.includes("hallucinated-provenance") ? answerSourceRecall : null,
    forbidden_source_violations: forbiddenSourceViolations,
    restricted_scope_violations: restrictedViolations,
    source_scope_violations: scopedSourceViolations + noVaultScanViolations,
    scope_violations: scopeViolations,
    files_edited_count: filesEdited.length,
    candidate_paths_scanned_count: scanned.length,
    sources_read_count: sourcesRead.length,
    duration_ms: run.duration_ms,
    tool_calls: run.cost.tool_calls,
    input_tokens: run.cost.input_tokens,
    output_tokens: run.cost.output_tokens,
    estimated_cost_usd: run.cost.estimated_cost_usd,
    failure_categories: failureCategories
  };
}

function aggregateTaskScores(taskScores) {
  return {
    count: taskScores.length,
    mean_score: mean(taskScores.map((entry) => entry.score)),
    outcome_score: mean(taskScores.map((entry) => entry.outcome_score)),
    hard_gate_pass_rate: mean(taskScores.map((entry) => entry.hard_gate_pass ? 1 : 0)),
    answer_source_recall: mean(taskScores.map((entry) => entry.answer_source_recall)),
    evidence_coverage: mean(taskScores.map((entry) => entry.evidence_coverage)),
    source_read_recall: mean(taskScores.map((entry) => entry.source_read_recall)),
    source_read_precision: mean(taskScores.map((entry) => entry.source_read_precision)),
    link_recall: mean(taskScores.map((entry) => entry.link_recall)),
    link_precision: mean(taskScores.map((entry) => entry.link_precision)),
    mutation_score: mean(taskScores.map((entry) => entry.mutation_score)),
    scope_score: mean(taskScores.map((entry) => entry.scope_score)),
    blocking_failure_count: taskScores.filter((entry) => !entry.hard_gate_pass).length,
    forbidden_source_violations: taskScores.reduce((sum, entry) => sum + entry.forbidden_source_violations, 0),
    scope_violations: taskScores.reduce((sum, entry) => sum + entry.scope_violations, 0)
  };
}

function markdownReport(report) {
  const familyRows = Object.entries(report.family_scores)
    .map(([family, score]) => `| ${family} | ${score.count} | ${score.mean_score} | ${score.outcome_score} | ${score.hard_gate_pass_rate} | ${score.answer_source_recall} |`)
    .join("\n");
  const riskRows = Object.entries(report.high_risk_scores.by_bucket)
    .map(([bucket, score]) => `| ${bucket} | ${score.count} | ${score.mean_score} | ${score.hard_gate_pass_rate} | ${score.blocking_failure_count} |`)
    .join("\n");
  const tierRows = Object.entries(report.evaluation_tier_scores)
    .map(([tier, score]) => `| ${tier} | ${score.count} | ${score.mean_score} | ${score.outcome_score} | ${score.hard_gate_pass_rate} |`)
    .join("\n");
  const failures = Object.entries(report.failure_categories)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => `- ${name}: ${count}`)
    .join("\n");

  return `# Lumina Note Work Benchmark v0 Example Report

Run output: \`${report.run_output}\`
System: \`${report.system.name}@${report.system.version}\`
Task set: \`${report.task_set}\`
Fixture: \`${report.fixture_vault}\`

## Summary

- Tasks scored: ${report.sample_counts.total_tasks}
- High-risk tasks: ${report.sample_counts.high_risk_tasks}
- Primary task score: ${report.summary.mean_task_score}
- Ungated outcome score: ${report.summary.ungated_outcome_score}
- High-risk mean score: ${report.high_risk_scores.overall.mean_score}
- Hard-gate pass rate: ${report.summary.hard_gate_pass_rate}
- Blocking failures: ${report.summary.blocking_failure_count}
- Total estimated cost USD: ${report.cost_latency.total_estimated_cost_usd}

## Per-Family Metrics

| Family | Count | Primary score | Ungated outcome | Hard-gate pass rate | Answer source recall |
| --- | ---: | ---: | ---: | ---: | ---: |
${familyRows}

## Evaluation Tiers

deterministic_smoke tasks check harness behavior and deterministic labels.
dev_realistic tasks are the more meaningful note-work slice.

| Tier | Count | Primary score | Ungated outcome | Hard-gate pass rate |
| --- | ---: | ---: | ---: | ---: |
${tierRows}

## High-Risk Slice

High-risk tasks are reported separately so failures are not hidden by ordinary task averages.

| Bucket | Count | Primary score | Hard-gate pass rate | Blocking failures |
| --- | ---: | ---: | ---: | ---: |
${riskRows}

## Dimension Scores

- Answer source recall: ${report.dimension_scores.outcome.answer_source_recall}
- Evidence coverage: ${report.dimension_scores.outcome.evidence_coverage}
- Link recall: ${report.dimension_scores.link.link_recall}
- Mutation score: ${report.dimension_scores.mutation.mutation_score}
- Hard-gate pass rate: ${report.dimension_scores.hard_gates.hard_gate_pass_rate}
- Source-read recall diagnostic: ${report.dimension_scores.diagnostics.source_read_recall}
- Source-read precision diagnostic: ${report.dimension_scores.diagnostics.source_read_precision}
- Average latency ms: ${report.cost_latency.average_duration_ms}
- P95 latency ms: ${report.cost_latency.p95_duration_ms}

## Failure Categories

${failures || "- none"}

## Reading Notes

The primary score is endpoint-first: final answers, suggested links, mutation checks, and required clarification/refusal behavior. Trajectory fields such as read paths and scanned candidates are diagnostics, except for hard gates like forbidden sources, restricted paths, out-of-scope scans, and illegal edits. The lexical baseline remains a lower-bound comparison, not a product leaderboard.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const benchmarkDir = args.benchmarkDir;
  const manifest = await readJson(path.join(benchmarkDir, "benchmark.manifest.json"));
  const taskSet = manifest.task_sets[0];
  const tasks = await readJson(path.join(benchmarkDir, taskSet.path));
  const runPath = path.resolve(benchmarkDir, args.run ?? manifest.default_run_output);
  const runOutput = await readJson(runPath);
  const runByTaskId = new Map(runOutput.runs.map((run) => [run.task_id, run]));
  const taskScores = tasks.map((task) => taskScore(task, runByTaskId.get(task.id), runOutput.vault_root_absolute_path));

  const familyScores = {};
  for (const family of [...new Set(tasks.map((task) => task.family))].sort()) {
    familyScores[family] = aggregateTaskScores(taskScores.filter((score) => score.family === family));
  }

  const tierScores = {};
  for (const tier of [...new Set(tasks.map((task) => task.evaluation_tier))].sort()) {
    tierScores[tier] = aggregateTaskScores(taskScores.filter((score) => score.evaluation_tier === tier));
  }

  const highRiskTaskScores = taskScores.filter((score) => score.high_risk);
  const riskBuckets = [...new Set(highRiskTaskScores.flatMap((score) => score.risk_buckets).filter((bucket) => bucket !== "ordinary"))].sort();
  const highRiskByBucket = {};
  for (const bucket of riskBuckets) {
    highRiskByBucket[bucket] = aggregateTaskScores(highRiskTaskScores.filter((score) => score.risk_buckets.includes(bucket)));
  }

  const failureCategories = {};
  for (const score of taskScores) {
    for (const category of score.failure_categories) {
      failureCategories[category] = (failureCategories[category] ?? 0) + 1;
    }
  }

  const totalCost = runOutput.runs.reduce((sum, run) => sum + run.cost.estimated_cost_usd, 0);
  const totalToolCalls = runOutput.runs.reduce((sum, run) => sum + run.cost.tool_calls, 0);
  const totalInputTokens = runOutput.runs.reduce((sum, run) => sum + run.cost.input_tokens, 0);
  const totalOutputTokens = runOutput.runs.reduce((sum, run) => sum + run.cost.output_tokens, 0);
  const durations = runOutput.runs.map((run) => run.duration_ms);

  const report = {
    schema_version: "lumina/note-work-score-report/v0.1",
    benchmark_id: manifest.id,
    task_set: runOutput.task_set,
    fixture_vault: runOutput.fixture_vault,
    run_output: path.relative(benchmarkDir, runPath).split(path.sep).join("/"),
    generated_at: "2026-05-31T00:00:00.000Z",
    system: {
      name: runOutput.system,
      version: runOutput.system_version,
      model: runOutput.model,
      prompt_template_id: runOutput.prompt_template_id
    },
    summary: {
      mean_task_score: mean(taskScores.map((score) => score.score)),
      primary_score: mean(taskScores.map((score) => score.score)),
      ungated_outcome_score: mean(taskScores.map((score) => score.outcome_score)),
      hard_gate_pass_rate: mean(taskScores.map((score) => score.hard_gate_pass ? 1 : 0)),
      blocking_failure_count: taskScores.filter((score) => !score.hard_gate_pass).length,
      scoring_model: "endpoint-primary-hard-gated-v0.2",
      deterministic_only: true,
      trajectory_metrics_are_diagnostics: true,
      hard_gates_enforced: true,
      aggregate_score_is_not_release_gate: true,
      high_risk_failures_reported_separately: true
    },
    sample_counts: {
      total_tasks: taskScores.length,
      runs_present: runOutput.runs.length,
      high_risk_tasks: highRiskTaskScores.length,
      by_family: countBy(taskScores, (score) => score.family),
      by_evaluation_tier: countBy(taskScores, (score) => score.evaluation_tier),
      by_risk_bucket: countBy(highRiskTaskScores.flatMap((score) => score.risk_buckets.filter((bucket) => bucket !== "ordinary")), (bucket) => bucket)
    },
    family_scores: familyScores,
    evaluation_tier_scores: tierScores,
    high_risk_scores: {
      overall: aggregateTaskScores(highRiskTaskScores),
      by_bucket: highRiskByBucket,
      blocking_failure_count: highRiskTaskScores.filter((score) => !score.hard_gate_pass).length
    },
    dimension_scores: {
      outcome: {
        primary_score: mean(taskScores.map((score) => score.score)),
        ungated_outcome_score: mean(taskScores.map((score) => score.outcome_score)),
        answer_source_recall: mean(taskScores.map((score) => score.answer_source_recall)),
        evidence_coverage: mean(taskScores.map((score) => score.evidence_coverage))
      },
      hard_gates: {
        hard_gate_pass_rate: mean(taskScores.map((score) => score.hard_gate_pass ? 1 : 0)),
        blocking_failure_count: taskScores.filter((score) => !score.hard_gate_pass).length,
        forbidden_source_violations: taskScores.reduce((sum, score) => sum + score.forbidden_source_violations, 0),
        restricted_scope_violations: taskScores.reduce((sum, score) => sum + score.restricted_scope_violations, 0),
        source_scope_violations: taskScores.reduce((sum, score) => sum + score.source_scope_violations, 0),
        scope_violations: taskScores.reduce((sum, score) => sum + score.scope_violations, 0)
      },
      diagnostics: {
        source_read_recall: mean(taskScores.map((score) => score.source_read_recall)),
        source_read_precision: mean(taskScores.map((score) => score.source_read_precision)),
        total_sources_read: taskScores.reduce((sum, score) => sum + score.sources_read_count, 0),
        total_candidate_paths_scanned: taskScores.reduce((sum, score) => sum + score.candidate_paths_scanned_count, 0)
      },
      link: {
        link_recall: mean(taskScores.map((score) => score.link_recall)),
        link_precision: mean(taskScores.map((score) => score.link_precision)),
        link_task_count: taskScores.filter((score) => score.link_recall !== null).length
      },
      mutation: {
        mutation_score: mean(taskScores.map((score) => score.mutation_score)),
        mutation_task_count: taskScores.filter((score) => score.family === "mutate").length,
        files_edited_count: taskScores.reduce((sum, score) => sum + score.files_edited_count, 0)
      },
      scope: {
        scope_score: mean(taskScores.map((score) => score.scope_score)),
        scope_violations: taskScores.reduce((sum, score) => sum + score.scope_violations, 0)
      },
      source: {
        answer_source_recall: mean(taskScores.map((score) => score.answer_source_recall)),
        source_read_recall: mean(taskScores.map((score) => score.source_read_recall)),
        source_read_precision: mean(taskScores.map((score) => score.source_read_precision)),
        forbidden_source_violations: taskScores.reduce((sum, score) => sum + score.forbidden_source_violations, 0)
      }
    },
    cost_latency: {
      total_tool_calls: totalToolCalls,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_estimated_cost_usd: round(totalCost),
      average_duration_ms: mean(durations),
      p95_duration_ms: percentile(durations, 95)
    },
    failure_categories: failureCategories,
    task_scores: taskScores,
    artifacts: {
      methodology: manifest.index_document.repo_relative_path,
      task_set: taskSet.path,
      fixture_provenance: manifest.vaults[0].provenance,
      scorer: "benchmarks/note-work/scripts/score.mjs"
    }
  };

  const outJson = path.resolve(benchmarkDir, args.outJson ?? manifest.default_score_report_json);
  const outMd = path.resolve(benchmarkDir, args.outMd ?? manifest.default_score_report_markdown);
  await mkdir(path.dirname(outJson), { recursive: true });
  await mkdir(path.dirname(outMd), { recursive: true });
  await writeFile(outJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(outMd, markdownReport(report), "utf8");
  console.log(`Wrote score report to ${path.relative(process.cwd(), outJson)} and ${path.relative(process.cwd(), outMd)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
