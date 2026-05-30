import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createOpencodeClient } from "@opencode-ai/sdk/client";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultBenchmarkDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(scriptDir, "../../..");

const LUMINA_SYSTEM_PROMPT = `You are Lumina's AI assistant, embedded inside the Lumina note-taking and knowledge-management app.

Your job is to help the user think, research, write, and maintain a personal knowledge vault made of Markdown notes.

Available tools include read, write, edit, grep, glob, list, webfetch, websearch, and bash.

Before using tools, classify the current turn by the evidence or action the user requested:
1. Direct conversation: the user asks for explanation, opinion, brainstorming, writing discussion, clarification, translation, or summarization of pasted text, and does not ask to use existing files, the current tab, vault contents, or the web. Action: answer directly from the conversation and user-provided text. If key writing details are missing, ask concise clarifying questions.
2. Vault-grounded answer: the user explicitly asks about vault contents, the current note or tab, a named/attached/mentioned file or PDF, or says to use/reference existing notes. Action: inspect only the relevant source(s), then answer using what you found.
3. Vault mutation: the user asks to create, edit, rewrite, organize, save, or cross-reference notes/files. Action: inspect the target file first when editing, then make the requested change.
4. External research: the user asks for current facts or web research. Action: use web tools if available, then cite or summarize the evidence.

Ambient app state is not consent. An open tab, visible PDF, active vault, nearby file, or previous session artifact is available context, but it is not a request to inspect it. If a turn fits Direct conversation and Vault-grounded answer is merely possible, stay in Direct conversation and ask whether the user wants existing files used.

Rules:
- Respond in the user's language. Most users write Chinese; match them unless they ask for English.
- When writing or editing notes, actually modify the file -- don't just describe what you'd write.
- When editing, read the note first so you can make a targeted edit instead of overwriting.
- If tool work is needed, gather evidence before the final user-facing answer; do not emit a partial answer and then continue with tool calls.
- For ordinary chat, brainstorming, clarification, and short writing discussions, do not create internal task lists or todos. Reserve task tracking for substantial multi-step work that changes files, runs commands, or performs research.
- Prefer concise, well-structured Markdown. If the user wants long-form, they'll ask.
- Tone and formatting: use plain, professional Markdown. Avoid emojis and decorative symbols in normal chat. Preserve emojis only when they are part of user-provided text, source content, file names, or when the user explicitly asks for an expressive or social style.
- Never call yourself "opencode" or a "CLI tool for software engineering." You are Lumina's assistant.`;

function parseArgs(argv) {
  const args = {
    benchmarkDir: defaultBenchmarkDir,
    taskSet: "dev",
    out: null,
    concurrency: 1,
    limit: null,
    taskIds: [],
    model: "mimo-v2.5-pro",
    provider: "xiaomi-token-plan-cn",
    baseUrl: process.env.XIAOMI_BASE_URL ?? "https://token-plan-cn.xiaomimimo.com/v1",
    apiKey: process.env.XIAOMI_API_KEY ?? "",
    port: 0,
    timeoutMs: 240_000,
    keepTemp: true
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--benchmark") args.benchmarkDir = path.resolve(argv[++index]);
    else if (arg === "--task-set") args.taskSet = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--concurrency") args.concurrency = Number(argv[++index]);
    else if (arg === "--limit") args.limit = Number(argv[++index]);
    else if (arg === "--task-id") args.taskIds.push(argv[++index]);
    else if (arg === "--model") args.model = argv[++index];
    else if (arg === "--provider") args.provider = argv[++index];
    else if (arg === "--base-url") args.baseUrl = argv[++index];
    else if (arg === "--port") args.port = Number(argv[++index]);
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++index]);
    else if (arg === "--cleanup") args.keepTemp = false;
    else if (arg === "--help") {
      console.log([
        "Usage: node benchmarks/note-work/scripts/run-opencode-agent.mjs [options]",
        "",
        "Required env:",
        "  XIAOMI_API_KEY",
        "",
        "Options:",
        "  --benchmark <dir>       Benchmark directory",
        "  --task-set <id>         Task set id, default dev",
        "  --out <file>            Run output JSON path",
        "  --concurrency <n>       Parallel sessions, default 1",
        "  --limit <n>             Run first n selected tasks",
        "  --task-id <id>          Run one task id; repeatable",
        "  --model <id>            Provider model, default mimo-v2.5-pro",
        "  --provider <id>         Opencode provider id, default xiaomi-token-plan-cn",
        "  --base-url <url>        OpenAI-compatible base URL",
        "  --timeout-ms <ms>       Per-task timeout, default 240000",
        "  --cleanup               Remove temp working directory at exit"
      ].join("\n"));
      process.exit(0);
    }
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer");
  }
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  if (!Number.isInteger(args.timeoutMs) || args.timeoutMs < 1_000) {
    throw new Error("--timeout-ms must be an integer >= 1000");
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function slash(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isMarkdownPath(filePath) {
  return filePath.endsWith(".md");
}

function normalizeRelative(relativePath) {
  return slash(path.normalize(relativePath)).replace(/^\.\//, "");
}

function relativeToVault(absoluteOrRelativePath, vaultRoot) {
  if (!absoluteOrRelativePath) return null;
  if (!path.isAbsolute(absoluteOrRelativePath)) {
    const normalized = normalizeRelative(absoluteOrRelativePath);
    return normalized.startsWith("../") ? null : normalized;
  }
  const absolutePath = normalizeAbsolute(absoluteOrRelativePath);
  const relativePath = slash(path.relative(vaultRoot, absolutePath));
  if (relativePath === "" || relativePath.startsWith("../")) return null;
  return relativePath;
}

function normalizeAbsolute(filePath) {
  const resolved = path.resolve(filePath);
  if (resolved.startsWith("/var/")) return `/private${resolved}`;
  return resolved;
}

function evidencePath(relativePath, logicalVaultRoot) {
  return path.join(logicalVaultRoot, relativePath);
}

async function listMarkdownFiles(dir) {
  const output = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolutePath);
      else if (entry.name.endsWith(".md")) output.push(slash(path.relative(dir, absolutePath)));
    }
  }
  await walk(dir);
  return output.sort();
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readAllMarkdown(root) {
  const files = await listMarkdownFiles(root);
  const out = new Map();
  for (const file of files) {
    out.set(file, await fs.readFile(path.join(root, file), "utf8"));
  }
  return out;
}

function extractFrontmatter(text) {
  const match = text.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? match[0] : "";
}

function outputPathsFromTool(toolPart, vaultRoot) {
  const output = String(toolPart.state?.output ?? "");
  const paths = [];
  const pathTagRegex = /<path>([\s\S]*?)<\/path>/g;
  for (const match of output.matchAll(pathTagRegex)) {
    paths.push(match[1].trim());
  }
  const absoluteRegex = /\/(?:private\/)?var\/[^\n:]*?\.md/g;
  for (const match of output.matchAll(absoluteRegex)) {
    paths.push(match[0]);
  }
  const input = toolPart.state?.input ?? {};
  for (const key of ["filePath", "path"]) {
    if (typeof input[key] === "string") paths.push(input[key]);
  }
  return uniq(paths.map((entry) => relativeToVault(entry, vaultRoot)).filter(Boolean));
}

function parseDirectoryEntries(toolPart, vaultRoot) {
  if (toolPart.tool !== "read") return [];
  const inputPath = toolPart.state?.input?.filePath;
  if (typeof inputPath !== "string") return [];
  const baseRelative = relativeToVault(inputPath, vaultRoot);
  if (baseRelative === null) return [];
  const output = String(toolPart.state?.output ?? "");
  const entriesMatch = output.match(/<entries>\n([\s\S]*?)<\/entries>/);
  if (!entriesMatch) return [];
  return entriesMatch[1]
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => normalizeRelative(path.posix.join(baseRelative, entry)));
}

function parseFinalJson(text) {
  const blocks = Array.from(text.matchAll(/```json\s*([\s\S]*?)\s*```/gi));
  const candidates = blocks.length > 0
    ? blocks.map((match) => match[1])
    : [text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index]?.trim();
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function normalizeStatus(rawStatus, task, filesEdited) {
  const status = String(rawStatus ?? "").toLowerCase();
  if (["needs_clarification", "clarification_required", "need_clarification"].includes(status)) {
    return "needs_clarification";
  }
  if (["refused", "error"].includes(status)) return status;
  if (
    task.mutation_policy === "clarify_before_mutation" &&
    filesEdited.length === 0 &&
    /clarif|确认|澄清|which|which file|\?/.test(String(rawStatus ?? ""))
  ) {
    return "needs_clarification";
  }
  return "completed";
}

function normalizeLinks(values, answer) {
  const raw = Array.isArray(values) ? values : [];
  const fromAnswer = String(answer ?? "").match(/\[\[[^\]]+\]\]/g) ?? [];
  return uniq([...raw, ...fromAnswer])
    .map((entry) => String(entry).trim())
    .filter((entry) => /^\[\[[^\]]+\]\]$/.test(entry));
}

async function diffMarkdownFiles(beforeRoot, afterRoot) {
  const before = await readAllMarkdown(beforeRoot);
  const after = await readAllMarkdown(afterRoot);
  const files = Array.from(new Set([...before.keys(), ...after.keys()])).sort();
  const changed = [];
  for (const file of files) {
    if ((before.get(file) ?? null) !== (after.get(file) ?? null)) changed.push(file);
  }
  return changed;
}

async function checkExpectedEdit(expectedEdit, goldTask, beforeRoot, afterRoot, filesEdited) {
  const relativePath = expectedEdit.path;
  const beforeText = await readTextIfExists(path.join(beforeRoot, relativePath));
  const afterText = await readTextIfExists(path.join(afterRoot, relativePath));
  const text = afterText ?? "";
  const noOtherFilesEdited = filesEdited.every((file) => file === relativePath);
  const noArchiveEdited = filesEdited.every((file) => !file.startsWith("Archive/"));
  const noTutorialEdited = filesEdited.every((file) => !file.startsWith("Tutorials/"));
  const frontmatterPreserved = beforeText !== null && extractFrontmatter(beforeText) === extractFrontmatter(text);
  const expectedSourcesPresent = (goldTask.expected_sources ?? []).every((source) => text.includes(source));
  let passed = false;

  switch (expectedEdit.check) {
    case "Contains [[Source Paths Contract]] while preserving frontmatter.":
      passed = text.includes("[[Source Paths Contract]]") && frontmatterPreserved;
      break;
    case "New note includes source_paths for the three expected sources.":
      passed = afterText !== null && text.includes("source_paths") && expectedSourcesPresent;
      break;
    case "Frontmatter is unchanged and body contains [[Source Audit Board]].":
      passed = text.includes("[[Source Audit Board]]") && frontmatterPreserved;
      break;
    case "Contains [[Backlink Gap]] and [[Card Sorting Observation]] with no other files edited.":
      passed = text.includes("[[Backlink Gap]]") && text.includes("[[Card Sorting Observation]]") && noOtherFilesEdited;
      break;
    case "Mentions the old broad-edit policy as stale and does not edit Archive/.":
      passed = /stale|deprecated|old/i.test(text) && /broad[- ]edit|broad edit/i.test(text) && noArchiveEdited;
      break;
    case "New note cites PDF-derived source paths and converted Markdown notes.":
      passed = afterText !== null && text.includes("source_paths") && expectedSourcesPresent && /PDF|converted|Markdown/i.test(text);
      break;
    case "New generated note includes source_paths for all expected graph retrieval sources.":
      passed = afterText !== null && text.includes("source_paths") && expectedSourcesPresent;
      break;
    case "Contains [[Legacy SSL Integration]] and no tutorial files are edited.":
      passed = text.includes("[[Legacy SSL Integration]]") && noTutorialEdited;
      break;
    case "Contains [[OpenCode Install Matrix]] and Archive/ is not edited.":
      passed = text.includes("[[OpenCode Install Matrix]]") && noArchiveEdited;
      break;
    case "Contains [[Remote Local MCP Options]] and Archive/ is not edited.":
      passed = text.includes("[[Remote Local MCP Options]]") && noArchiveEdited;
      break;
    default:
      passed = afterText !== null && beforeText !== afterText;
      break;
  }

  return {
    path: relativePath,
    check: expectedEdit.check,
    passed,
    notes: passed ? "verified from post-run vault diff" : "expected edit check did not match post-run vault state"
  };
}

async function buildMutationChecks(goldTask, beforeRoot, afterRoot, filesEdited) {
  const expectedEdits = goldTask?.expected_edits ?? [];
  const checks = [];
  for (const expectedEdit of expectedEdits) {
    checks.push(await checkExpectedEdit(expectedEdit, goldTask, beforeRoot, afterRoot, filesEdited));
  }
  return checks;
}

function buildConfig(args) {
  return {
    model: `${args.provider}/${args.model}`,
    default_agent: "build",
    agent: {
      build: {
        prompt: LUMINA_SYSTEM_PROMPT
      }
    },
    permission: {
      read: "allow",
      list: "allow",
      glob: "allow",
      grep: "allow",
      edit: "allow",
      todowrite: "allow",
      bash: "deny",
      webfetch: "deny",
      websearch: "deny",
      codesearch: "deny",
      question: "deny",
      skill: "deny",
      external_directory: { "*": "deny" }
    },
    provider: {
      [args.provider]: {
        options: {
          apiKey: args.apiKey,
          baseURL: args.baseUrl
        },
        models: {
          [args.model]: { limit: { context: 1_048_576, output: 131_072 } },
          "mimo-v2.5": { limit: { context: 1_048_576, output: 131_072 } },
          "mimo-v2-pro": { limit: { context: 1_048_576, output: 131_072 } },
          "mimo-v2-omni": { limit: { context: 262_144, output: 65_536 } }
        }
      }
    },
    skills: {
      paths: [".claude/skills", ".agents/skills", ".skills", ".lumina/skills"]
    }
  };
}

function buildTaskPrompt(task) {
  return `Run this Lumina note-work benchmark task against the current Markdown vault.

Task id: ${task.id}
User request: ${task.prompt}
Source scope: ${task.source_scope}
Allowed source relative paths: ${task.allowed_sources.length ? task.allowed_sources.join(", ") : "(none)"}
Forbidden relative paths: ${task.forbidden_sources.length ? task.forbidden_sources.join(", ") : "(none)"}
Current file: ${task.current_file ?? "(none)"}
Mutation policy: ${task.mutation_policy}
Allowed edit relative paths: ${task.allowed_edits.length ? task.allowed_edits.join(", ") : "(none)"}

Rules for this benchmark run:
- Use vault file tools when the request asks about existing notes.
- If source_scope is full_vault_except_forbidden, search the vault but do not read, scan, cite, or edit any forbidden path or any path under Restricted/.
- If source_scope is specific_sources_only, inspect only allowed source paths and the current file when present.
- If source_scope is no_vault_scan, do not scan or read the vault.
- Do not use web, shell, code search, or skill tools.
- Do not edit files unless mutation_policy is allowed_edits.
- If mutation_policy is allowed_edits, edit only the allowed edit relative paths.
- If mutation_policy is none or suggest_only, do not edit files.
- If mutation_policy is clarify_before_mutation, ask for clarification and do not edit.
- End your final answer with exactly one fenced json block. The JSON object must have keys: status, answer, sources_read, candidate_paths_scanned, links_suggested, files_edited, mutation_checks, failure_notes.
- Use vault-relative paths in JSON arrays. Use WikiLink strings like [[Note Title]] for links_suggested.`;
}

async function runOneTask(input) {
  const {
    args,
    client,
    task,
    goldTask,
    baseVaultRoot,
    logicalVaultRoot,
    workRoot,
    index,
    total
  } = input;
  const taskWorkRoot = path.join(workRoot, `${String(index + 1).padStart(3, "0")}-${task.id}`);
  const vaultRootRaw = path.join(taskWorkRoot, "medium-vault");
  await fs.mkdir(taskWorkRoot, { recursive: true });
  await fs.cp(baseVaultRoot, vaultRootRaw, { recursive: true });
  const vaultRoot = normalizeAbsolute(await fs.realpath(vaultRootRaw));
  const start = Date.now();
  const failureNotes = [];
  let messages = [];
  let finalText = "";
  let parsed = null;

  try {
    const session = await client.session.create({
      body: { title: task.id },
      query: { directory: vaultRoot },
      throwOnError: true
    });
    const res = await client.session.prompt({
      path: { id: session.data.id },
      query: { directory: vaultRoot },
      signal: AbortSignal.timeout(args.timeoutMs),
      body: {
        agent: "build",
        model: { providerID: args.provider, modelID: args.model },
        parts: [{ type: "text", text: buildTaskPrompt(task) }]
      },
      throwOnError: true
    });
    finalText = res.data.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    const messageRes = await client.session.messages({
      path: { id: session.data.id },
      query: { directory: vaultRoot },
      throwOnError: true
    });
    messages = messageRes.data ?? [];
    parsed = parseFinalJson(finalText);
    if (!parsed) failureNotes.push("final_json_parse_failed");
    await client.instance.dispose({ query: { directory: vaultRoot } }).catch(() => {});
  } catch (error) {
    failureNotes.push(String(error?.message ?? error));
    await client.instance.dispose({ query: { directory: vaultRoot } }).catch(() => {});
  }

  const toolParts = messages.flatMap((message) =>
    message.parts.filter((part) => part.type === "tool")
  );
  const readFiles = [];
  const scannedFiles = [];
  for (const part of toolParts) {
    const paths = outputPathsFromTool(part, vaultRoot);
    if (part.tool === "read") {
      const inputPath = relativeToVault(part.state?.input?.filePath, vaultRoot);
      if (inputPath && isMarkdownPath(inputPath)) readFiles.push(inputPath);
      scannedFiles.push(...parseDirectoryEntries(part, vaultRoot));
    } else if (["grep", "glob", "list"].includes(part.tool)) {
      scannedFiles.push(...paths.filter(isMarkdownPath));
    } else if (["edit", "write", "apply_patch"].includes(part.tool)) {
      scannedFiles.push(...paths.filter(isMarkdownPath));
    }
  }
  const filesEdited = await diffMarkdownFiles(baseVaultRoot, vaultRootRaw);
  const mutationChecks = await buildMutationChecks(goldTask, baseVaultRoot, vaultRootRaw, filesEdited);
  const assistantMessages = messages.filter((message) => message.info.role === "assistant");
  const cost = assistantMessages.reduce(
    (sum, message) => {
      const tokens = message.info.tokens ?? {};
      sum.input_tokens += tokens.input ?? 0;
      sum.output_tokens += tokens.output ?? 0;
      sum.estimated_cost_usd += message.info.cost ?? 0;
      return sum;
    },
    {
      tool_calls: toolParts.length,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0
    }
  );
  const answer = String(parsed?.answer ?? finalText ?? "");
  const filesEditedEvidence = filesEdited.map((file) => evidencePath(file, logicalVaultRoot));
  const status = failureNotes.length > 0 && messages.length === 0
    ? "error"
    : normalizeStatus(parsed?.status ?? answer, task, filesEdited);

  const run = {
    task_id: task.id,
    status,
    duration_ms: Date.now() - start,
    answer,
    sources_read: uniq(readFiles).map((file) => evidencePath(file, logicalVaultRoot)),
    candidate_paths_scanned: uniq(scannedFiles)
      .filter(isMarkdownPath)
      .map((file) => evidencePath(file, logicalVaultRoot)),
    graph_calls: [],
    files_edited: filesEditedEvidence,
    links_suggested: normalizeLinks(parsed?.links_suggested, answer),
    mutation_checks: mutationChecks,
    cost,
    failure_notes: failureNotes
  };
  console.log(
    `[${index + 1}/${total}] ${task.id}: ${run.status} score-evidence sources=${run.sources_read.length} scanned=${run.candidate_paths_scanned.length} edits=${run.files_edited.length} tools=${run.cost.tool_calls} ms=${run.duration_ms}`
  );
  return run;
}

async function mapLimit(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runWorker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.apiKey) throw new Error("XIAOMI_API_KEY is required");

  const manifest = await readJson(path.join(args.benchmarkDir, "benchmark.manifest.json"));
  const taskSet = manifest.task_sets.find((entry) => entry.id === args.taskSet);
  if (!taskSet) throw new Error(`Unknown task set: ${args.taskSet}`);
  const [vault] = manifest.vaults;
  const baseVaultRoot = path.resolve(args.benchmarkDir, vault.path);
  const logicalVaultRoot = normalizeAbsolute(await fs.realpath(baseVaultRoot));
  const runtimeTaskPath = taskSet.runtime_path ?? taskSet.path;
  const runtimeTasks = await readJson(path.join(args.benchmarkDir, runtimeTaskPath));
  const goldTasks = await readJson(path.join(args.benchmarkDir, taskSet.path));
  const goldById = new Map(goldTasks.map((task) => [task.id, task]));
  let tasks = runtimeTasks;
  if (args.taskIds.length > 0) {
    const wanted = new Set(args.taskIds);
    tasks = tasks.filter((task) => wanted.has(task.id));
  }
  if (args.limit !== null) tasks = tasks.slice(0, args.limit);
  if (tasks.length === 0) throw new Error("No tasks selected");

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lumina-note-work-opencode-"));
  const workRoot = path.join(tmpRoot, "task-vaults");
  const xdgRoot = path.join(tmpRoot, "xdg");
  await fs.mkdir(workRoot, { recursive: true });
  process.env.XDG_CONFIG_HOME = path.join(xdgRoot, "config");
  process.env.XDG_DATA_HOME = path.join(xdgRoot, "data");
  process.env.XDG_CACHE_HOME = path.join(xdgRoot, "cache");
  process.env.OPENCODE_CLIENT = "lumina";
  process.env.OPENCODE_AUTH_CONTENT = JSON.stringify({
    [args.provider]: { type: "api", key: args.apiKey }
  });
  process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify(buildConfig(args));

  const bundlePath = path.join(repoRoot, "thirdparty/opencode/packages/opencode/dist/node/node.js");
  if (!fssync.existsSync(bundlePath)) {
    throw new Error(`opencode bundle missing at ${bundlePath}. Run: npm run opencode:bundle`);
  }
  const mod = await import(bundlePath);
  await mod.Log.init({ level: "WARN" });
  const port = args.port || 15_500 + Math.floor(Math.random() * 1_000);
  const hostname = "127.0.0.1";
  const password = randomUUID();
  const listener = await mod.Server.listen({
    port,
    hostname,
    username: "opencode",
    password,
    cors: ["oc://renderer"]
  });
  const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
  const client = createOpencodeClient({
    baseUrl: `http://${hostname}:${port}`,
    headers: { authorization }
  });

  console.log(`opencode runner temp root: ${tmpRoot}`);
  console.log(`selected tasks: ${tasks.length}; concurrency: ${args.concurrency}`);
  const startedAt = new Date().toISOString();
  let runs = [];
  try {
    runs = await mapLimit(tasks, args.concurrency, (task, index) =>
      runOneTask({
        args,
        client,
        task,
        goldTask: goldById.get(task.id),
        baseVaultRoot,
        logicalVaultRoot,
        workRoot,
        index,
        total: tasks.length
      })
    );
  } finally {
    listener.stop?.();
  }

  const runOutput = {
    schema_version: "lumina/note-work-run-output/v0.1",
    benchmark_id: manifest.id,
    task_set: taskSet.id,
    fixture_vault: vault.id,
    vault_root_absolute_path: logicalVaultRoot,
    system: "lumina-opencode-agent",
    system_version: "headless-opencode-bundle",
    model: {
      provider: args.provider,
      model: args.model
    },
    prompt_template_id: "lumina-opencode-note-work-runner-v0.1",
    random_seed: null,
    started_at: startedAt,
    runs
  };

  const outPath = path.resolve(args.out ?? path.join(args.benchmarkDir, "runs/opencode-agent-dev.json"));
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(runOutput, null, 2)}\n`, "utf8");
  console.log(`Wrote run output to ${outPath}`);
  if (!args.keepTemp) await fs.rm(tmpRoot, { recursive: true, force: true });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
