import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { app, net } from "electron";
import { parse as parseYaml } from "yaml";

import type { AutoUpdaterLike } from "./updater.js";

const GITHUB_OWNER = "blueberrycongee";
const GITHUB_REPO = "Lumina-Note";
const MAX_DOWNLOAD_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 1_500;
const INSTALL_WAIT_TIMEOUT_S = 30;

export interface MacReleaseFile {
  url: string;
  sha512: string;
  size: number;
}

export interface MacReleaseInfo {
  version: string;
  files: MacReleaseFile[];
  releaseDate: string | null;
  releaseNotes: string | null;
}

interface PendingUpdate {
  version: string;
  appPath: string;
  releaseNotes: string | null;
  releaseDate: string | null;
}

interface PendingUpdateState extends PendingUpdate {
  downloadedAt: string;
}

type GithubReleaseResponse = {
  body?: unknown;
};

export function parseLatestMacYml(content: string): MacReleaseInfo {
  const doc = parseYaml(content) as {
    version?: unknown;
    files?: unknown;
    releaseDate?: unknown;
  } | null;

  const files = Array.isArray(doc?.files)
    ? doc.files
        .map((entry): MacReleaseFile | null => {
          if (!entry || typeof entry !== "object") return null;
          const raw = entry as Record<string, unknown>;
          if (
            typeof raw.url !== "string" ||
            typeof raw.sha512 !== "string" ||
            typeof raw.size !== "number"
          ) {
            return null;
          }
          return {
            url: raw.url,
            sha512: raw.sha512,
            size: raw.size,
          };
        })
        .filter((entry): entry is MacReleaseFile => entry !== null)
    : [];

  return {
    version: typeof doc?.version === "string" ? doc.version.trim() : "",
    files,
    releaseDate:
      typeof doc?.releaseDate === "string" ? doc.releaseDate.trim() : null,
    releaseNotes: null,
  };
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const left = candidate.split(".").map((part) => Number.parseInt(part, 10));
  const right = current.split(".").map((part) => Number.parseInt(part, 10));

  for (let i = 0; i < Math.max(left.length, right.length, 3); i += 1) {
    const a = Number.isFinite(left[i]) ? left[i] : 0;
    const b = Number.isFinite(right[i]) ? right[i] : 0;
    if (a > b) return true;
    if (a < b) return false;
  }

  return false;
}

export function selectMacZipFile(
  files: MacReleaseFile[],
  arch: NodeJS.Architecture = process.arch,
): MacReleaseFile | null {
  const zips = files.filter((file) => file.url.toLowerCase().endsWith(".zip"));
  if (arch === "arm64") {
    return (
      zips.find((file) => {
        const url = file.url.toLowerCase();
        return url.includes("arm64") || url.includes("aarch64");
      }) ?? null
    );
  }

  return (
    zips.find((file) => {
      const url = file.url.toLowerCase();
      return (
        url.includes("x64") ||
        url.includes("x86_64") ||
        (!url.includes("arm64") && !url.includes("aarch64"))
      );
    }) ?? null
  );
}

function getStagingDir(): string {
  return join(app.getPath("userData"), "pending-updates", "mac");
}

function getStatePath(): string {
  return join(getStagingDir(), "state.json");
}

function getAppBundlePath(): string {
  return resolve(app.getAppPath(), "../../..");
}

function assertInstallLocationWritable(): void {
  try {
    accessSync(dirname(getAppBundlePath()), constants.W_OK);
  } catch {
    throw new Error(
      "Cannot install updates from this app location. Move Lumina Note to /Applications and try again.",
    );
  }
}

function assetDownloadUrl(version: string, fileName: string): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/${encodeURIComponent(fileName)}`;
}

function latestMacYmlUrl(): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/latest-mac.yml`;
}

function releaseApiUrl(version: string): string {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/v${version}`;
}

function requestText(url: string, userAgent?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const request = net.request(url);
    if (userAgent) request.setHeader("User-Agent", userAgent);

    let body = "";
    request.on("response", (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} from ${url}`));
        return;
      }
      response.on("data", (chunk) => {
        body += chunk.toString();
      });
      response.on("end", () => resolvePromise(body));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

function downloadFile(
  url: string,
  destination: string,
  expectedSize: number,
  onProgress: (transferred: number, total: number | null) => void,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const request = net.request(url);
    const stream = createWriteStream(destination);
    let transferred = 0;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      stream.destroy();
      reject(error);
    };

    stream.on("error", fail);
    request.on("response", (response) => {
      if (response.statusCode !== 200) {
        fail(new Error(`HTTP ${response.statusCode} downloading update`));
        return;
      }

      response.on("data", (chunk) => {
        transferred += chunk.length;
        stream.write(chunk);
        onProgress(transferred, expectedSize > 0 ? expectedSize : null);
      });
      response.on("end", () => {
        stream.end(() => {
          settled = true;
          resolvePromise();
        });
      });
      response.on("error", fail);
    });
    request.on("error", fail);
    request.end();
  });
}

async function downloadWithRetry(
  url: string,
  destination: string,
  expectedSize: number,
  onProgress: (transferred: number, total: number | null) => void,
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      await downloadFile(url, destination, expectedSize, onProgress);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_DOWNLOAD_ATTEMPTS - 1) {
        const delay = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, delay));
      }
    }
  }

  throw lastError ?? new Error("Update download failed");
}

function computeSha512(filePath: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha512");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolvePromise(hash.digest("base64")));
    stream.on("error", reject);
  });
}

function extractZip(zipPath: string, destination: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    mkdirSync(destination, { recursive: true });
    execFile("ditto", ["-xk", zipPath, destination], (error) => {
      if (error) {
        reject(new Error(`Failed to extract update: ${error.message}`));
        return;
      }
      resolvePromise();
    });
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export class MacUnsignedUpdater
  extends EventEmitter
  implements AutoUpdaterLike
{
  private latestRelease: MacReleaseInfo | null = null;
  private pendingUpdate: PendingUpdate | null = null;
  private downloading = false;
  private installing = false;

  constructor() {
    super();
    this.restorePendingUpdate();
    app.on("before-quit", () => {
      if (this.pendingUpdate && !this.installing) {
        this.installing = true;
        this.runInstallScript(false);
      }
    });
  }

  async checkForUpdates(): Promise<{
    isUpdateAvailable?: boolean;
    updateInfo: {
      version: string;
      releaseNotes?: string | null;
      releaseDate?: string | null;
    };
  } | null> {
    const release = await this.fetchLatestRelease();
    this.latestRelease = release;

    if (!release.version) return null;
    if (!isNewerVersion(release.version, app.getVersion())) {
      return { isUpdateAvailable: false, updateInfo: this.toUpdateInfo(release) };
    }

    return {
      isUpdateAvailable: true,
      updateInfo: this.toUpdateInfo(release),
    };
  }

  async downloadUpdate(): Promise<string[]> {
    if (this.downloading) {
      throw new Error("An update download is already in progress");
    }

    assertInstallLocationWritable();

    const release = this.latestRelease ?? (await this.fetchLatestRelease());
    this.latestRelease = release;

    if (!isNewerVersion(release.version, app.getVersion())) {
      throw new Error("No newer macOS update is available");
    }

    if (
      this.pendingUpdate &&
      this.pendingUpdate.version === release.version &&
      existsSync(this.pendingUpdate.appPath)
    ) {
      this.emit("update-downloaded", this.toUpdateInfo(release));
      return [this.pendingUpdate.appPath];
    }

    const zipFile = selectMacZipFile(release.files);
    if (!zipFile) {
      throw new Error("No matching macOS ZIP found for this architecture");
    }

    const tempDir = `${getStagingDir()}-tmp`;
    const zipPath = join(tempDir, zipFile.url.split("/").pop() ?? "update.zip");
    const extractDir = join(tempDir, "extracted");
    const downloadUrl = assetDownloadUrl(release.version, zipFile.url);

    this.downloading = true;
    try {
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
      mkdirSync(tempDir, { recursive: true });

      await downloadWithRetry(downloadUrl, zipPath, zipFile.size, (transferred, total) => {
        this.emit("download-progress", {
          percent: total ? Math.min(100, (transferred / total) * 100) : undefined,
          transferred,
          total,
        });
      });

      const hash = await computeSha512(zipPath);
      if (hash !== zipFile.sha512) {
        throw new Error("SHA-512 verification failed for the downloaded update");
      }

      await extractZip(zipPath, extractDir);
      const appName = readdirSync(extractDir).find((entry) =>
        entry.endsWith(".app"),
      );
      if (!appName) {
        throw new Error("No .app bundle found in the downloaded update");
      }

      rmSync(zipPath, { force: true });

      const stagingDir = getStagingDir();
      if (existsSync(stagingDir)) {
        rmSync(stagingDir, { recursive: true, force: true });
      }
      renameSync(tempDir, stagingDir);

      this.pendingUpdate = {
        version: release.version,
        appPath: join(stagingDir, "extracted", appName),
        releaseNotes: release.releaseNotes,
        releaseDate: release.releaseDate,
      };
      this.savePendingState();

      this.emit("update-downloaded", this.toUpdateInfo(release));
      return [this.pendingUpdate.appPath];
    } catch (error) {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
      throw error;
    } finally {
      this.downloading = false;
    }
  }

  quitAndInstall(): void {
    if (!this.pendingUpdate) {
      throw new Error("No downloaded macOS update is ready to install");
    }
    this.installing = true;
    this.runInstallScript(true);
    app.quit();
  }

  private async fetchLatestRelease(): Promise<MacReleaseInfo> {
    const yml = await requestText(latestMacYmlUrl());
    const release = parseLatestMacYml(yml);

    if (!release.version) return release;

    try {
      const json = await requestText(
        releaseApiUrl(release.version),
        `Lumina-Note/${app.getVersion()}`,
      );
      const parsed = JSON.parse(json) as GithubReleaseResponse;
      if (typeof parsed.body === "string") {
        release.releaseNotes = parsed.body;
      }
    } catch (error) {
      console.warn("[updater] failed to load GitHub release notes", error);
    }

    return release;
  }

  private toUpdateInfo(release: MacReleaseInfo): {
    version: string;
    releaseNotes?: string | null;
    releaseDate?: string | null;
  } {
    return {
      version: release.version,
      releaseNotes: release.releaseNotes,
      releaseDate: release.releaseDate,
    };
  }

  private runInstallScript(relaunch: boolean): void {
    if (!this.pendingUpdate) return;

    const currentAppPath = getAppBundlePath();
    const newAppPath = this.pendingUpdate.appPath;
    const stagingDir = getStagingDir();
    const scriptPath = join(stagingDir, "install.sh");

    const script = [
      "#!/bin/bash",
      "set -e",
      `CURRENT_APP=${shellQuote(currentAppPath)}`,
      `NEW_APP=${shellQuote(newAppPath)}`,
      `STAGING_DIR=${shellQuote(stagingDir)}`,
      `PID=${process.pid}`,
      `TIMEOUT=${INSTALL_WAIT_TIMEOUT_S}`,
      'BACKUP_APP="${CURRENT_APP}.backup"',
      "",
      "elapsed=0",
      'while kill -0 "$PID" 2>/dev/null; do',
      "  sleep 0.5",
      "  elapsed=$((elapsed + 1))",
      '  if [ "$elapsed" -ge "$((TIMEOUT * 2))" ]; then exit 1; fi',
      "done",
      "",
      'rm -rf "$BACKUP_APP"',
      'mv "$CURRENT_APP" "$BACKUP_APP"',
      'if mv "$NEW_APP" "$CURRENT_APP"; then',
      '  xattr -cr "$CURRENT_APP" 2>/dev/null || true',
      '  rm -rf "$BACKUP_APP"',
      '  rm -rf "$STAGING_DIR"',
      relaunch ? '  open "$CURRENT_APP"' : "  true",
      "else",
      '  mv "$BACKUP_APP" "$CURRENT_APP" 2>/dev/null || true',
      "  exit 1",
      "fi",
      "",
    ].join("\n");

    writeFileSync(scriptPath, script, { mode: 0o755 });
    const child = spawn("bash", [scriptPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }

  private savePendingState(): void {
    if (!this.pendingUpdate) return;
    const state: PendingUpdateState = {
      ...this.pendingUpdate,
      downloadedAt: new Date().toISOString(),
    };
    writeFileSync(getStatePath(), JSON.stringify(state));
  }

  private restorePendingUpdate(): void {
    const statePath = getStatePath();
    if (!existsSync(statePath)) return;

    try {
      const raw = readFileSync(statePath, "utf8");
      const state = JSON.parse(raw) as PendingUpdateState;
      if (!existsSync(state.appPath)) {
        this.cleanStagingDir();
        return;
      }
      if (!isNewerVersion(state.version, app.getVersion())) {
        this.cleanStagingDir();
        return;
      }
      this.pendingUpdate = {
        version: state.version,
        appPath: state.appPath,
        releaseNotes: state.releaseNotes,
        releaseDate: state.releaseDate,
      };
    } catch {
      this.cleanStagingDir();
    }
  }

  private cleanStagingDir(): void {
    const stagingDir = getStagingDir();
    if (existsSync(stagingDir)) {
      rmSync(stagingDir, { recursive: true, force: true });
    }
  }
}
