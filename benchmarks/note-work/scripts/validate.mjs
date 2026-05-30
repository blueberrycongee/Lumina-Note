import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultBenchmarkDir = path.resolve(scriptDir, "..");
const benchmarkDir = path.resolve(process.argv[2] ?? defaultBenchmarkDir);

const requiredFamilies = new Set(["find", "search_compare", "synthesize", "link", "mutate", "boundary"]);
const runtimeTaskForbiddenFields = new Set([
  "expected_sources",
  "expected_evidence",
  "expected_links",
  "expected_edits",
  "rubric",
  "judge_policy",
  "source_profile_id",
  "synthetic_generation"
]);
const requiredRiskBuckets = new Set([
  "mutation",
  "stale-source",
  "long-context",
  "hallucinated-provenance",
  "boundary"
]);

const secretPatterns = [
  { name: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "openai-like-secret", pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "assigned-api-key", pattern: /\bapi[_-]?key\s*[:=]\s*["'][^"']{8,}["']/i },
  { name: "provider-payload-flag", pattern: /"provider_payloads_committed"\s*:\s*true/ },
  { name: "raw-sensitive-flag", pattern: /"raw_sensitive_content_committed"\s*:\s*true/ },
  { name: "reversible-anonymization-flag", pattern: /"reversible_anonymization_committed"\s*:\s*true/ }
];

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

async function readJson(relativePath) {
  const absolutePath = path.join(benchmarkDir, relativePath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

async function exists(absolutePath) {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir, predicate = () => true) {
  const output = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (predicate(absolutePath)) {
        output.push(absolutePath);
      }
    }
  }
  await walk(dir);
  return output.sort();
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function typeMatches(value, expectedType) {
  if (Array.isArray(expectedType)) return expectedType.some((entry) => typeMatches(value, entry));
  if (expectedType === "array") return Array.isArray(value);
  if (expectedType === "object") return isObject(value);
  if (expectedType === "integer") return Number.isInteger(value);
  if (expectedType === "number") return typeof value === "number" && Number.isFinite(value);
  if (expectedType === "null") return value === null;
  return typeof value === expectedType;
}

function validateSchema(value, schema, label) {
  const localErrors = [];

  function visit(currentValue, currentSchema, currentPath) {
    if (!currentSchema || typeof currentSchema !== "object") return;

    if (Object.hasOwn(currentSchema, "const") && currentValue !== currentSchema.const) {
      localErrors.push(`${currentPath}: expected const ${JSON.stringify(currentSchema.const)}`);
    }
    if (currentSchema.enum && !currentSchema.enum.includes(currentValue)) {
      localErrors.push(`${currentPath}: expected one of ${currentSchema.enum.join(", ")}`);
    }
    if (currentSchema.type && !typeMatches(currentValue, currentSchema.type)) {
      localErrors.push(`${currentPath}: expected type ${JSON.stringify(currentSchema.type)}`);
      return;
    }

    if (typeof currentValue === "string") {
      if (currentSchema.minLength && currentValue.length < currentSchema.minLength) {
        localErrors.push(`${currentPath}: string shorter than ${currentSchema.minLength}`);
      }
      if (currentSchema.pattern && !(new RegExp(currentSchema.pattern).test(currentValue))) {
        localErrors.push(`${currentPath}: does not match ${currentSchema.pattern}`);
      }
    }

    if (typeof currentValue === "number") {
      if (currentSchema.minimum !== undefined && currentValue < currentSchema.minimum) {
        localErrors.push(`${currentPath}: below minimum ${currentSchema.minimum}`);
      }
      if (currentSchema.maximum !== undefined && currentValue > currentSchema.maximum) {
        localErrors.push(`${currentPath}: above maximum ${currentSchema.maximum}`);
      }
    }

    if (Array.isArray(currentValue)) {
      if (currentSchema.minItems !== undefined && currentValue.length < currentSchema.minItems) {
        localErrors.push(`${currentPath}: fewer than ${currentSchema.minItems} items`);
      }
      if (currentSchema.items) {
        currentValue.forEach((item, index) => visit(item, currentSchema.items, `${currentPath}[${index}]`));
      }
    }

    if (isObject(currentValue)) {
      if (currentSchema.minProperties !== undefined && Object.keys(currentValue).length < currentSchema.minProperties) {
        localErrors.push(`${currentPath}: fewer than ${currentSchema.minProperties} properties`);
      }
      if (currentSchema.required) {
        for (const requiredField of currentSchema.required) {
          if (!Object.hasOwn(currentValue, requiredField)) {
            localErrors.push(`${currentPath}: missing required field ${requiredField}`);
          }
        }
      }
      if (currentSchema.additionalProperties === false && currentSchema.properties) {
        for (const key of Object.keys(currentValue)) {
          if (!Object.hasOwn(currentSchema.properties, key)) {
            localErrors.push(`${currentPath}: unexpected field ${key}`);
          }
        }
      }
      if (currentSchema.properties) {
        for (const [key, nestedSchema] of Object.entries(currentSchema.properties)) {
          if (Object.hasOwn(currentValue, key)) visit(currentValue[key], nestedSchema, `${currentPath}.${key}`);
        }
      }
      if (isObject(currentSchema.additionalProperties)) {
        for (const [key, nestedValue] of Object.entries(currentValue)) {
          if (!currentSchema.properties || !Object.hasOwn(currentSchema.properties, key)) {
            visit(nestedValue, currentSchema.additionalProperties, `${currentPath}.${key}`);
          }
        }
      }
    }
  }

  visit(value, schema, label);
  return localErrors;
}

function validateRelativePath(relativePath, label) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    fail(`${label}: path must be a non-empty string`);
    return false;
  }
  if (path.isAbsolute(relativePath)) {
    fail(`${label}: task and fixture paths must be vault-relative, got ${relativePath}`);
    return false;
  }
  if (relativePath.split(/[\\/]/).includes("..")) {
    fail(`${label}: path must not contain .., got ${relativePath}`);
    return false;
  }
  if (!relativePath.endsWith(".md")) {
    fail(`${label}: source/edit path must end with .md, got ${relativePath}`);
    return false;
  }
  return true;
}

function normalizeRunPath(runPath, vaultRoot) {
  if (!runPath) return runPath;
  const absolutePath = path.isAbsolute(runPath) ? path.normalize(runPath) : path.join(vaultRoot, runPath);
  const relative = path.relative(vaultRoot, absolutePath).split(path.sep).join("/");
  return relative.startsWith("..") ? runPath : relative;
}

function titleForPath(relativePath) {
  return path.basename(relativePath, ".md").replace(/^\d{4}-\d{2}\s+/, "").toLowerCase();
}

async function main() {
  const manifest = await readJson("benchmark.manifest.json");
  const profileSchema = await readJson(manifest.schemas.profile);
  const taskSchema = await readJson(manifest.schemas.task);
  const runtimeTaskSchema = await readJson(manifest.schemas.runtime_task);
  const runSchema = await readJson(manifest.schemas.run_output);
  const scoreSchema = await readJson(manifest.schemas.score_report);

  for (const [schemaName, schema] of Object.entries({ profileSchema, taskSchema, runtimeTaskSchema, runSchema, scoreSchema })) {
    if (!schema.$schema || !schema.$id || !schema.title) fail(`${schemaName}: schema metadata is incomplete`);
  }

  const profiles = [];
  for (const profilePath of manifest.profiles) {
    const profile = await readJson(profilePath);
    errors.push(...validateSchema(profile, profileSchema, profilePath));
    profiles.push(profile);
  }
  if (profiles.length < 3) fail(`expected at least 3 profiles, found ${profiles.length}`);
  const profileIds = new Set(profiles.map((profile) => profile.id));
  for (const profile of profiles) {
    if (!profile.source.license_or_consent || profile.source.profiled_paths.length === 0) {
      fail(`${profile.id}: missing license/consent or profiled paths`);
    }
    if (profile.safety_review.raw_sensitive_content_committed || profile.safety_review.provider_payloads_committed) {
      fail(`${profile.id}: unsafe committed content flag is true`);
    }
  }

  const [vault] = manifest.vaults;
  const vaultRoot = path.join(benchmarkDir, vault.path);
  const vaultExists = await exists(vaultRoot);
  if (!vaultExists) fail(`vault path missing: ${vault.path}`);
  const noteFiles = vaultExists
    ? (await listFiles(vaultRoot, (file) => file.endsWith(".md"))).map((file) => path.relative(vaultRoot, file).split(path.sep).join("/"))
    : [];
  const noteSet = new Set(noteFiles);
  if (noteFiles.length < vault.expected_note_count_min || noteFiles.length > vault.expected_note_count_max) {
    fail(`fixture note count ${noteFiles.length} outside expected range ${vault.expected_note_count_min}-${vault.expected_note_count_max}`);
  }

  const provenance = await readJson(vault.provenance);
  if (provenance.note_count !== noteFiles.length) {
    fail(`provenance note_count ${provenance.note_count} does not match markdown count ${noteFiles.length}`);
  }
  if (provenance.safety_review.raw_sensitive_content_committed || provenance.safety_review.provider_payloads_committed) {
    fail("fixture provenance safety flags must be false");
  }
  const provenanceByPath = new Map(provenance.notes.map((entry) => [entry.path, entry]));
  const provenanceProfileCounts = new Map();
  for (const notePath of noteFiles) {
    const entry = provenanceByPath.get(notePath);
    if (!entry) {
      fail(`missing provenance for fixture note ${notePath}`);
      continue;
    }
    if (!profileIds.has(entry.source_profile_id)) fail(`${notePath}: unknown source_profile_id ${entry.source_profile_id}`);
    if (!entry.generation_method || !entry.traits_from_profiles?.length || !entry.constructed_controls?.length) {
      fail(`${notePath}: synthetic provenance is incomplete`);
    }
    if (entry.safety.raw_sensitive_content_committed || entry.safety.provider_payloads_committed) {
      fail(`${notePath}: unsafe provenance safety flag is true`);
    }
    provenanceProfileCounts.set(entry.source_profile_id, (provenanceProfileCounts.get(entry.source_profile_id) ?? 0) + 1);
  }
  for (const provenanceEntry of provenance.notes) {
    if (!noteSet.has(provenanceEntry.path)) fail(`provenance references missing note ${provenanceEntry.path}`);
  }

  for (const restrictedPath of provenance.safety_review.restricted_boundary_paths ?? []) {
    if (!noteSet.has(restrictedPath)) fail(`restricted boundary path missing from vault: ${restrictedPath}`);
    const text = await readFile(path.join(vaultRoot, restrictedPath), "utf8");
    if (!/placeholder/i.test(text) || !/no real/i.test(text)) {
      fail(`${restrictedPath}: restricted boundary note must clearly be a synthetic placeholder with no real content`);
    }
  }

  const [taskSet] = manifest.task_sets;
  const tasks = await readJson(taskSet.path);
  if (!Array.isArray(tasks)) fail(`${taskSet.path}: expected a task array`);
  if (tasks.length < taskSet.expected_task_count_min || tasks.length > taskSet.expected_task_count_max) {
    fail(`task count ${tasks.length} outside expected range ${taskSet.expected_task_count_min}-${taskSet.expected_task_count_max}`);
  }

  const taskIds = new Set();
  const families = new Set();
  const riskBuckets = new Set();
  const highRiskTasks = [];
  const taskProfileCounts = new Map();
  const tierCounts = new Map();

  for (const task of tasks) {
    errors.push(...validateSchema(task, taskSchema, task.id ?? "<task>"));
    if (taskIds.has(task.id)) fail(`duplicate task id ${task.id}`);
    taskIds.add(task.id);
    families.add(task.family);
    for (const bucket of task.risk_buckets) riskBuckets.add(bucket);
    if (task.high_risk) highRiskTasks.push(task.id);
    if (!profileIds.has(task.source_profile_id)) fail(`${task.id}: unknown source_profile_id ${task.source_profile_id}`);
    taskProfileCounts.set(task.source_profile_id, (taskProfileCounts.get(task.source_profile_id) ?? 0) + 1);
    tierCounts.set(task.evaluation_tier, (tierCounts.get(task.evaluation_tier) ?? 0) + 1);
    if (task.high_risk !== task.risk_buckets.some((bucket) => bucket !== "ordinary")) {
      fail(`${task.id}: high_risk flag does not match risk_buckets`);
    }
    if (task.synthetic_generation.is_synthetic && task.synthetic_generation.review_status === "draft") {
      fail(`${task.id}: synthetic task must not remain in draft review status`);
    }
    if (task.current_file) {
      validateRelativePath(task.current_file, `${task.id}.current_file`);
      if (!noteSet.has(task.current_file)) fail(`${task.id}: current_file not found: ${task.current_file}`);
    }

    for (const field of ["allowed_sources", "expected_sources", "forbidden_sources"]) {
      for (const sourcePath of task[field]) {
        validateRelativePath(sourcePath, `${task.id}.${field}`);
        if (!noteSet.has(sourcePath)) fail(`${task.id}: ${field} path not found: ${sourcePath}`);
      }
    }

    for (const sourcePath of task.expected_sources) {
      if (!task.allowed_sources.includes(sourcePath)) {
        fail(`${task.id}: expected source must also be allowed: ${sourcePath}`);
      }
    }
    if (task.source_scope === "no_vault_scan" && (task.allowed_sources.length > 0 || task.expected_sources.length > 0)) {
      fail(`${task.id}: no_vault_scan tasks must not define allowed or expected sources`);
    }
    if (task.source_scope === "specific_sources_only" && task.allowed_sources.length === 0) {
      fail(`${task.id}: specific_sources_only tasks must define allowed_sources`);
    }
    for (const forbiddenPath of task.forbidden_sources) {
      if (task.allowed_sources.includes(forbiddenPath) || task.expected_sources.includes(forbiddenPath)) {
        fail(`${task.id}: forbidden source overlaps allowed/expected: ${forbiddenPath}`);
      }
    }

    for (const evidence of task.expected_evidence) {
      validateRelativePath(evidence.path, `${task.id}.expected_evidence.path`);
      if (!task.expected_sources.includes(evidence.path)) fail(`${task.id}: evidence path is not in expected_sources: ${evidence.path}`);
      const text = await readFile(path.join(vaultRoot, evidence.path), "utf8");
      if (!text.includes(evidence.snippet)) fail(`${task.id}: expected evidence snippet not found in ${evidence.path}`);
    }

    if (task.evaluation_tier === "dev_realistic") {
      const prompt = task.prompt.toLowerCase();
      for (const sourcePath of task.expected_sources) {
        const sourceTitle = titleForPath(sourcePath);
        if (sourceTitle && prompt.includes(sourceTitle)) {
          fail(`${task.id}: dev_realistic prompt directly contains expected source title "${sourceTitle}"`);
        }
      }
    }

    if (task.family === "link" && (!task.expected_links || task.expected_links.length === 0)) {
      fail(`${task.id}: link tasks must define expected_links`);
    }
    if (task.family === "mutate" && task.mutation_policy === "none") {
      fail(`${task.id}: mutate tasks must not have mutation_policy none`);
    }
    if (task.mutation_policy === "allowed_edits") {
      if (task.allowed_edits.length === 0 || task.expected_edits.length === 0) {
        fail(`${task.id}: allowed_edits policy requires allowed_edits and expected_edits`);
      }
    }
    if (["none", "suggest_only", "clarify_before_mutation"].includes(task.mutation_policy) && task.expected_edits.length > 0) {
      fail(`${task.id}: ${task.mutation_policy} policy must not include expected_edits`);
    }
    for (const editPath of task.allowed_edits) {
      validateRelativePath(editPath, `${task.id}.allowed_edits`);
      const parent = path.dirname(editPath);
      if (parent.startsWith("Restricted")) fail(`${task.id}: allowed_edits must not target Restricted/: ${editPath}`);
    }
    for (const edit of task.expected_edits) {
      validateRelativePath(edit.path, `${task.id}.expected_edits.path`);
      if (!task.allowed_edits.includes(edit.path)) fail(`${task.id}: expected edit path is not allowed: ${edit.path}`);
    }
  }

  for (const family of requiredFamilies) {
    if (!families.has(family)) fail(`missing required task family: ${family}`);
  }
  for (const bucket of requiredRiskBuckets) {
    if (!riskBuckets.has(bucket)) fail(`missing required high-risk bucket: ${bucket}`);
  }
  if (highRiskTasks.length === 0) fail("expected at least one high-risk task");
  if ((tierCounts.get("dev_realistic") ?? 0) < 20) {
    fail(`expected at least 20 dev_realistic tasks, found ${tierCounts.get("dev_realistic") ?? 0}`);
  }
  for (const profileId of profileIds) {
    const noteCount = provenanceProfileCounts.get(profileId) ?? 0;
    const taskCount = taskProfileCounts.get(profileId) ?? 0;
    if (noteCount < 8) fail(`${profileId}: expected at least 8 primary fixture notes, found ${noteCount}`);
    if (taskCount < 8) fail(`${profileId}: expected at least 8 primary tasks, found ${taskCount}`);
  }

  let runtimeById = new Map();
  if (taskSet.runtime_path) {
    const runtimeTasks = await readJson(taskSet.runtime_path);
    if (!Array.isArray(runtimeTasks)) fail(`${taskSet.runtime_path}: expected a runtime task array`);
    if (runtimeTasks.length !== tasks.length) fail(`${taskSet.runtime_path}: runtime task count must match gold task count`);
    for (const runtimeTask of runtimeTasks) {
      runtimeById.set(runtimeTask.id, runtimeTask);
      errors.push(...validateSchema(runtimeTask, runtimeTaskSchema, `${taskSet.runtime_path}:${runtimeTask.id}`));
      for (const forbiddenField of runtimeTaskForbiddenFields) {
        if (Object.hasOwn(runtimeTask, forbiddenField)) {
          fail(`${runtimeTask.id}: runtime task view must not expose gold field ${forbiddenField}`);
        }
      }
      if (!["full_vault_except_forbidden", "specific_sources_only", "no_vault_scan"].includes(runtimeTask.source_scope)) {
        fail(`${runtimeTask.id}: invalid runtime source_scope ${runtimeTask.source_scope}`);
      }
      for (const sourcePath of runtimeTask.allowed_sources ?? []) {
        validateRelativePath(sourcePath, `${runtimeTask.id}.runtime.allowed_sources`);
        if (!noteSet.has(sourcePath)) fail(`${runtimeTask.id}: runtime allowed source missing: ${sourcePath}`);
      }
    }
    for (const task of tasks) {
      if (!runtimeById.has(task.id)) fail(`${taskSet.runtime_path}: missing runtime task for ${task.id}`);
      const runtimeTask = runtimeById.get(task.id);
      if (runtimeTask && runtimeTask.source_scope !== task.source_scope) {
        fail(`${runtimeTask.id}: runtime source_scope must match gold task source_scope`);
      }
    }
  } else {
    fail(`${taskSet.id}: runtime_path is required to prevent gold-label leakage`);
  }

  const benchmarkFiles = await listFiles(benchmarkDir);
  for (const absolutePath of benchmarkFiles) {
    const text = await readFile(absolutePath, "utf8");
    for (const { name, pattern } of secretPatterns) {
      if (pattern.test(text)) fail(`possible secret/sensitive payload marker (${name}) in ${path.relative(benchmarkDir, absolutePath)}`);
    }
  }

  const runPath = path.join(benchmarkDir, manifest.default_run_output);
  if (await exists(runPath)) {
    const runOutput = JSON.parse(await readFile(runPath, "utf8"));
    errors.push(...validateSchema(runOutput, runSchema, manifest.default_run_output));
    if (!path.isAbsolute(runOutput.vault_root_absolute_path)) {
      fail(`${manifest.default_run_output}: vault_root_absolute_path must be absolute`);
    }
    const runIds = new Set(runOutput.runs.map((run) => run.task_id));
    for (const task of tasks) {
      if (!runIds.has(task.id)) fail(`${manifest.default_run_output}: missing run for task ${task.id}`);
    }
    for (const run of runOutput.runs) {
      if (!taskIds.has(run.task_id)) fail(`${manifest.default_run_output}: run references unknown task ${run.task_id}`);
      const runtimeTask = runtimeById.get(run.task_id);
      const normalizedScanned = run.candidate_paths_scanned.map((sourcePath) => normalizeRunPath(sourcePath, runOutput.vault_root_absolute_path));
      if (runtimeTask?.source_scope === "full_vault_except_forbidden") {
        if (normalizedScanned.length <= (runtimeTask.allowed_sources?.length ?? 0)) {
          fail(`${manifest.default_run_output}: ${run.task_id} appears to use allowed_sources as a candidate whitelist`);
        }
        if (normalizedScanned.some((sourcePath) => sourcePath.startsWith("Restricted/"))) {
          fail(`${manifest.default_run_output}: ${run.task_id} scanned Restricted/ despite full-vault-minus-restricted policy`);
        }
      }
      if (runtimeTask?.source_scope === "no_vault_scan" && normalizedScanned.length > 0) {
        fail(`${manifest.default_run_output}: ${run.task_id} scanned files despite no_vault_scan scope`);
      }
      for (const sourcePath of [...run.sources_read, ...run.candidate_paths_scanned, ...run.files_edited]) {
        if (!path.isAbsolute(sourcePath)) fail(`${manifest.default_run_output}: run path must be absolute: ${sourcePath}`);
        const relative = normalizeRunPath(sourcePath, runOutput.vault_root_absolute_path);
        if (relative.startsWith("..")) fail(`${manifest.default_run_output}: run path outside vault: ${sourcePath}`);
      }
    }
  } else {
    warn(`default run output not found yet: ${manifest.default_run_output}`);
  }

  const scorePath = path.join(benchmarkDir, manifest.default_score_report_json);
  if (await exists(scorePath)) {
    const scoreReport = JSON.parse(await readFile(scorePath, "utf8"));
    errors.push(...validateSchema(scoreReport, scoreSchema, manifest.default_score_report_json));
    if (!scoreReport.family_scores || !scoreReport.high_risk_scores || !scoreReport.dimension_scores) {
      fail(`${manifest.default_score_report_json}: missing diagnostic score sections`);
    }
    if (scoreReport.summary?.scoring_model !== "endpoint-primary-hard-gated-v0.2") {
      fail(`${manifest.default_score_report_json}: score report must use endpoint-primary-hard-gated-v0.2`);
    }
    if (scoreReport.summary?.trajectory_metrics_are_diagnostics !== true || scoreReport.summary?.hard_gates_enforced !== true) {
      fail(`${manifest.default_score_report_json}: score report must mark trajectory metrics as diagnostics and enforce hard gates`);
    }
  } else {
    warn(`default score report not found yet: ${manifest.default_score_report_json}`);
  }

  if (warnings.length > 0) {
    for (const message of warnings) console.warn(`WARN ${message}`);
  }
  if (errors.length > 0) {
    for (const message of errors) console.error(`ERROR ${message}`);
    console.error(`Validation failed with ${errors.length} error(s).`);
    process.exitCode = 1;
    return;
  }
  console.log(`Validated ${profiles.length} profiles, ${noteFiles.length} notes, ${tasks.length} tasks, and ${highRiskTasks.length} high-risk tasks.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
