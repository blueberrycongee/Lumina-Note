import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultBenchmarkDir = path.resolve(scriptDir, "..");

function parseArgs(argv) {
  const args = {
    benchmarkDir: defaultBenchmarkDir,
    taskSet: "dev",
    out: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--benchmark") args.benchmarkDir = path.resolve(argv[++index]);
    else if (arg === "--task-set") args.taskSet = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--help") {
      console.log("Usage: node benchmarks/note-work/scripts/run-lexical-baseline.mjs [--benchmark <dir>] [--task-set dev] [--out <path>]");
      process.exit(0);
    }
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function listMarkdownFiles(dir) {
  const output = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolutePath);
      else if (entry.name.endsWith(".md")) output.push(absolutePath);
    }
  }
  await walk(dir);
  return output.sort();
}

const stopwords = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "only",
  "note",
  "notes",
  "source",
  "sources",
  "which",
  "what",
  "where",
  "when",
  "without",
  "should",
  "must",
  "current",
  "task"
]);

function tokens(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => token.length > 2 && !stopwords.has(token));
}

function countTokens(text) {
  return tokens(text).length;
}

function scoreTokens(queryTokens, textTokens, weight) {
  const counts = new Map();
  for (const token of textTokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let score = 0;
  for (const token of queryTokens) {
    if (counts.has(token)) score += weight * Math.min(3, counts.get(token));
  }
  return score;
}

function titleForPath(relativePath) {
  return path.basename(relativePath, ".md").replace(/^\d{4}-\d{2}\s+/, "");
}

function wikiLink(title) {
  return `[[${title}]]`;
}

function absolute(vaultRoot, relativePath) {
  return path.join(vaultRoot, relativePath);
}

function makeAnswer(task, rankedSources, suggestedLinks) {
  if (task.mutation_policy === "clarify_before_mutation") {
    return [
      "Clarification required before scanning or mutating files.",
      "Lexical baseline does not perform destructive or restricted-scope edits."
    ].join(" ");
  }
  const sourceList = rankedSources.length > 0
    ? rankedSources.map((entry) => entry.relativePath).join(", ")
    : "No source files read.";
  const linkList = suggestedLinks.length > 0 ? suggestedLinks.join(", ") : "No links suggested.";
  if (task.family === "link") return `Suggested links: ${linkList}. Sources: ${sourceList}.`;
  if (task.family === "mutate") return `Dry-run mutation baseline. Would use sources: ${sourceList}. Suggested links: ${linkList}.`;
  if (task.family === "boundary") return `Boundary-aware lexical baseline response. Sources: ${sourceList}.`;
  return `Lexical baseline selected sources: ${sourceList}.`;
}

function selectCandidatePaths(task, allNotePaths) {
  if (task.source_scope === "no_vault_scan") return [];
  if (task.source_scope === "specific_sources_only") return task.allowed_sources;
  const forbidden = new Set(task.forbidden_sources ?? []);
  return allNotePaths.filter((relativePath) => !relativePath.startsWith("Restricted/") && !forbidden.has(relativePath));
}

function suggestLinks(task, rankedSources, allNotePaths, sourceTexts) {
  const currentText = task.current_file ? (sourceTexts.get(task.current_file) ?? "") : "";
  const queryText = `${task.prompt} ${currentText} ${rankedSources.map((entry) => entry.text).join(" ")}`;
  const query = tokens(queryText);
  const existing = new Set((currentText.match(/\[\[[^\]]+\]\]/g) ?? []));
  const scoredTitles = allNotePaths
    .filter((relativePath) => !relativePath.startsWith("Restricted/"))
    .filter((relativePath) => relativePath !== task.current_file)
    .map((relativePath) => {
      const title = titleForPath(relativePath);
      const titleTokens = tokens(title);
      const sourceBoost = rankedSources.some((entry) => entry.relativePath === relativePath) ? 4 : 0;
      return {
        link: wikiLink(title),
        score: scoreTokens(query, titleTokens, 3) + sourceBoost
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.link.localeCompare(right.link));

  const output = [];
  for (const link of existing) {
    if (!output.includes(link)) output.push(link);
  }
  for (const entry of scoredTitles) {
    if (!output.includes(entry.link)) output.push(entry.link);
    if (output.length >= 5) break;
  }
  return output.slice(0, 5);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const benchmarkDir = args.benchmarkDir;
  const manifest = await readJson(path.join(benchmarkDir, "benchmark.manifest.json"));
  const taskSet = manifest.task_sets.find((entry) => entry.id === args.taskSet);
  if (!taskSet) throw new Error(`Unknown task set: ${args.taskSet}`);
  const [vault] = manifest.vaults;
  const vaultRoot = path.resolve(benchmarkDir, vault.path);
  const allNoteAbsolutePaths = await listMarkdownFiles(vaultRoot);
  const allNotePaths = allNoteAbsolutePaths.map((absolutePath) => path.relative(vaultRoot, absolutePath).split(path.sep).join("/"));
  const runtimeTaskPath = taskSet.runtime_path ?? taskSet.path;
  const tasks = await readJson(path.join(benchmarkDir, runtimeTaskPath));
  const sourceTexts = new Map();
  for (const relativePath of allNotePaths) {
    sourceTexts.set(relativePath, await readFile(absolute(vaultRoot, relativePath), "utf8"));
  }

  const runs = tasks.map((task, index) => {
    const candidatePaths = selectCandidatePaths(task, allNotePaths);
    const promptText = `${task.prompt} ${task.current_file ? titleForPath(task.current_file) : ""}`;
    const query = tokens(promptText);
    const ranked = candidatePaths
      .filter((relativePath) => sourceTexts.has(relativePath))
      .map((relativePath) => {
        const text = sourceTexts.get(relativePath);
        const fileTokens = tokens(relativePath.replace(/[/._-]/g, " "));
        const contentTokens = tokens(text);
        const score = scoreTokens(query, fileTokens, 3) + scoreTokens(query, contentTokens, 1);
        return { relativePath, text, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.relativePath.localeCompare(right.relativePath))
      .slice(0, 5);

    const suggestedLinks = suggestLinks(task, ranked, allNotePaths, sourceTexts);
    const outputTokens = countTokens(makeAnswer(task, ranked, suggestedLinks));
    const inputTokens = candidatePaths.reduce((sum, relativePath) => sum + countTokens(sourceTexts.get(relativePath) ?? ""), 0) + countTokens(task.prompt);

    return {
      task_id: task.id,
      status: task.mutation_policy === "clarify_before_mutation" ? "needs_clarification" : "completed",
      duration_ms: 3 + candidatePaths.length + index,
      answer: makeAnswer(task, ranked, suggestedLinks),
      sources_read: ranked.map((entry) => absolute(vaultRoot, entry.relativePath)),
      candidate_paths_scanned: candidatePaths.map((relativePath) => absolute(vaultRoot, relativePath)),
      graph_calls: [],
      files_edited: [],
      links_suggested: suggestedLinks,
      mutation_checks: [],
      cost: {
        tool_calls: candidatePaths.length > 0 ? 2 : 0,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: 0
      },
      failure_notes: []
    };
  });

  const runOutput = {
    schema_version: "lumina/note-work-run-output/v0.1",
    benchmark_id: manifest.id,
    task_set: taskSet.id,
    fixture_vault: vault.id,
    vault_root_absolute_path: vaultRoot,
    system: "lexical-baseline",
    system_version: "v0.1",
    model: {
      provider: "none",
      model: "filename-plus-content-lexical-search"
    },
    prompt_template_id: "lexical-baseline-v0",
    random_seed: null,
    started_at: "2026-05-31T00:00:00.000Z",
    runs
  };

  const outPath = path.resolve(benchmarkDir, args.out ?? manifest.default_run_output);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(runOutput, null, 2)}\n`, "utf8");
  console.log(`Wrote lexical baseline run for ${runs.length} tasks to ${path.relative(process.cwd(), outPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
