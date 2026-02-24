import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";

function findEdgeExecutablePath(): string | null {
  const candidates = [
    "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
    "C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

async function startHost(extensionPath: string) {
  const hostScript = path.resolve("scripts/codex-vscode-host/host.mjs");
  const proc = spawn(process.execPath, [hostScript, "--extensionPath", extensionPath, "--port", "0", "--quiet"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const cleanup = () => {
    try {
      proc.kill();
    } catch {
      // ignore
    }
  };

  const ready = await new Promise<{ origin: string }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const onData = (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const line = stdout.split(/\r?\n/).find(Boolean);
      if (!line) return;
      try {
        const msg = JSON.parse(line);
        if (msg?.type === "READY" && typeof msg.origin === "string") resolve({ origin: msg.origin });
      } catch {
        // ignore until READY
      }
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    proc.once("exit", (code) => reject(new Error(`host exited early (code=${code})\n${stderr}`)));
  });

  return { ...ready, cleanup };
}

async function openWebview(page: Page, origin: string) {
  const url = `${origin}/view/chatgpt.sidebarView?token=t`;
  await page.setContent(
    `<!doctype html><html><body style="margin:0">
      <iframe id="w" style="border:0;width:100vw;height:100vh"></iframe>
    </body></html>`,
  );
  await page.evaluate((u) => {
    const iframe = document.getElementById("w") as HTMLIFrameElement | null;
    if (!iframe) throw new Error("missing iframe");
    iframe.src = u;
  }, url);
  await page.waitForTimeout(8000);
  return url;
}

describe("openai.chatgpt webview smoke (e2e)", () => {
  let browser: Browser | null = null;
  let cleanupHost: (() => void) | null = null;

  afterEach(async () => {
    try {
      cleanupHost?.();
    } finally {
      cleanupHost = null;
    }
    if (browser) await browser.close();
    browser = null;
  });

  it.skipIf(!process.env.CODEX_E2E)("loads chatgpt.sidebarView without crashing", async () => {
    const edge = findEdgeExecutablePath();
    if (!edge) throw new Error("Microsoft Edge not found");

    const extensionPath = path.resolve(".tmp_codex_ext/openai.chatgpt/extension");
    const { origin, cleanup } = await startHost(extensionPath);
    cleanupHost = cleanup;

    browser = await chromium.launch({ headless: true, executablePath: edge });
    const page = await browser.newPage();

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const httpErrors: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (text === "Failed to load resource: the server responded with a status of 404 (Not Found)") return;
      consoleErrors.push(text);
    });
    page.on("response", (res) => {
      if (res.status() < 400) return;
      const url = res.url();
      if (url.endsWith("/favicon.ico")) return;
      httpErrors.push(`${res.status()} ${url}`);
    });

    const url = await openWebview(page, origin);

    const allErrors = [...pageErrors, ...consoleErrors, ...httpErrors];
    expect(allErrors, `errors while loading ${url}:\n${allErrors.join("\n")}`).toEqual([]);
  }, 30_000);
});
