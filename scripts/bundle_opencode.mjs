// Wrap opencode's own `build-node.ts` so our Electron build can invoke it
// without every caller knowing about the bun toolchain.
//
// Requires: bun on PATH (install once per machine / CI image).
// Opencode lives under thirdparty/opencode (gitignored) and its tree must be
// `bun install`ed before this runs — the script fails loudly otherwise.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const opencodeDir = path.join(root, "thirdparty", "opencode");
const opencodePkgDir = path.join(opencodeDir, "packages", "opencode");
const distNode = path.join(opencodePkgDir, "dist", "node", "node.js");

function die(msg) {
  console.error(`bundle-opencode: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(opencodeDir)) {
  die(
    `thirdparty/opencode not found. Run:\n  git clone https://github.com/anomalyco/opencode thirdparty/opencode`,
  );
}
if (!fs.existsSync(path.join(opencodeDir, "node_modules"))) {
  die(
    `opencode node_modules missing. Run:\n  (cd thirdparty/opencode && bun install)`,
  );
}

const bun = process.env.BUN_PATH || "bun";
const result = spawnSync(
  bun,
  ["run", path.join("script", "build-node.ts")],
  {
    cwd: opencodePkgDir,
    stdio: "inherit",
    env: {
      ...process.env,
      PATH: process.env.PATH ?? "",
      // build-node.ts → @opencode-ai/script shells out to `git branch --show-current`
      // and fails if OPENCODE_CHANNEL is unset. Default to dev.
      OPENCODE_CHANNEL: process.env.OPENCODE_CHANNEL || "dev",
    },
  },
);

if (result.error) die(`failed to spawn bun: ${result.error.message}`);
if (result.status !== 0) die(`bun build exited with ${result.status}`);

if (!fs.existsSync(distNode)) {
  die(`bun build succeeded but ${distNode} was not produced`);
}

const { size } = fs.statSync(distNode);
console.log(`bundle-opencode: ${distNode} (${(size / 1024 / 1024).toFixed(1)} MB)`);
