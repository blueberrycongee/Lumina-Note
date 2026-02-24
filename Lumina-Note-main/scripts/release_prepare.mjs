import { execSync } from "node:child_process";

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

const args = process.argv.slice(2);
let bump = "patch";

if (args[0] === "--version" && args[1]) {
  bump = args[1];
} else if (args[0]) {
  bump = args[0];
}

// 1) bump version (no git tag)
run(`npm version ${bump} --no-git-tag-version`);

// 2) sync tauri/Cargo versions
run("node scripts/sync_version.mjs");

// 3) ensure Cargo.lock is up to date before tagging
run("cargo generate-lockfile --manifest-path src-tauri/Cargo.toml");
