// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

async function eventually<T>(fn: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 5_000;
  let last: T;
  while (Date.now() < deadline) {
    last = await fn();
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return await fn();
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

  it("adds compatibility sources to extension CSP without broadening unrelated directives", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-csp-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "csp-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  vscode.window.registerWebviewViewProvider("csp.view", {
    resolveWebviewView(view) {
      view.webview.html = \`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; font-src \${view.webview.cspSource}; script-src \${view.webview.cspSource};"></head><body>CSP</body></html>\`;
    },
  });
};`,
      "utf8",
    );

    const host = startHost(extensionPath);
    running.push(host);

    const { origin } = await host.ready;
    const html = await fetch(`${origin}/view/${encodeURIComponent("csp.view")}?token=t`).then((r) => r.text());

    expect(html).toContain(`font-src ${origin} data:`);
    expect(html).toContain(`script-src ${origin} 'unsafe-eval'`);
    expect(html).toContain(`connect-src ${origin}`);
    expect(html).toContain(`img-src https:`);
  });

  it("injects the VS Code bridge scripts before a strict meta CSP", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-csp-order-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "csp-order-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  vscode.window.registerWebviewViewProvider("csp.order.view", {
    resolveWebviewView(view) {
      view.webview.html = \`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src \${view.webview.cspSource};"></head><body>Order</body></html>\`;
    },
  });
};`,
      "utf8",
    );

    const host = startHost(extensionPath);
    running.push(host);

    const { origin } = await host.ready;
    const html = await fetch(`${origin}/view/${encodeURIComponent("csp.order.view")}?token=t`).then((r) => r.text());

    const headStart = html.indexOf("<head>");
    const metaIndex = html.indexOf('<meta http-equiv="Content-Security-Policy"');
    const apiScriptIndex = html.indexOf(`<script src="${origin}/vscode/api.js?viewType=csp.order.view&token=t"></script>`);
    const runtimeBridgeIndex = html.indexOf("__luminaRuntimeIssue");

    expect(headStart).toBeGreaterThanOrEqual(0);
    expect(metaIndex).toBeGreaterThan(headStart);
    expect(apiScriptIndex).toBeGreaterThan(headStart);
    expect(runtimeBridgeIndex).toBeGreaterThan(headStart);
    expect(apiScriptIndex).toBeLessThan(metaIndex);
    expect(runtimeBridgeIndex).toBeLessThan(metaIndex);
  });

  it("records runtime issues reported by the webview bridge in health", async () => {
    const extensionPath = path.resolve("scripts/codex-vscode-host/fixtures/hello-ext");
    const host = startHost(extensionPath);
    running.push(host);

    const { origin } = await host.ready;
    const token = "runtime-token";
    await fetch(`${origin}/view/${encodeURIComponent("hello.view")}?token=${token}`).then((r) => r.text());

    const report = await fetch(`${origin}/vscode/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        viewType: "hello.view",
        token,
        message: {
          type: "__luminaRuntimeIssue",
          payload: {
            kind: "securitypolicyviolation",
            message: "Content Security Policy blocked a Codex webview resource.",
            detail: {
              effectiveDirective: "font-src",
              blockedURI: "data:font/woff2;base64,abc",
            },
          },
        },
      }),
    }).then((r) => r.json());

    expect(report.ok).toBe(true);

    const health = await fetch(`${origin}/health`).then((r) => r.json());
    expect(health.latestRuntimeIssue).toMatchObject({
      viewType: "hello.view",
      kind: "securitypolicyviolation",
      message: "Content Security Policy blocked a Codex webview resource.",
    });
    expect(health.latestRuntimeIssue.detail).toMatchObject({
      effectiveDirective: "font-src",
      blockedURI: "data:font/woff2;base64,abc",
    });
  });

  it("exposes recent webview traffic in the debug endpoint", async () => {
    const extensionPath = path.resolve("scripts/codex-vscode-host/fixtures/hello-ext");
    const host = startHost(extensionPath);
    running.push(host);

    const { origin } = await host.ready;
    const token = "debug-token";
    await fetch(`${origin}/view/${encodeURIComponent("hello.view")}?token=${token}`).then((r) => r.text());

    await fetch(`${origin}/vscode/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewType: "hello.view", token, message: { type: "ping", payload: { nested: "value" } } }),
    }).then((r) => r.json());

    const traffic = await fetch(`${origin}/debug/traffic`).then((r) => r.json());
    expect(Array.isArray(traffic.events)).toBe(true);
    expect(traffic.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "webviewMessage",
          direction: "webview->host",
          viewType: "hello.view",
          summary: expect.objectContaining({ type: "ping" }),
        }),
      ]),
    );

    const reset = await fetch(`${origin}/debug/traffic/reset`, { method: "POST" }).then((r) => r.json());
    expect(reset).toEqual({ ok: true });

    const clearedTraffic = await fetch(`${origin}/debug/traffic`).then((r) => r.json());
    expect(clearedTraffic.events).toEqual([]);
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

  it("supports panel, terminal, showTextDocument, and vscode.diff compatibility APIs", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-api-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "api-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(path.join(extensionPath, "README.md"), "# API fixture\n", "utf8");
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate(context) {
  const vscode = require("vscode");
  const panel = vscode.window.createWebviewPanel("api.panel", "API Panel", vscode.ViewColumn.One, { enableScripts: true });
  panel.webview.html = "<!doctype html><html><head></head><body>Panel Body</body></html>";
  const terminal = vscode.window.createTerminal("Claude Code");
  terminal.sendText("claude --help", false);
  terminal.show();
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(context.extensionUri, "README.md"));
  await vscode.window.showTextDocument(doc);
  await vscode.commands.executeCommand(
    "vscode.diff",
    vscode.Uri.joinPath(context.extensionUri, "README.md"),
    vscode.Uri.joinPath(context.extensionUri, "README.md"),
    "fixture diff"
  );
};`,
      "utf8",
    );

    const host = startHost(extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const registered = await eventually(
      () => fetch(`${origin}/debug/registered`).then((r) => r.json()),
      (value) => Array.isArray(value.panels) && value.panels.length === 1,
    );
    expect(registered.panels[0]).toMatchObject({ id: "1", viewType: "api.panel", title: "API Panel" });

    const html = await fetch(`${origin}/panel/1?token=panel-1`).then((r) => r.text());
    expect(html).toContain("Panel Body");
    expect(html).toContain("/vscode/api.js");

    const traffic = await fetch(`${origin}/debug/traffic`).then((r) => r.json());
    expect(traffic.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "terminal",
          summary: expect.objectContaining({ event: "create", name: "Claude Code" }),
        }),
        expect.objectContaining({
          category: "builtinCommand",
          summary: expect.objectContaining({ command: "vscode.diff", title: "fixture diff" }),
        }),
        expect.objectContaining({
          category: "editor",
          summary: expect.objectContaining({ event: "showTextDocument" }),
        }),
      ]),
    );

    const diff = await fetch(`${origin}/debug/diff`).then((r) => r.json());
    expect(diff.requests).toEqual([
      expect.objectContaining({
        id: 1,
        title: "fixture diff",
        left: expect.stringContaining("README.md"),
        right: expect.stringContaining("README.md"),
      }),
    ]);
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
