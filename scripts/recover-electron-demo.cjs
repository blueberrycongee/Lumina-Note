#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const appPath =
  process.argv[2] || "/Applications/electron 可供逆向版本.app";
const outRoot =
  process.argv[3] ||
  path.resolve(process.cwd(), "tmp/electron-reverse-demo/recovered");

const resourceDir = path.join(appPath, "Contents", "Resources");
const archives = ["app.asar", "obsidian.asar"];
const prettyTargets = {
  "obsidian.asar": [
    "app.js",
    "help.js",
    "main.js",
    "sim.js",
    "starter.js",
    "worker.js",
  ],
  "app.asar": ["main.js"],
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readAsarHeader(buffer) {
  const headerSize = buffer.readUInt32LE(12);
  const headerStart = 16;
  const headerEnd = headerStart + headerSize;
  const headerJson = buffer.subarray(headerStart, headerEnd).toString();
  return {
    header: JSON.parse(headerJson),
    headerSize,
    payloadOffset: headerEnd,
  };
}

function extractArchive(archivePath, outDir) {
  const buffer = fs.readFileSync(archivePath);
  const { header, payloadOffset } = readAsarHeader(buffer);
  const files = [];

  function walk(node, prefix = "") {
    for (const [name, value] of Object.entries(node.files || {})) {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      if (value.files) {
        walk(value, relativePath);
        continue;
      }

      const start = payloadOffset + parseInt(value.offset, 10);
      const end = start + value.size;
      const dest = path.join(outDir, relativePath);

      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, buffer.subarray(start, end));
      files.push(relativePath);
    }
  }

  walk(header);
  return files.sort();
}

function runPrettier(filePath, outPath) {
  try {
    const stdout = cp.execFileSync(
      "npx",
      ["prettier", "--parser", "babel", filePath],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    fs.writeFileSync(outPath, stdout);
    return { ok: true };
  } catch (error) {
    const detail = error.stderr
      ? String(error.stderr).trim()
      : error.message || "unknown error";
    fs.writeFileSync(outPath, fs.readFileSync(filePath));
    return { ok: false, error: detail };
  }
}

function main() {
  if (!fs.existsSync(appPath)) {
    console.error(`App not found: ${appPath}`);
    process.exit(1);
  }

  ensureDir(outRoot);

  const rawRoot = path.join(outRoot, "raw");
  const prettyRoot = path.join(outRoot, "pretty");
  ensureDir(rawRoot);
  ensureDir(prettyRoot);

  const manifest = {
    appPath,
    extractedAt: new Date().toISOString(),
    archives: {},
    pretty: {},
  };

  for (const archiveName of archives) {
    const archivePath = path.join(resourceDir, archiveName);
    if (!fs.existsSync(archivePath)) continue;

    const archiveOutDir = path.join(rawRoot, archiveName.replace(/\.asar$/, ""));
    ensureDir(archiveOutDir);
    const files = extractArchive(archivePath, archiveOutDir);
    manifest.archives[archiveName] = {
      path: archivePath,
      fileCount: files.length,
      sample: files.slice(0, 25),
    };

    for (const relativePath of prettyTargets[archiveName] || []) {
      const inputPath = path.join(archiveOutDir, relativePath);
      if (!fs.existsSync(inputPath)) continue;

      const outputName = `${path.basename(relativePath, ".js")}.pretty.js`;
      const outputPath = path.join(prettyRoot, outputName);
      manifest.pretty[outputName] = runPrettier(inputPath, outputPath);
    }
  }

  fs.writeFileSync(
    path.join(outRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  console.log(`Recovered package into ${outRoot}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main();
