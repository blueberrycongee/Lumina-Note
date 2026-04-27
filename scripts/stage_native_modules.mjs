// Stage opencode's platform-specific native dependencies into a clean
// build-time directory that electron-builder packs as extraResources.
//
// Why this script exists:
//   - `thirdparty/opencode/` is gitignored and only meant for developer
//     convenience (`bun install` populates it). We don't want
//     electron-builder.yml to reference paths inside it directly — that
//     leaks dev-tooling layout into the release config.
//   - This script copies the relevant `@lydell/node-pty-${platform}-${arch}`
//     packages (and only those) from the bun workspace into
//     `release-staging/native/`, where electron-builder reads them via
//     a stable, dev-tooling-agnostic path.
//
// Cross-arch on macOS:
//   - Mac runners are arm64. `bun install` only downloaded the matching
//     `node-pty-darwin-arm64`, but electron-builder packs both arm64 and
//     x64 dmg slices from the same host. We pull `node-pty-darwin-x64`
//     directly from npm at the same version bun chose so the x64 slice
//     has its native binary too.
//
// Usage:
//   node scripts/stage_native_modules.mjs
// Honors process.platform / process.arch by default. Override for tests
// with --platform / --arch flags.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const argv = process.argv.slice(2);
function getArg(flag) {
  const idx = argv.indexOf(flag);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

const platform = getArg("--platform") ?? process.platform;
const arch = getArg("--arch") ?? process.arch;

const bunWorkspace = path.join(
  root,
  "thirdparty",
  "opencode",
  "node_modules",
  ".bun",
  "node_modules",
  "@lydell",
);
const stagingDir = path.join(root, "release-staging", "native");

function die(msg) {
  console.error(`stage-native: ${msg}`);
  process.exit(1);
}

function cleanCopyDir(src, dst) {
  if (!fs.existsSync(src)) {
    die(
      `source missing: ${src}\n` +
        `Run \`(cd thirdparty/opencode && bun install)\` first ` +
        `(see scripts/bundle_opencode.mjs for the full setup).`,
    );
  }
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
  const size = (() => {
    let total = 0;
    for (const entry of fs.readdirSync(dst, { withFileTypes: true })) {
      if (entry.isFile()) total += fs.statSync(path.join(dst, entry.name)).size;
    }
    return total;
  })();
  console.log(`stage-native: copied ${path.basename(src)} → ${dst}`);
  if (size) console.log(`              (${(size / 1024).toFixed(1)} KB top-level files)`);
}

function fetchFromNpm(pkgName, version, dst) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stage-native-"));
  const packResult = spawnSync(
    "npm",
    ["pack", `${pkgName}@${version}`, "--json"],
    { cwd: tmp, encoding: "utf8" },
  );
  if (packResult.status !== 0) {
    die(
      `npm pack ${pkgName}@${version} failed:\n${packResult.stderr || packResult.stdout}`,
    );
  }
  const meta = JSON.parse(packResult.stdout || "[]");
  if (!meta[0]?.filename) {
    die(`npm pack returned no filename for ${pkgName}@${version}`);
  }
  const tarball = path.join(tmp, meta[0].filename);

  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });

  const extractResult = spawnSync(
    "tar",
    ["-xzf", tarball, "-C", dst, "--strip-components=1"],
    { stdio: "inherit" },
  );
  if (extractResult.status !== 0) {
    die(`tar -xzf ${tarball} → ${dst} failed`);
  }
  console.log(`stage-native: fetched ${pkgName}@${version} from npm → ${dst}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

function readPackageVersion(pkgDir) {
  const pkgJson = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pkgJson)) {
    die(`package.json missing at ${pkgJson}`);
  }
  return JSON.parse(fs.readFileSync(pkgJson, "utf8")).version;
}

// --- main --------------------------------------------------------------

if (!fs.existsSync(bunWorkspace)) {
  die(
    `${bunWorkspace} missing.\n` +
      `Run the opencode setup first (see scripts/bundle_opencode.mjs):\n` +
      `  git clone https://github.com/anomalyco/opencode thirdparty/opencode\n` +
      `  (cd thirdparty/opencode && bun install)`,
  );
}

const platformPkg = `node-pty-${platform}-${arch}`;
const src = path.join(bunWorkspace, platformPkg);
const dst = path.join(stagingDir, platformPkg);

console.log(`stage-native: target = ${platform}-${arch}`);
cleanCopyDir(src, dst);

// macOS multi-arch: bun install on the arm64 runner only fetched arm64.
// Stage the x64 sibling from npm so electron-builder's x64 dmg slice has
// its native binary too. Skip when explicitly targeting x64 (then arm64
// would be the cross-arch we'd need — same logic, opposite direction).
if (platform === "darwin") {
  const otherArch = arch === "arm64" ? "x64" : "arm64";
  const otherPkg = `node-pty-darwin-${otherArch}`;
  const otherDst = path.join(stagingDir, otherPkg);
  const otherSrc = path.join(bunWorkspace, otherPkg);

  if (fs.existsSync(otherSrc)) {
    cleanCopyDir(otherSrc, otherDst);
  } else {
    const version = readPackageVersion(src);
    fetchFromNpm(`@lydell/${otherPkg}`, version, otherDst);
  }
}
