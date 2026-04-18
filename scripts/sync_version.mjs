import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const pkgPath = path.join(root, "package.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg.version;
if (!version) {
  throw new Error("sync-version: package.json version is missing");
}

// The Rust/Tauri sidecar is gone; electron-builder reads version directly from
// package.json. This script is kept so `prebuild` remains a no-op hook for any
// future cross-file version fan-out.
console.log(`sync-version: package.json version is ${version}`);
