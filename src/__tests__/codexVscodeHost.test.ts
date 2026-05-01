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
    expect(htmlLight).toContain("--vscode-menu-background");
    expect(htmlLight).toContain("--vscode-input-background");
  });

  it("applies the view theme query before resolving the webview", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-theme-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({
        name: "theme-ext",
        version: "0.0.0",
        main: "./extension.js",
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  vscode.window.registerWebviewViewProvider("theme.view", {
    resolveWebviewView(view) {
      view.webview.html = "<!doctype html><html><body>theme:" + vscode.window.activeColorTheme.kind + "</body></html>";
    },
  });
};`,
      "utf8",
    );
    const host = startHost(extensionPath);
    running.push(host);

    const { origin } = await host.ready;
    const html = await fetch(`${origin}/view/${encodeURIComponent("theme.view")}?token=t&theme=light`).then((r) =>
      r.text(),
    );
    const health = await fetch(`${origin}/health`).then((r) => r.json());

    expect(html).toContain("theme:1");
    expect(html).toContain("vscode-light");
    expect(health.theme).toBe("light");
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

    const bridge = await fetch(`${origin}/lumina/ide-bridge`).then((rr) => rr.json());
    expect(bridge.selection).toMatchObject({
      anchor: { line: 0, character: 0 },
      active: { line: 0, character: 0 },
      isReversed: false,
    });
  });

  it("supports workspace.findFiles within the workspace folder", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-find-files-ext-"));
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-workspace-"));
    fs.mkdirSync(path.join(workspacePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, "src", "one.ts"), "export const one = 1;\n", "utf8");
    fs.writeFileSync(path.join(workspacePath, "two.md"), "# Two\n", "utf8");
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "find-files-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  const files = await vscode.workspace.findFiles("**/*.ts");
  if (files.length !== 1 || !files[0].fsPath.endsWith("src/one.ts")) {
    throw new Error("findFiles did not return expected TypeScript file");
  }
};`,
      "utf8",
    );

    const host = startHost(extensionPath, workspacePath);
    running.push(host);
    const { origin } = await host.ready;

    const health = await fetch(`${origin}/health`).then((r) => r.json());
    expect(health.activateError).toBeNull();
  });

  it("supports createFileSystemWatcher compatibility API", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-watcher-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "watcher-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.ts");
  watcher.onDidCreate(() => undefined);
  watcher.onDidChange(() => undefined);
  watcher.onDidDelete(() => undefined);
  watcher.dispose();
};`,
      "utf8",
    );

    const host = startHost(extensionPath, extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const traffic = await eventually(
      () => fetch(`${origin}/debug/traffic`).then((r) => r.json()),
      (value) =>
        value.events.some(
          (event: { category?: string; summary?: Record<string, unknown> }) =>
            event.category === "fileSystemWatcher" && event.summary?.event === "dispose",
        ),
    );
    expect(traffic.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "fileSystemWatcher",
          summary: expect.objectContaining({ event: "create" }),
        }),
        expect.objectContaining({
          category: "fileSystemWatcher",
          summary: expect.objectContaining({ event: "dispose" }),
        }),
      ]),
    );
  });

  it("supports notebook output item compatibility API", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-notebook-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "notebook-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  const item = vscode.NotebookCellOutputItem.error(new Error("boom"));
  if (item.mime !== "application/vnd.code.notebook.error") {
    throw new Error("unexpected notebook error mime: " + item.mime);
  }
};`,
      "utf8",
    );

    const host = startHost(extensionPath, extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const health = await fetch(`${origin}/health`).then((r) => r.json());
    expect(health.ok).toBe(true);
    expect(health.activateError).toBeNull();
  });

  it("exposes env metadata and clipboard compatibility API", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-env-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "env-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  if (!vscode.env.appName.toLowerCase().includes("lumina")) {
    throw new Error("missing appName");
  }
  if (!vscode.env.uriScheme || !vscode.env.machineId || !vscode.env.sessionId) {
    throw new Error("missing env metadata");
  }
  await vscode.env.clipboard.writeText("copied");
  const text = await vscode.env.clipboard.readText();
  if (text !== "copied") throw new Error("clipboard mismatch");
};`,
      "utf8",
    );

    const host = startHost(extensionPath, extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const health = await fetch(`${origin}/health`).then((r) => r.json());
    expect(health.ok).toBe(true);
    expect(health.activateError).toBeNull();
  });

  it("exposes environment variable collection on extension context", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-env-collection-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "env-collection-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate(context) {
  context.environmentVariableCollection.replace("CLAUDE_CODE_SSE_PORT", "12345");
  const value = context.environmentVariableCollection.get("CLAUDE_CODE_SSE_PORT");
  if (value?.value !== "12345") throw new Error("missing env collection value");
  context.environmentVariableCollection.clear();
};`,
      "utf8",
    );

    const host = startHost(extensionPath, extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const health = await fetch(`${origin}/health`).then((r) => r.json());
    expect(health.ok).toBe(true);
    expect(health.activateError).toBeNull();
  });

  it("supports custom file system provider compatibility API", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-fs-provider-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "fs-provider-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  const emitter = new vscode.EventEmitter();
  const files = new Map();
  const provider = {
    onDidChangeFile: emitter.event,
    watch() { return new vscode.Disposable(() => undefined); },
    stat(uri) { return { type: vscode.FileType.File, ctime: 1, mtime: 2, size: files.get(uri.path)?.length ?? 0 }; },
    readDirectory() { return []; },
    readFile(uri) { return files.get(uri.path) ?? new Uint8Array(); },
    writeFile(uri, content) {
      files.set(uri.path, content);
      emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    },
    createDirectory() {},
    delete() {},
    rename() {},
  };
  const disposable = vscode.workspace.registerFileSystemProvider("mem", provider, { isReadonly: false });
  const uri = vscode.Uri.from({ scheme: "mem", path: "/note.txt" });
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode("hello"));
  const doc = await vscode.workspace.openTextDocument(uri);
  if (doc.getText() !== "hello") throw new Error("unexpected custom fs content");
  disposable.dispose();
};`,
      "utf8",
    );

    const host = startHost(extensionPath, extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const traffic = await eventually(
      () => fetch(`${origin}/debug/traffic`).then((r) => r.json()),
      (value) =>
        value.events.some(
          (event: { category?: string; summary?: Record<string, unknown> }) =>
            event.category === "fileSystemProvider" && event.summary?.event === "dispose",
        ),
    );
    const health = await fetch(`${origin}/health`).then((r) => r.json());
    expect(health.ok).toBe(true);
    expect(health.activateError).toBeNull();
    expect(traffic.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "fileSystemProvider",
          summary: expect.objectContaining({ event: "register", scheme: "mem" }),
        }),
        expect.objectContaining({
          category: "fileSystemProvider",
          summary: expect.objectContaining({ event: "dispose", scheme: "mem" }),
        }),
      ]),
    );
  });

  it("supports text document content provider compatibility API", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-content-provider-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "content-provider-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  const emitter = new vscode.EventEmitter();
  const disposable = vscode.workspace.registerTextDocumentContentProvider("readonly", {
    onDidChange: emitter.event,
    provideTextDocumentContent(uri) {
      return "content:" + uri.path;
    },
  });
  const uri = vscode.Uri.from({ scheme: "readonly", path: "/note.txt" });
  emitter.fire(uri);
  const doc = await vscode.workspace.openTextDocument(uri);
  if (doc.getText() !== "content:/note.txt") throw new Error("unexpected readonly content");
  disposable.dispose();
};`,
      "utf8",
    );

    const host = startHost(extensionPath, extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const traffic = await eventually(
      () => fetch(`${origin}/debug/traffic`).then((r) => r.json()),
      (value) =>
        value.events.some(
          (event: { category?: string; summary?: Record<string, unknown> }) =>
            event.category === "textDocumentContentProvider" && event.summary?.event === "dispose",
        ),
    );
    const health = await fetch(`${origin}/health`).then((r) => r.json());
    expect(health.ok).toBe(true);
    expect(health.activateError).toBeNull();
    expect(traffic.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "textDocumentContentProvider",
          summary: expect.objectContaining({ event: "register", scheme: "readonly" }),
        }),
        expect.objectContaining({
          category: "textDocumentContentProvider",
          summary: expect.objectContaining({ event: "dispose", scheme: "readonly" }),
        }),
      ]),
    );
  });

  it("supports webview panel serializer compatibility API", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-panel-serializer-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "panel-serializer-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  const disposable = vscode.window.registerWebviewPanelSerializer("restored.panel", {
    async deserializeWebviewPanel() {},
  });
  disposable.dispose();
};`,
      "utf8",
    );

    const host = startHost(extensionPath, extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const traffic = await eventually(
      () => fetch(`${origin}/debug/traffic`).then((r) => r.json()),
      (value) =>
        value.events.some(
          (event: { category?: string; summary?: Record<string, unknown> }) =>
            event.category === "webviewPanelSerializer" && event.summary?.event === "dispose",
        ),
    );
    const health = await fetch(`${origin}/health`).then((r) => r.json());
    expect(health.ok).toBe(true);
    expect(health.activateError).toBeNull();
    expect(traffic.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "webviewPanelSerializer",
          summary: expect.objectContaining({ event: "register", viewType: "restored.panel" }),
        }),
        expect.objectContaining({
          category: "webviewPanelSerializer",
          summary: expect.objectContaining({ event: "dispose", viewType: "restored.panel" }),
        }),
      ]),
    );
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
  const editor = await vscode.window.showTextDocument(doc);
  if (!editor.selection || editor.selections.length !== 1 || editor.selection.anchor.line !== 0) {
    throw new Error("missing editor selection");
  }
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

  it("tracks VS Code setContext command state", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-context-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "context-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  await vscode.commands.executeCommand("setContext", "openai.chatgpt.ctx.app.supportsPairing", true);
};`,
      "utf8",
    );

    const host = startHost(extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const registered = await eventually(
      () => fetch(`${origin}/debug/registered`).then((r) => r.json()),
      (value) => value.contextKeys?.["openai.chatgpt.ctx.app.supportsPairing"] === true,
    );
    expect(registered.contextKeys).toMatchObject({
      "openai.chatgpt.ctx.app.supportsPairing": true,
    });
  });

  it("supports contributed configuration defaults and inspect()", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-config-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({
        name: "config-ext",
        version: "0.0.0",
        main: "./extension.js",
        contributes: {
          configuration: {
            properties: {
              "claudeCode.initialPermissionMode": {
                type: "string",
                default: "default",
              },
              "claudeCode.preferredLocation": {
                type: "string",
                default: "panel",
              },
            },
          },
        },
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  const config = vscode.workspace.getConfiguration("claudeCode");
  const inspected = config.inspect("initialPermissionMode");
  if (inspected.defaultValue !== "default") {
    throw new Error("missing contributed default");
  }
  if (config.get("preferredLocation") !== "panel") {
    throw new Error("missing get() default");
  }
  if (!config.has("preferredLocation")) {
    throw new Error("missing has() support");
  }
  await config.update("preferredLocation", "sidebar", vscode.ConfigurationTarget.Global);
  if (config.inspect("preferredLocation").globalValue !== "sidebar") {
    throw new Error("missing updated globalValue");
  }
};`,
      "utf8",
    );

    const host = startHost(extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const health = await fetch(`${origin}/health`).then((r) => r.json());
    expect(health.activateError).toBeNull();
  });

  it("supports diagnostic collection compatibility APIs", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-diagnostics-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "diagnostics-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate(context) {
  const vscode = require("vscode");
  const collection = vscode.languages.createDiagnosticCollection("lumina-test");
  const uri = vscode.Uri.joinPath(context.extensionUri, "README.md");
  collection.set(uri, []);
  if (!collection.has(uri) || !Array.isArray(collection.get(uri))) {
    throw new Error("diagnostic collection did not store entries");
  }
  collection.clear();
  collection.dispose();
};`,
      "utf8",
    );

    const host = startHost(extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const traffic = await eventually(
      () => fetch(`${origin}/debug/traffic`).then((r) => r.json()),
      (value) =>
        value.events.some(
          (event: { category?: string; summary?: Record<string, unknown> }) =>
            event.category === "diagnostics" &&
            event.summary?.event === "createDiagnosticCollection",
        ),
    );
    expect(traffic.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "diagnostics",
          summary: expect.objectContaining({
            event: "createDiagnosticCollection",
            name: "lumina-test",
          }),
        }),
      ]),
    );
  });

  it("supports window.withProgress compatibility API", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-progress-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "progress-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Working", cancellable: true },
    async (progress, token) => {
      if (token.isCancellationRequested) throw new Error("unexpected cancellation");
      progress.report({ message: "Halfway", increment: 50 });
      return "done";
    }
  );
  if (result !== "done") throw new Error("unexpected progress result");
};`,
      "utf8",
    );

    const host = startHost(extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const traffic = await eventually(
      () => fetch(`${origin}/debug/traffic`).then((r) => r.json()),
      (value) =>
        value.events.some(
          (event: { category?: string; summary?: Record<string, unknown> }) =>
            event.category === "progress" && event.summary?.event === "end",
        ),
    );
    expect(traffic.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "progress",
          summary: expect.objectContaining({ event: "start", title: "Working" }),
        }),
        expect.objectContaining({
          category: "progress",
          summary: expect.objectContaining({ event: "report", message: "Halfway" }),
        }),
        expect.objectContaining({
          category: "progress",
          summary: expect.objectContaining({ event: "end", title: "Working" }),
        }),
      ]),
    );
  });

  it("supports status bar item compatibility APIs", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-status-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "status-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  const item = vscode.window.createStatusBarItem("lumina.status", vscode.StatusBarAlignment.Left, 10);
  item.name = "Lumina Status";
  item.text = "Ready";
  item.tooltip = "Lumina ready";
  item.show();
};`,
      "utf8",
    );

    const host = startHost(extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const registered = await eventually(
      () => fetch(`${origin}/debug/registered`).then((r) => r.json()),
      (value) =>
        value.statusBarItems?.some(
          (item: { id?: string; text?: string }) =>
            item.id === "lumina.status" && item.text === "Ready",
        ),
    );
    expect(registered.statusBarItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "lumina.status",
          text: "Ready",
          name: "Lumina Status",
        }),
      ]),
    );
  });

  it("exposes extension context storage and log URIs", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-context-storage-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "context-storage-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate(context) {
  const vscode = require("vscode");
  if (!context.globalStorageUri || !context.storageUri || !context.logUri) {
    throw new Error("missing context storage uris");
  }
  const file = vscode.Uri.joinPath(context.globalStorageUri, "state.txt");
  await vscode.workspace.fs.writeFile(file, Buffer.from("ok"));
  const bytes = await vscode.workspace.fs.readFile(file);
  if (Buffer.from(bytes).toString("utf8") !== "ok") {
    throw new Error("global storage write failed");
  }
};`,
      "utf8",
    );

    const host = startHost(extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const health = await fetch(`${origin}/health`).then((r) => r.json());
    expect(health.activateError).toBeNull();
    expect(
      fs.existsSync(path.join(extensionPath, ".lumina-host-storage", "global", "state.txt")),
    ).toBe(true);
  });

  it("supports minimal authentication provider and getSession compatibility APIs", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-auth-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "auth-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  vscode.authentication.registerAuthenticationProvider("lumina-test", "Lumina Test", {
    onDidChangeSessions: new vscode.EventEmitter().event,
    async getSessions() {
      return [];
    },
    async createSession(scopes) {
      return {
        id: "session-1",
        accessToken: "token",
        account: { id: "account-1", label: "Test Account" },
        scopes,
      };
    },
    async removeSession() {},
  }, { supportsMultipleAccounts: false });
  const session = await vscode.authentication.getSession("lumina-test", ["chat"], { createIfNone: true });
  if (!session || session.account.label !== "Test Account") {
    throw new Error("missing authentication session");
  }
};`,
      "utf8",
    );

    const host = startHost(extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const traffic = await eventually(
      () => fetch(`${origin}/debug/traffic`).then((r) => r.json()),
      (value) =>
        value.events.some(
          (event: { category?: string; summary?: Record<string, unknown> }) =>
            event.category === "authentication" &&
            event.summary?.event === "getSession" &&
            event.summary?.hasSession === true,
        ),
    );

    expect(traffic.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "authentication",
          summary: expect.objectContaining({ event: "registerProvider", providerId: "lumina-test" }),
        }),
        expect.objectContaining({
          category: "authentication",
          summary: expect.objectContaining({ event: "getSession", hasSession: true }),
        }),
      ]),
    );
  });

  it("supports workspace.fs directory and file mutation APIs", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-vscode-fs-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "fs-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate(context) {
  const vscode = require("vscode");
  const dir = vscode.Uri.joinPath(context.extensionUri, "tmp-fs");
  const file = vscode.Uri.joinPath(dir, "hello.txt");
  const renamed = vscode.Uri.joinPath(dir, "renamed.txt");
  const copied = vscode.Uri.joinPath(dir, "copied.txt");
  await vscode.workspace.fs.createDirectory(dir);
  await vscode.workspace.fs.writeFile(file, Buffer.from("hello"));
  const stat = await vscode.workspace.fs.stat(file);
  if (stat.type !== vscode.FileType.File || stat.size !== 5) {
    throw new Error("unexpected stat");
  }
  const entries = await vscode.workspace.fs.readDirectory(dir);
  if (!entries.some(([name, type]) => name === "hello.txt" && type === vscode.FileType.File)) {
    throw new Error("missing directory entry");
  }
  await vscode.workspace.fs.rename(file, renamed);
  await vscode.workspace.fs.copy(renamed, copied);
  const copiedBytes = await vscode.workspace.fs.readFile(copied);
  if (Buffer.from(copiedBytes).toString("utf8") !== "hello") {
    throw new Error("copy failed");
  }
  await vscode.workspace.fs.delete(dir, { recursive: true });
};`,
      "utf8",
    );

    const host = startHost(extensionPath);
    running.push(host);
    const { origin } = await host.ready;

    const health = await eventually(
      () => fetch(`${origin}/health`).then((r) => r.json()),
      () => !fs.existsSync(path.join(extensionPath, "tmp-fs")),
    );
    expect(health.activateError).toBeNull();
    expect(fs.existsSync(path.join(extensionPath, "tmp-fs"))).toBe(false);
  });

  it("exposes a minimal Lumina IDE bridge state endpoint", async () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-ide-bridge-ext-"));
    fs.writeFileSync(
      path.join(extensionPath, "package.json"),
      JSON.stringify({ name: "bridge-ext", version: "0.0.0", main: "./extension.js" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(extensionPath, "extension.js"),
      `"use strict";
exports.activate = async function activate() {
  const vscode = require("vscode");
  const state = vscode.lumina.ideBridge.getState();
  if (!state.workspaceFolders.length) throw new Error("missing workspace");
};`,
      "utf8",
    );

    const workspacePath = extensionPath;
    const host = startHost(extensionPath, workspacePath);
    running.push(host);
    const { origin } = await host.ready;

    const state = await fetch(`${origin}/lumina/ide-bridge`).then((r) => r.json());
    expect(state.workspaceFolders).toEqual([workspacePath]);

    await fetch(`${origin}/lumina/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activeDocument: {
          path: path.join(workspacePath, "README.md"),
          languageId: "markdown",
          content: "# Bridge\\n",
        },
      }),
    });

    const next = await fetch(`${origin}/lumina/ide-bridge`).then((r) => r.json());
    expect(next.activeDocument).toMatchObject({
      path: path.join(workspacePath, "README.md"),
      languageId: "markdown",
      content: "# Bridge\\n",
    });
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
