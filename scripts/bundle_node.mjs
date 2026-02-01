import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const fetchWithRetry = async (url, { retries = 3, timeoutMs = 30000 } = {}) => {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        console.warn(
          `[bundle-node] Fetch failed (attempt ${attempt}/${retries}). Retrying...`,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErr;
};

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const versionPath = path.join(root, "node-runtime-version.txt");
const version = (await fs.readFile(versionPath, "utf8")).trim();

const platformTag = (() => {
  if (process.platform === "win32") return "win";
  if (process.platform === "darwin") return "darwin";
  if (process.platform === "linux") return "linux";
  return null;
})();

const archTag = (() => {
  if (process.arch === "x64") return "x64";
  if (process.arch === "arm64") return "arm64";
  return null;
})();

if (!platformTag || !archTag) {
  throw new Error(`Unsupported platform/arch: ${process.platform}/${process.arch}`);
}

const ext = platformTag === "win" ? "zip" : "tar.xz";
const archiveName = `node-v${version}-${platformTag}-${archTag}.${ext}`;
const url = `https://nodejs.org/dist/v${version}/${archiveName}`;

const tmpDir = path.join(root, ".tmp_node");
const extractDir = path.join(tmpDir, "extract");
const archivePath = path.join(tmpDir, archiveName);

const resourceDir = path.join(root, "src-tauri", "resources", "node");
const binaryName = platformTag === "win" ? "node.exe" : "node";
const binaryTarget = path.join(resourceDir, binaryName);
if (existsSync(binaryTarget)) {
  const stat = await fs.stat(binaryTarget);
  if (stat.size > 0) {
    console.log(`[bundle-node] Using cached Node runtime at ${binaryTarget}`);
    process.exit(0);
  }
}

await fs.rm(tmpDir, { recursive: true, force: true });
await fs.mkdir(extractDir, { recursive: true });

console.log(`[bundle-node] Downloading ${url}`);
const res = await fetchWithRetry(url);
if (!res.ok) {
  throw new Error(`[bundle-node] Download failed: HTTP ${res.status}`);
}

const file = await fs.open(archivePath, "w");
try {
  for await (const chunk of res.body) {
    await file.write(chunk);
  }
} finally {
  await file.close();
}

if (platformTag === "win") {
  console.log("[bundle-node] Extracting zip via PowerShell");
  const ps = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${extractDir}' -Force`,
    ],
    { stdio: "inherit" },
  );
  if (ps.status !== 0) {
    throw new Error(`[bundle-node] Expand-Archive failed with ${ps.status}`);
  }
} else {
  console.log("[bundle-node] Extracting tarball");
  const tar = spawnSync("tar", ["-xf", archivePath, "-C", extractDir], { stdio: "inherit" });
  if (tar.status !== 0) {
    throw new Error(`[bundle-node] tar failed with ${tar.status}`);
  }
}

const extractedRoot = path.join(extractDir, `node-v${version}-${platformTag}-${archTag}`);
const binarySource =
  platformTag === "win"
    ? path.join(extractedRoot, binaryName)
    : path.join(extractedRoot, "bin", binaryName);

if (!existsSync(binarySource)) {
  throw new Error(`[bundle-node] Node binary missing at ${binarySource}`);
}

await fs.mkdir(resourceDir, { recursive: true });
await fs.copyFile(binarySource, binaryTarget);

if (platformTag !== "win") {
  await fs.chmod(binaryTarget, 0o755);
}

console.log(`[bundle-node] Node runtime ready at ${binaryTarget}`);
