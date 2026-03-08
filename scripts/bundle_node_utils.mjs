import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export function normalizeNodeVersion(rawVersion) {
  if (typeof rawVersion !== "string") return null;
  const trimmed = rawVersion.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
}

export function shouldReuseBundledNode(existingVersion, expectedVersion) {
  const normalizedExisting = normalizeNodeVersion(existingVersion);
  const normalizedExpected = normalizeNodeVersion(expectedVersion);
  return Boolean(normalizedExisting && normalizedExpected && normalizedExisting === normalizedExpected);
}

export function readBundledNodeVersion(binaryPath) {
  if (!existsSync(binaryPath)) return null;

  const result = spawnSync(binaryPath, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    return null;
  }

  return normalizeNodeVersion(result.stdout || result.stderr);
}
