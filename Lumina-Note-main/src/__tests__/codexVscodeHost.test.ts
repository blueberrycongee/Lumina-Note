// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";

function startHost(extensionPath: string, workspacePath?: string) {
  const hostScript = path.resolve("scripts/codex-vscode-host/host.mjs");

  const args = [hostScript, "--extensionPath", extensionPath, "--port", "0", "--quiet"];
  if (workspacePath) args.push("--workspacePath", workspacePath);

  const proc = spawn(process.execPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stdout.on("data", (d) => (stdout += d));
  proc.stderr.on("data", (d) => (stderr += d));

  const ready = new Promise<{ origin: string; port: number }>((resolve, reject) => {
    const onData = (chunk: string) => {
      const lines = chunk.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg?.type === "READY") {
            proc.stdout.off("data", onData);
            resolve({ origin: msg.origin, port: msg.port });
            return;
          }
        } catch {
          // ignore
        }
      }
    };
    proc.stdout.on("data", onData);
    proc.on("exit", (code) => reject(new Error(`host exited early code=${code}\nstdout=${stdout}\nstderr=${stderr}`)));
  });

  return { proc, ready, getStderr: () => stderr };
}

let running: Array<ReturnType<typeof startHost>> = [];
afterEach(async () => {
  for (const h of running) h.proc.kill();
  running = [];
});

describe("codex-vscode-host", () => {
  it("serves a webview from a fixture extension and bridges messages", async () => {
    const extensionPath = path.resolve("scripts/codex-vscode-host/fixtures/hello-ext");
    const host = startHost(extensionPath);
    running.push(host);

    const { origin } = await host.ready;

    const health = await fetch(`${origin}/health`).then((r) => r.json());
    expect(health.ok).toBe(true);
    expect(health.viewTypes).toContain("hello.view");

    const token = "t1";
    const html = await fetch(`${origin}/view/${encodeURIComponent("hello.view")}?token=${token}`).then((r) => r.text());
    expect(html).toContain("Hello Webview");
    expect(html).toContain("/vscode/api.js");

    const apiJs = await fetch(`${origin}/vscode/api.js?viewType=${encodeURIComponent("hello.view")}&token=${token}`).then(
      (r) => r.text(),
    );
    expect(apiJs).toContain("acquireVsCodeApi");

    const postOk = await fetch(`${origin}/vscode/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewType: "hello.view", token, message: { type: "ping" } }),
    }).then((r) => r.json());
    expect(postOk.ok).toBe(true);

    const polled = await fetch(
      `${origin}/vscode/poll?viewType=${encodeURIComponent("hello.view")}&token=${encodeURIComponent(token)}&cursor=0`,
    ).then((r) => r.json());
    expect(polled.messages).toEqual([{ type: "echo", msg: { type: "ping" } }]);
  });

  it("exposes workspace folder when provided", async () => {
    const extensionPath = path.resolve("scripts/codex-vscode-host/fixtures/hello-ext");
    const workspacePath = path.resolve("scripts/codex-vscode-host/fixtures/hello-ext");
    const host = startHost(extensionPath, workspacePath);
    running.push(host);

    const { origin } = await host.ready;
    const health = await fetch(`${origin}/health`).then((r) => r.json());
    expect(health.ok).toBe(true);
    expect(health.workspaceFolders).toEqual([workspacePath]);
  });

  it("reflects theme in rendered webview html", async () => {
    const extensionPath = path.resolve("scripts/codex-vscode-host/fixtures/hello-ext");
    const host = startHost(extensionPath);
    running.push(host);

    const { origin } = await host.ready;

    const set = async (theme: "dark" | "light") => {
      const r = await fetch(`${origin}/lumina/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      expect(r.status).toBe(200);
    };

    await set("dark");
    const htmlDark = await fetch(`${origin}/view/${encodeURIComponent("hello.view")}?token=t&theme=dark`).then((r) =>
      r.text(),
    );
    expect(htmlDark).toContain("vscode-dark");

    await set("light");
    const htmlLight = await fetch(`${origin}/view/${encodeURIComponent("hello.view")}?token=t&theme=light`).then((r) =>
      r.text(),
    );
    expect(htmlLight).toContain("vscode-light");
  });

  it("injects base layout styles for webview rendering", async () => {
    const extensionPath = path.resolve("scripts/codex-vscode-host/fixtures/hello-ext");
    const host = startHost(extensionPath);
    running.push(host);

    const { origin } = await host.ready;
    const html = await fetch(`${origin}/view/${encodeURIComponent("hello.view")}?token=t`).then((r) => r.text());
    expect(html).toContain("data-lumina-webview-base");
  });

  it("reflects active document in health and fires without crashing", async () => {
    const extensionPath = path.resolve("scripts/codex-vscode-host/fixtures/hello-ext");
    const workspacePath = path.resolve("scripts/codex-vscode-host/fixtures/hello-ext");
    const host = startHost(extensionPath, workspacePath);
    running.push(host);

    const { origin } = await host.ready;

    const docPath = path.join(workspacePath, "README.md");
    const r = await fetch(`${origin}/lumina/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activeDocument: {
          path: docPath,
          languageId: "markdown",
          content: "# Hello\n",
        },
      }),
    });
    expect(r.status).toBe(200);

    const health = await fetch(`${origin}/health`).then((rr) => rr.json());
    expect(health.activeDocument?.path).toBe(docPath);
    expect(health.activeDocument?.languageId).toBe("markdown");
  });

  it("returns 404 for unknown views", async () => {
    const extensionPath = path.resolve("scripts/codex-vscode-host/fixtures/hello-ext");
    const host = startHost(extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const r = await fetch(`${origin}/view/${encodeURIComponent("nope.view")}?token=t`);
    expect(r.status).toBe(404);
  });
});
