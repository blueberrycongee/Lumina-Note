import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const pkgPath = path.join(root, "package.json");
const tauriConfigPath = path.join(root, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(root, "src-tauri", "Cargo.toml");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg.version;
if (!version) {
  throw new Error("sync-version: package.json version is missing");
}

let changed = false;

// Update tauri.conf.json
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
if (tauriConfig.version !== version) {
  tauriConfig.version = version;
  fs.writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2) + "\n");
  changed = true;
}

// Update Cargo.toml [package] version
const cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
const packageSectionRegex = /^\[package\][\s\S]*?(?=^\[|\Z)/m;
const match = cargoToml.match(packageSectionRegex);
if (!match) {
  throw new Error("sync-version: [package] section not found in Cargo.toml");
}
const packageSection = match[0];
const updatedSection = packageSection.replace(
  /^\s*version\s*=\s*".*?"\s*$/m,
  `version = "${version}"`
);
if (updatedSection !== packageSection) {
  const updatedCargo = cargoToml.replace(packageSectionRegex, updatedSection);
  fs.writeFileSync(cargoTomlPath, updatedCargo);
  changed = true;
}

if (changed) {
  console.log(`sync-version: updated to ${version}`);
}
