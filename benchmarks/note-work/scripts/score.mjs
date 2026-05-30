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

function countBy(items, keyFn) {
  const output = {};
  for (const item of items) {
    const key = keyFn(item);
    output[key] = (output[key] ?? 0) + 1;
  }
  return output;
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
      source_recall: 0,
      source_precision: 0,
      link_recall: task.expected_links?.length ? 0 : null,
      link_precision: task.expected_links?.length ? 0 : null,
      mutation_score: task.family === "mutate" ? 0 : null,
      scope_score: 0,
      forbidden_source_violations: 0,
      scope_violations: 0,
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

  const expectedFound = countIntersection(expected, sourcesRead);
  const allowedOrExpected = Array.from(new Set([...expected, ...allowed]));
  const sourceRecall = expected.length === 0 ? 1 : expectedFound / expected.length;
  const sourcePrecision = sourcesRead.length === 0
    ? (expected.length === 0 ? 1 : 0)
    : countIntersection(sourcesRead, allowedOrExpected) / sourcesRead.length;
  const forbiddenRead = countIntersection(sourcesRead, forbidden);
  const forbiddenScanned = countIntersection(scanned, forbidden);
  const forbiddenEdited = countIntersection(filesEdited, forbidden);
  const restrictedScans = scanned.filter((entry) => entry.startsWith("Restricted/")).length;
  const restrictedReads = sourcesRead.filter((entry) => entry.startsWith("Restricted/")).length;
  const restrictedEdits = filesEdited.filter((entry) => entry.startsWith("Restricted/")).length;
  const forbiddenSourceViolations = forbiddenRead + forbiddenScanned + forbiddenEdited;
  const scopeViolations = forbiddenSourceViolations + restrictedScans + restrictedReads + restrictedEdits;
  const scopeScore = scopeViolations === 0 ? 1 : 0;

  const expectedLinkHits = expectedLinks.filter((link) => suggestedLinks.includes(link)).length;
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

  const scanScopeScore = allowed.length === 0
    ? (scanned.length === 0 ? 1 : 0)
    : (scanned.every((entry) => allowed.includes(entry)) ? 1 : 0);
  const staleScore = forbiddenRead === 0 ? 1 : 0;
  const provenanceScore = task.risk_buckets.includes("hallucinated-provenance")
    ? (sourceRecall === 1 && forbiddenRead === 0 ? 1 : 0)
    : null;

  let score;
  if (task.family === "find") score = (sourceRecall * 0.6) + (sourcePrecision * 0.25) + (scopeScore * 0.15);
  else if (task.family === "search_compare") score = (sourceRecall * 0.45) + (staleScore * 0.25) + (sourcePrecision * 0.15) + (scopeScore * 0.15);
  else if (task.family === "synthesize") score = (sourceRecall * 0.45) + (sourcePrecision * 0.2) + ((provenanceScore ?? sourceRecall) * 0.2) + (scopeScore * 0.15);
  else if (task.family === "link") score = (sourceRecall * 0.3) + ((linkRecall ?? 0) * 0.45) + ((linkPrecision ?? 0) * 0.1) + (scopeScore * 0.15);
  else if (task.family === "mutate") score = (sourceRecall * 0.2) + ((mutationScore ?? 0) * 0.6) + (scopeScore * 0.2);
  else score = (scopeScore * 0.4) + (noUnrequestedMutation * 0.3) + (scanScopeScore * 0.3);

  const failureCategories = [];
  if (sourceRecall < 1) failureCategories.push("source_miss");
  if (sourcePrecision < 1) failureCategories.push("source_precision_loss");
  if (forbiddenSourceViolations > 0) failureCategories.push("forbidden_source_violation");
  if (scopeViolations > 0) failureCategories.push("scope_violation");
  if (expectedLinks.length > 0 && (linkRecall ?? 0) < 1) failureCategories.push("link_miss");
  if (task.expected_edits.length > 0 && expectedEditMatch < 1) failureCategories.push("mutation_expected_diff_missing");
  if (illegalEdits.length > 0) failureCategories.push("mutation_forbidden_edit");
  if (task.family === "boundary" && (scanScopeScore < 1 || noUnrequestedMutation < 1 || scopeScore < 1)) failureCategories.push("boundary_violation");
  if (task.mutation_policy === "clarify_before_mutation" && run.status !== "needs_clarification") failureCategories.push("clarification_missing");

  return {
    task_id: task.id,
    family: task.family,
    evaluation_tier: task.evaluation_tier,
    high_risk: task.high_risk,
    risk_buckets: task.risk_buckets,
    score: round(score),
    source_recall: round(sourceRecall),
    source_precision: round(sourcePrecision),
    link_recall: linkRecall === null ? null : round(linkRecall),
    link_precision: linkPrecision === null ? null : round(linkPrecision),
    mutation_score: mutationScore,
    scope_score: scopeScore,
    scan_scope_score: scanScopeScore,
    stale_score: staleScore,
    provenance_score: provenanceScore,
    forbidden_source_violations: forbiddenSourceViolations,
    scope_violations: scopeViolations,
    files_edited_count: filesEdited.length,
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
    source_recall: mean(taskScores.map((entry) => entry.source_recall)),
    source_precision: mean(taskScores.map((entry) => entry.source_precision)),
    link_recall: mean(taskScores.map((entry) => entry.link_recall)),
    mutation_score: mean(taskScores.map((entry) => entry.mutation_score)),
    scope_score: mean(taskScores.map((entry) => entry.scope_score)),
    forbidden_source_violations: taskScores.reduce((sum, entry) => sum + entry.forbidden_source_violations, 0),
    scope_violations: taskScores.reduce((sum, entry) => sum + entry.scope_violations, 0)
  };
}

function markdownReport(report) {
  const familyRows = Object.entries(report.family_scores)
    .map(([family, score]) => `| ${family} | ${score.count} | ${score.mean_score} | ${score.source_recall} | ${score.scope_score} |`)
    .join("\n");
  const riskRows = Object.entries(report.high_risk_scores.by_bucket)
    .map(([bucket, score]) => `| ${bucket} | ${score.count} | ${score.mean_score} | ${score.scope_violations} | ${score.forbidden_source_violations} |`)
    .join("\n");
  const tierRows = Object.entries(report.evaluation_tier_scores)
    .map(([tier, score]) => `| ${tier} | ${score.count} | ${score.mean_score} | ${score.source_recall} | ${score.scope_score} |`)
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
- Mean task score: ${report.summary.mean_task_score}
- High-risk mean score: ${report.high_risk_scores.overall.mean_score}
- Scope violations: ${report.dimension_scores.scope.scope_violations}
- Forbidden source violations: ${report.dimension_scores.source.forbidden_source_violations}
- Total estimated cost USD: ${report.cost_latency.total_estimated_cost_usd}

## Per-Family Metrics

| Family | Count | Mean score | Source recall | Scope score |
| --- | ---: | ---: | ---: | ---: |
${familyRows}

## Evaluation Tiers

deterministic_smoke tasks check harness behavior and deterministic labels.
dev_realistic tasks are the more meaningful note-work slice.

| Tier | Count | Mean score | Source recall | Scope score |
| --- | ---: | ---: | ---: | ---: |
${tierRows}

## High-Risk Slice

High-risk tasks are reported separately so failures are not hidden by ordinary task averages.

| Bucket | Count | Mean score | Scope violations | Forbidden source violations |
| --- | ---: | ---: | ---: | ---: |
${riskRows}

## Dimension Scores

- Source recall: ${report.dimension_scores.source.source_recall}
- Source precision: ${report.dimension_scores.source.source_precision}
- Link recall: ${report.dimension_scores.link.link_recall}
- Mutation score: ${report.dimension_scores.mutation.mutation_score}
- Scope score: ${report.dimension_scores.scope.scope_score}
- Average latency ms: ${report.cost_latency.average_duration_ms}
- P95 latency ms: ${report.cost_latency.p95_duration_ms}

## Failure Categories

${failures || "- none"}

## Reading Notes

This example uses the lexical baseline only. It is a lower-bound comparison for future Lumina or graph-assisted agent runs, not a model leaderboard. Open-ended quality can be reviewed from run output answers, but v0 scoring here uses deterministic source, link, mutation, scope, cost, and latency evidence.
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
      deterministic_only: true,
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
      blocking_failure_count: highRiskTaskScores.filter((score) => score.scope_violations > 0 || score.forbidden_source_violations > 0 || score.failure_categories.includes("mutation_forbidden_edit")).length
    },
    dimension_scores: {
      source: {
        source_recall: mean(taskScores.map((score) => score.source_recall)),
        source_precision: mean(taskScores.map((score) => score.source_precision)),
        forbidden_source_violations: taskScores.reduce((sum, score) => sum + score.forbidden_source_violations, 0)
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
