import http from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Module = require("node:module");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[name] = next;
      i++;
    } else {
      args[name] = true;
    }
  }
  return args;
}

class Disposable {
  #dispose;
  constructor(dispose) {
    this.#dispose = dispose ?? (() => {});
  }
  static from(...disposables) {
    return new Disposable(() => {
      for (const d of disposables) {
        try {
          d?.dispose?.();
        } catch {
          // ignore
        }
      }
    });
  }
  dispose() {
    this.#dispose();
  }
}

class EventEmitter {
  #listeners = new Set();
  event = (listener) => {
    this.#listeners.add(listener);
    return new Disposable(() => this.#listeners.delete(listener));
  };
  fire(data) {
    for (const listener of [...this.#listeners]) {
      try {
        listener(data);
      } catch {
        // ignore
      }
    }
  }
  dispose() {
    this.#listeners.clear();
  }
}

class Uri {
  constructor(scheme, fsPathOrPathname, raw) {
    this.scheme = scheme;
    this.fsPath = scheme === "file" ? fsPathOrPathname : undefined;
    this.path = scheme === "file" ? undefined : fsPathOrPathname;
    this.#raw = raw ?? null;
  }
  #raw;
  static file(fsPath) {
    return new Uri("file", path.resolve(fsPath));
  }
  static parse(input) {
    if (input.startsWith("file://")) {
      const p = fileURLToPath(input);
      return Uri.file(p);
    }
    try {
      const u = new URL(input);
      return new Uri(u.protocol.replace(":", ""), `${u.host}${u.pathname}${u.search}${u.hash}`, u.toString());
    } catch {
      return new Uri("unknown", input, input);
    }
  }
  static joinPath(base, ...segments) {
    if (base.scheme !== "file" || !base.fsPath) {
      throw new Error("Uri.joinPath only supports file uris in this host");
    }
    return Uri.file(path.join(base.fsPath, ...segments));
  }
  toString() {
    if (this.scheme === "file") return `file://${this.fsPath}`;
    if (this.#raw) return this.#raw;
    return `${this.scheme}://${this.path ?? ""}`;
  }
}

class Memento {
  #store = new Map();
  get(key, defaultValue) {
    if (!this.#store.has(key)) return defaultValue;
    return this.#store.get(key);
  }
  async update(key, value) {
    this.#store.set(key, value);
  }
}

class SecretStorage {
  #store = new Map();
  async get(key) {
    return this.#store.get(key);
  }
  async store(key, value) {
    this.#store.set(key, value);
  }
  async delete(key) {
    this.#store.delete(key);
  }
  onDidChange = new EventEmitter().event;
}

class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

class CodeLens {
  constructor(range, command) {
    this.range = range;
    this.command = command;
  }
}

class Webview {
  html = "";
  options = {};
  #receiveMessageEmitter = new EventEmitter();
  onDidReceiveMessage = this.#receiveMessageEmitter.event;
  #postMessageSink;
  #asWebviewUri;
  cspSource;

  constructor({ postMessageSink, asWebviewUri, cspSource }) {
    this.#postMessageSink = postMessageSink;
    this.#asWebviewUri = asWebviewUri;
    this.cspSource = cspSource;
  }

  asWebviewUri(uri) {
    return this.#asWebviewUri(uri);
  }

  async postMessage(message) {
    this.#postMessageSink(message);
    return true;
  }

  _deliverFromClient(message) {
    this.#receiveMessageEmitter.fire(message);
  }
}

class WebviewView {
  visible = true;
  title = undefined;
  description = undefined;
  #disposeEmitter = new EventEmitter();
  onDidDispose = this.#disposeEmitter.event;
  #visibilityEmitter = new EventEmitter();
  onDidChangeVisibility = this.#visibilityEmitter.event;
  constructor(webview) {
    this.webview = webview;
  }
  show() {
    this.visible = true;
    this.#visibilityEmitter.fire();
  }
  dispose() {
    this.#disposeEmitter.fire();
    this.#disposeEmitter.dispose();
    this.#visibilityEmitter.dispose();
  }
}

class WebviewPanel {
  active = true;
  visible = true;
  #disposeEmitter = new EventEmitter();
  onDidDispose = this.#disposeEmitter.event;
  #viewStateEmitter = new EventEmitter();
  onDidChangeViewState = this.#viewStateEmitter.event;

  constructor(viewType, title, webview, viewColumn = 1) {
    this.viewType = viewType;
    this.title = title;
    this.webview = webview;
    this.viewColumn = viewColumn;
  }

  reveal(viewColumn = this.viewColumn) {
    this.active = true;
    this.visible = true;
    this.viewColumn = viewColumn;
    this.#viewStateEmitter.fire({ webviewPanel: this });
  }

  dispose() {
    this.active = false;
    this.visible = false;
    this.#disposeEmitter.fire();
    this.#disposeEmitter.dispose();
    this.#viewStateEmitter.dispose();
  }
}

class OutputChannel {
  constructor(name) {
    this.name = name;
  }
  append() {}
  appendLine() {}
  trace() {}
  debug() {}
  info() {}
  warn() {}
  error() {}
  clear() {}
  replace() {}
  show() {}
  hide() {}
  dispose() {}
}

function openExternalUrl(input) {
  const url = input?.toString?.() ?? String(input ?? "");
  if (!url) return false;

  try {
    if (process.platform === "win32") {
      const child = spawn("rundll32", ["url.dll,FileProtocolHandler", url], {
        stdio: "ignore",
        windowsHide: true,
        detached: true,
      });
      child.unref();
      return true;
    }

    if (process.platform === "darwin") {
      const child = spawn("open", [url], { stdio: "ignore", detached: true });
      child.unref();
      return true;
    }

    const child = spawn("xdg-open", [url], { stdio: "ignore", detached: true });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function withErrorBoundary(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  };
}

const MAX_RUNTIME_ISSUES = 8;
const RUNTIME_ISSUE_DEDUPE_WINDOW_MS = 2500;
const MAX_DEBUG_EVENTS = 80;
const DEBUG_EVENT_DEDUPE_WINDOW_MS = 1000;

function isThreadStreamBroadcastEvent(event) {
  const summary = event?.summary;
  return (
    event?.category === "webviewMessage" &&
    event?.direction === "host->webview" &&
    summary?.type === "ipc-broadcast" &&
    summary?.method === "thread-stream-state-changed"
  );
}

function truncateDebugString(value, maxLength = 180) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function summarizeDebugValue(value, depth = 0) {
  if (value == null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return truncateDebugString(value);
  }

  if (typeof value === "bigint") {
    return `${value}n`;
  }

  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateDebugString(value.message),
      stack: value.stack ? truncateDebugString(value.stack, 320) : null,
    };
  }

  if (Array.isArray(value)) {
    if (depth >= 3) {
      return `[Array(${value.length})]`;
    }
    return {
      type: "array",
      length: value.length,
      items: value.slice(0, 4).map((item) => summarizeDebugValue(item, depth + 1)),
    };
  }

  if (typeof value === "object") {
    if (depth >= 3) {
      const objectType = value?.constructor?.name;
      return objectType && objectType !== "Object" ? `[${objectType}]` : "[Object]";
    }

    const entries = Object.entries(value).slice(0, 12);
    const summary = {};
    for (const [key, entryValue] of entries) {
      summary[key] = summarizeDebugValue(entryValue, depth + 1);
    }
    const remainingKeys = Object.keys(value).length - entries.length;
    if (remainingKeys > 0) {
      summary.__remainingKeys = remainingKeys;
    }
    return summary;
  }

  return truncateDebugString(value);
}

function buildDebugEventSignature(event) {
  if (isThreadStreamBroadcastEvent(event)) {
    return JSON.stringify([
      event.category ?? "",
      event.direction ?? "",
      event.viewType ?? "",
      "ipc-broadcast",
      "thread-stream-state-changed",
    ]);
  }
  return JSON.stringify([
    event.category ?? "",
    event.direction ?? "",
    event.viewType ?? "",
    event.level ?? "",
    event.summary ?? null,
  ]);
}

function toSerializableDebugEvent(event) {
  if (!event) return null;
  const { signature: _signature, ...rest } = event;
  return rest;
}

function recordDebugEvent(state, event) {
  const now = Date.now();
  const signature = buildDebugEventSignature(event);
  const dedupeWindowMs = isThreadStreamBroadcastEvent(event) ? Number.POSITIVE_INFINITY : DEBUG_EVENT_DEDUPE_WINDOW_MS;
  const existing = state.debugEvents.find(
    (item) => item.signature === signature && now - item.lastSeenAt <= dedupeWindowMs,
  );
  if (existing) {
    existing.count += 1;
    existing.lastSeenAt = now;
    existing.summary = event.summary;
    return existing;
  }

  const next = {
    id: state.nextDebugEventId++,
    createdAt: now,
    lastSeenAt: now,
    count: 1,
    signature,
    ...event,
  };
  state.debugEvents = [next, ...state.debugEvents].slice(0, MAX_DEBUG_EVENTS);
  return next;
}

function buildRuntimeIssueSignature(issue) {
  return JSON.stringify([
    issue.viewType ?? "",
    issue.kind ?? "",
    issue.message ?? "",
    issue.detail ?? null,
  ]);
}

function recordRuntimeIssue(state, issue) {
  const now = Date.now();
  const signature = buildRuntimeIssueSignature(issue);
  const existing = state.runtimeIssues.find(
    (item) => item.signature === signature && now - item.lastSeenAt <= RUNTIME_ISSUE_DEDUPE_WINDOW_MS,
  );

  if (existing) {
    existing.count += 1;
    existing.lastSeenAt = now;
    return existing;
  }

  const next = {
    id: state.nextRuntimeIssueId++,
    viewType: issue.viewType,
    kind: issue.kind,
    message: issue.message,
    detail: issue.detail ?? null,
    createdAt: now,
    lastSeenAt: now,
    count: 1,
    signature,
  };

  state.runtimeIssues = [next, ...state.runtimeIssues].slice(0, MAX_RUNTIME_ISSUES);
  recordDebugEvent(state, {
    category: "runtimeIssue",
    summary: {
      viewType: next.viewType,
      kind: next.kind,
      message: next.message,
      detail: summarizeDebugValue(next.detail),
    },
  });
  return next;
}

function toSerializableRuntimeIssue(issue) {
  if (!issue) return null;
  return {
    id: issue.id,
    viewType: issue.viewType,
    kind: issue.kind,
    message: issue.message,
    detail: issue.detail,
    createdAt: issue.createdAt,
    lastSeenAt: issue.lastSeenAt,
    count: issue.count,
  };
}

function injectAcquireVsCodeApi(html, { origin, viewType, token }) {
  const src = `${origin}/vscode/api.js?viewType=${encodeURIComponent(viewType)}&token=${encodeURIComponent(token)}`;
  const apiScript = `<script src="${src}"></script>`;

  if (html.includes("<head>")) return html.replace("<head>", `<head>${apiScript}`);
  if (html.includes("<head ")) return html.replace(/<head[^>]*>/, (m) => `${m}${apiScript}`);
  return `${apiScript}\n${html}`;
}

function injectLuminaRuntimeBridge(html) {
  const script = `<script>
(() => {
  const report = async (payload) => {
    try {
      if (typeof window.acquireVsCodeApi !== "function") return;
      const vscode = window.acquireVsCodeApi();
      if (!vscode?.postMessage) return;
      await vscode.postMessage({ type: "__luminaRuntimeIssue", payload });
    } catch {
      // ignore
    }
  };

  window.addEventListener("securitypolicyviolation", (event) => {
    void report({
      kind: "securitypolicyviolation",
      message: "Content Security Policy blocked a Codex webview resource.",
      detail: {
        effectiveDirective: event.effectiveDirective || null,
        violatedDirective: event.violatedDirective || null,
        blockedURI: event.blockedURI || null,
        sourceFile: event.sourceFile || null,
        lineNumber: event.lineNumber || null,
        columnNumber: event.columnNumber || null,
      },
    });
  });

  window.addEventListener("error", (event) => {
    const message = event.message || "Uncaught error in Codex webview";
    void report({
      kind: "error",
      message,
      detail: {
        sourceFile: event.filename || null,
        lineNumber: event.lineno || null,
        columnNumber: event.colno || null,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection in Codex webview";
    void report({
      kind: "unhandledrejection",
      message,
      detail: {
        reason:
          reason instanceof Error
            ? { message: reason.message, stack: reason.stack || null }
            : reason ?? null,
      },
    });
  });
})();
</script>`;

  if (html.includes("<head>")) return html.replace("<head>", `<head>${script}`);
  if (html.includes("<head ")) return html.replace(/<head[^>]*>/, (m) => `${m}${script}`);
  return `${script}\n${html}`;
}

function injectTheme(html, theme) {
  const mode = theme === "dark" ? "dark" : "light";
  const cls = `vscode-${mode}`;
  const other = mode === "dark" ? "vscode-light" : "vscode-dark";
  const script = `<script>
(() => {
  const cls = ${JSON.stringify(cls)};
  const other = ${JSON.stringify(other)};
  const themeKind = cls; // matches VS Code's data-vscode-theme-kind convention
  const apply = () => {
    try {
      document.documentElement.classList.add(cls);
      document.documentElement.classList.remove(other);
      document.documentElement.setAttribute("data-vscode-theme-kind", themeKind);
      document.documentElement.style.colorScheme = ${JSON.stringify(mode)};
      if (document.body) {
        document.body.classList.add(cls);
        document.body.classList.remove(other);
        document.body.setAttribute("data-vscode-theme-kind", themeKind);
      }
    } catch {
      // ignore
    }
  };
  apply();
  window.addEventListener("DOMContentLoaded", apply, { once: true });
})();
</script>`;

  if (html.includes("<head>")) return html.replace("<head>", `<head>${script}`);
  if (html.includes("<head ")) return html.replace(/<head[^>]*>/, (m) => `${m}${script}`);
  return `${script}\n${html}`;
}

function injectBaseLayout(html) {
  const style = `<style data-lumina-webview-base>
html, body {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
body {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
#root, #app {
  flex: 1 1 auto;
  min-height: 0;
}
</style>`;

  if (html.includes("<head>")) return html.replace("<head>", `<head>${style}`);
  if (html.includes("<head ")) return html.replace(/<head[^>]*>/, (m) => `${m}${style}`);
  return `${style}\n${html}`;
}

function ensureDirectiveSources(policy, directiveName, nextSources) {
  const directives = String(policy ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const normalizedDirectiveName = directiveName.toLowerCase();
  let found = false;

  const rewritten = directives.map((directive) => {
    const parts = directive.split(/\s+/).filter(Boolean);
    if ((parts[0] ?? "").toLowerCase() !== normalizedDirectiveName) {
      return directive;
    }
    found = true;
    const merged = new Set(parts.slice(1));
    for (const source of nextSources) merged.add(source);
    return [parts[0], ...merged].join(" ");
  });

  if (!found) {
    rewritten.push([directiveName, ...nextSources].join(" "));
  }

  return rewritten.join("; ");
}

function injectCspFontDataCompatibility(html, origin) {
  return html.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (!/http-equiv\s*=\s*(["'])Content-Security-Policy\1/i.test(tag)) {
      return tag;
    }

    const contentMatch = tag.match(/content\s*=\s*(["'])([\s\S]*?)\1/i);
    if (!contentMatch) {
      return tag;
    }

    const quote = contentMatch[1];
    const content = contentMatch[2];
    let nextPolicy = ensureDirectiveSources(content, "font-src", [origin, "data:"]);
    nextPolicy = ensureDirectiveSources(nextPolicy, "script-src", [origin, "'unsafe-eval'"]);
    nextPolicy = ensureDirectiveSources(nextPolicy, "connect-src", [origin]);
    return tag.replace(contentMatch[0], `content=${quote}${nextPolicy}${quote}`);
  });
}

function createAcquireVsCodeApiJs({ origin, viewType, token }) {
  return `
(() => {
  const VIEW_TYPE = ${JSON.stringify(viewType)};
  const TOKEN = ${JSON.stringify(token)};
  let state = null;
  const post = async (message) => {
    const r = await fetch(${JSON.stringify(`${origin}/vscode/message`)}, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewType: VIEW_TYPE, token: TOKEN, message }),
    });
    return r.ok;
  };
  const poll = async (cursor) => {
    const url = new URL(${JSON.stringify(`${origin}/vscode/poll`)});
    url.searchParams.set("viewType", VIEW_TYPE);
    url.searchParams.set("token", TOKEN);
    url.searchParams.set("cursor", String(cursor));
    const r = await fetch(url);
    if (!r.ok) return { cursor, messages: [] };
    return await r.json();
  };
  const loop = async () => {
    let cursor = 0;
    while (true) {
      try {
        const { cursor: next, messages } = await poll(cursor);
        cursor = next ?? cursor;
        for (const msg of messages ?? []) {
          window.postMessage(msg, window.location.origin);
        }
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  window.acquireVsCodeApi = () => ({
    postMessage: post,
    setState: (s) => { state = s; },
    getState: () => state,
  });
  loop();
})();
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const extensionPath = args.extensionPath ? path.resolve(args.extensionPath) : null;
  const workspacePath = args.workspacePath ? path.resolve(args.workspacePath) : null;
  const port = args.port ? Number(args.port) : 0;
  const quiet = Boolean(args.quiet);

  if (!extensionPath) {
    // eslint-disable-next-line no-console
    console.error("Missing --extensionPath");
    process.exit(2);
  }

  const extensionPackagePath = path.join(extensionPath, "package.json");
  const extensionPackage = JSON.parse(await readFile(extensionPackagePath, "utf8"));
  const extensionMain = extensionPackage.main;
  if (!extensionMain) {
    // eslint-disable-next-line no-console
    console.error("Extension has no 'main' entry in package.json");
    process.exit(2);
  }

  const state = {
    extensionPath,
    extensionPackage,
    activateError: null,
    quiet,
    viewProviders: new Map(), // viewType -> provider
    views: new Map(), // viewType -> { webview, view, queue }
    panels: new Map(), // panelId -> { webview, panel, queue, token }
    nextPanelId: 1,
    commands: new Map(),
    terminals: new Map(),
    nextTerminalId: 1,
    uriHandlers: [],
    config: new Map(),
    workspacePath,
    theme: "dark",
    activeDocument: null, // { path, languageId, content, version }
    runtimeIssues: [],
    nextRuntimeIssueId: 1,
    debugEvents: [],
    nextDebugEventId: 1,
  };

  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (originalFetch) {
    globalThis.fetch = async (...args) => {
      try {
        return await originalFetch(...args);
      } catch (error) {
        recordDebugEvent(state, {
          category: "network",
          level: "error",
          summary: {
            input: summarizeDebugValue(args[0]),
            init: summarizeDebugValue(args[1]),
            error:
              error instanceof Error
                ? {
                    name: error.name,
                    message: error.message,
                    cause: summarizeDebugValue(error.cause),
                  }
                : summarizeDebugValue(error),
          },
        });
        throw error;
      }
    };
  }

  const server = http.createServer(
    withErrorBoundary(async (req, res) => {
      setCors(res);
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        return res.end();
      }
      const u = new URL(req.url ?? "/", "http://127.0.0.1");

      if (u.pathname === "/health") {
        const latestRuntimeIssue = state.runtimeIssues[0] ?? null;
        return json(res, 200, {
          ok: state.activateError == null,
          activateError: state.activateError,
          extension: {
            name: state.extensionPackage.name,
            publisher: state.extensionPackage.publisher,
            version: state.extensionPackage.version,
          },
          viewTypes: [...state.viewProviders.keys()],
          workspaceFolders: state.workspacePath ? [state.workspacePath] : [],
          theme: state.theme,
          activeDocument: state.activeDocument
            ? {
                path: state.activeDocument.path,
                languageId: state.activeDocument.languageId ?? null,
                version: state.activeDocument.version ?? 1,
              }
            : null,
          latestRuntimeIssue: toSerializableRuntimeIssue(latestRuntimeIssue),
          debugEventCount: state.debugEvents.length,
        });
      }

      if (u.pathname === "/debug/registered") {
        return json(res, 200, {
          viewTypes: [...state.viewProviders.keys()],
          panels: [...state.panels.entries()].map(([id, entry]) => ({
            id,
            viewType: entry.panel.viewType,
            title: entry.panel.title,
          })),
        });
      }

      if (u.pathname === "/debug/traffic") {
        return json(res, 200, { events: state.debugEvents.map((event) => toSerializableDebugEvent(event)) });
      }

      if (u.pathname === "/debug/traffic/reset" && req.method === "POST") {
        state.debugEvents = [];
        state.nextDebugEventId = 1;
        return json(res, 200, { ok: true });
      }

      if (u.pathname === "/vscode/api.js" && req.method === "GET") {
        const viewType = u.searchParams.get("viewType") ?? "";
        const token = u.searchParams.get("token") ?? "";
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        return res.end(createAcquireVsCodeApiJs({ origin: `http://127.0.0.1:${server.address().port}`, viewType, token }));
      }

      if (u.pathname === "/debug/postMessageToWebview" && req.method === "POST") {
        const body = await readJson(req);
        const viewType = body.viewType;
        const msg = body.message ?? { type: "debug" };
        const entry = getWebviewEntry(state, viewType);
        if (!entry) return json(res, 404, { ok: false, error: "unknown viewType" });
        await entry.webview.postMessage(msg);
        return json(res, 200, { ok: true });
      }

      if (u.pathname.startsWith("/ext/")) {
        const rel = decodeURIComponent(u.pathname.slice("/ext/".length));
        const abs = path.resolve(state.extensionPath, rel);
        if (!abs.startsWith(state.extensionPath)) {
          res.statusCode = 403;
          return res.end("forbidden");
        }
        const fs = await import("node:fs/promises");
        const data = await fs.readFile(abs);
        res.statusCode = 200;
        // very small mime map
        const ext = path.extname(abs).toLowerCase();
        const mime =
          ext === ".html"
            ? "text/html; charset=utf-8"
            : ext === ".js"
              ? "text/javascript; charset=utf-8"
              : ext === ".css"
                ? "text/css; charset=utf-8"
                : ext === ".svg"
                  ? "image/svg+xml"
                  : ext === ".png"
                    ? "image/png"
                    : "application/octet-stream";
        res.setHeader("Content-Type", mime);
        return res.end(data);
      }

      if (u.pathname === "/lumina/state" && req.method === "POST") {
        const body = await readJson(req);

        if (typeof body?.theme === "string") {
          const theme = body.theme === "light" ? "light" : "dark";
          state._lumina?.setTheme?.(theme);
        }

        if (body?.activeDocument === null) {
          state._lumina?.setActiveDocument?.(null);
        } else if (body?.activeDocument && typeof body.activeDocument === "object") {
          const p = String(body.activeDocument.path ?? "").trim();
          const languageId = body.activeDocument.languageId ? String(body.activeDocument.languageId) : undefined;
          const content = body.activeDocument.content != null ? String(body.activeDocument.content) : "";
          if (p) {
            state._lumina?.setActiveDocument?.({ path: p, languageId, content });
          }
        }

        return json(res, 200, { ok: true });
      }

      if (u.pathname.startsWith("/view/")) {
        const viewType = decodeURIComponent(u.pathname.slice("/view/".length));
        const token = u.searchParams.get("token") ?? "";
        const entry = await ensureView({ state, viewType, token, origin: `http://127.0.0.1:${server.address().port}` });
        if (!entry) {
          res.statusCode = 404;
          return res.end("unknown viewType");
        }

        const theme = u.searchParams.get("theme") || state.theme;
        const raw = entry.webview.html;
        const withCsp = injectCspFontDataCompatibility(raw, `http://127.0.0.1:${server.address().port}`);
        const withApi = injectAcquireVsCodeApi(withCsp, { origin: `http://127.0.0.1:${server.address().port}`, viewType, token });
        const withRuntimeBridge = injectLuminaRuntimeBridge(withApi);
        const withBase = injectBaseLayout(withRuntimeBridge);
        const html = injectTheme(withBase, theme);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.end(html);
      }

      if (u.pathname.startsWith("/panel/")) {
        const panelId = decodeURIComponent(u.pathname.slice("/panel/".length));
        const token = u.searchParams.get("token") ?? "";
        const entry = state.panels.get(panelId);
        if (!entry) {
          res.statusCode = 404;
          return res.end("unknown panel");
        }
        if (entry.token !== token) return json(res, 403, { ok: false, error: "bad token" });

        const channel = `panel:${panelId}`;
        const theme = u.searchParams.get("theme") || state.theme;
        const raw = entry.webview.html;
        const origin = `http://127.0.0.1:${server.address().port}`;
        const withCsp = injectCspFontDataCompatibility(raw, origin);
        const withApi = injectAcquireVsCodeApi(withCsp, { origin, viewType: channel, token });
        const withRuntimeBridge = injectLuminaRuntimeBridge(withApi);
        const withBase = injectBaseLayout(withRuntimeBridge);
        const html = injectTheme(withBase, theme);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.end(html);
      }

      if (u.pathname === "/vscode/message" && req.method === "POST") {
        const body = await readJson(req);
        const viewType = body.viewType;
        const token = body.token ?? "";
        const message = body.message;
        const entry = getWebviewEntry(state, viewType);
        if (!entry) return json(res, 404, { ok: false, error: "unknown viewType" });
        if (entry.token !== token) return json(res, 403, { ok: false, error: "bad token" });
        recordDebugEvent(state, {
          category: "webviewMessage",
          direction: "webview->host",
          viewType,
          summary: summarizeDebugValue(message),
        });
        if (message?.type === "__luminaRuntimeIssue" && message.payload && typeof message.payload === "object") {
          recordRuntimeIssue(state, {
            viewType,
            kind: String(message.payload.kind ?? "runtime"),
            message: String(message.payload.message ?? "Codex webview reported a runtime issue"),
            detail: message.payload.detail ?? null,
          });
          return json(res, 200, { ok: true });
        }
        entry.webview._deliverFromClient(message);
        return json(res, 200, { ok: true });
      }

      if (u.pathname === "/vscode/poll" && req.method === "GET") {
        const viewType = u.searchParams.get("viewType") ?? "";
        const token = u.searchParams.get("token") ?? "";
        const cursor = Number(u.searchParams.get("cursor") ?? "0");
        const entry = getWebviewEntry(state, viewType);
        if (!entry) return json(res, 404, { ok: false, error: "unknown viewType" });
        if (entry.token !== token) return json(res, 403, { ok: false, error: "bad token" });
        const { nextCursor, messages } = entry.queue.drain(cursor);
        recordDebugEvent(state, {
          category: "poll",
          direction: "webview->host",
          viewType,
          summary: {
            cursor,
            nextCursor,
            messageCount: messages.length,
            messageTypes: messages.slice(0, 8).map((message) => message?.type ?? typeof message),
          },
        });
        return json(res, 200, { cursor: nextCursor, messages });
      }

      res.statusCode = 404;
      res.end("not found");
    }),
  );

  server.listen(port, "127.0.0.1", () => {
    const addr = server.address();
    const origin = `http://127.0.0.1:${addr.port}`;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ type: "READY", origin, port: addr.port }));
  });

  const originForApi = () => {
    const addr = server.address();
    return typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "http://127.0.0.1:0";
  };

  const vscode = createVscodeApi(state, originForApi);
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return vscode;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const mainPath = path.join(extensionPath, extensionMain);
    const extModule = require(mainPath);
    if (typeof extModule?.activate !== "function") throw new Error("Extension main has no activate()");
    const ctx = createExtensionContext(state);
    await extModule.activate(ctx);
  } catch (e) {
    state.activateError = e instanceof Error ? e.stack ?? e.message : String(e);
  } finally {
    Module._load = originalLoad;
  }
}

function createQueue() {
  let nextId = 1;
  const items = [];
  return {
    push(msg) {
      items.push({ id: nextId++, msg });
    },
    drain(cursor) {
      const start = Number.isFinite(cursor) ? cursor : 0;
      const slice = items.filter((x) => x.id > start);
      const maxId = slice.length ? slice[slice.length - 1].id : start;
      return { nextCursor: maxId, messages: slice.map((x) => x.msg) };
    },
  };
}

function getWebviewEntry(state, channel) {
  if (state.views.has(channel)) return state.views.get(channel);
  if (typeof channel === "string" && channel.startsWith("panel:")) {
    return state.panels.get(channel.slice("panel:".length)) ?? null;
  }
  return null;
}

function createVscodeApi(state, originForApi) {
  const logger = {
    info: (...args) => !state.quiet && console.log("[vscode]", ...args),
    warn: (...args) => !state.quiet && console.warn("[vscode]", ...args),
    error: (...args) => !state.quiet && console.error("[vscode]", ...args),
  };

  const onDidChangeConfigurationEmitter = new EventEmitter();
  const onDidChangeActiveTextEditorEmitter = new EventEmitter();
  const onDidChangeTextEditorSelectionEmitter = new EventEmitter();
  const onDidChangeVisibleTextEditorsEmitter = new EventEmitter();
  const onDidChangeWindowStateEmitter = new EventEmitter();
  const onDidOpenTerminalEmitter = new EventEmitter();
  const onDidCloseTerminalEmitter = new EventEmitter();
  const onDidChangeActiveTerminalEmitter = new EventEmitter();
  const onDidChangeTerminalShellIntegrationEmitter = new EventEmitter();
  const onDidChangeWorkspaceFoldersEmitter = new EventEmitter();
  const onDidOpenTextDocumentEmitter = new EventEmitter();
  const onDidCloseTextDocumentEmitter = new EventEmitter();
  const onDidSaveTextDocumentEmitter = new EventEmitter();
  const onDidChangeTextDocumentEmitter = new EventEmitter();
  const onDidChangeActiveColorThemeEmitter = new EventEmitter();

  const ColorThemeKind = {
    Light: 1,
    Dark: 2,
    HighContrast: 3,
    HighContrastLight: 4,
  };

  const getActiveColorTheme = () => {
    const kind = state.theme === "light" ? ColorThemeKind.Light : ColorThemeKind.Dark;
    return { kind };
  };

  const makeTextDocument = (doc) => {
    if (!doc?.path) return null;
    const uri = Uri.file(doc.path);
    const languageId = doc.languageId ?? "plaintext";
    const text = String(doc.content ?? "");
    const version = Number.isFinite(doc.version) ? doc.version : 1;
    return {
      uri,
      fileName: uri.fsPath,
      languageId,
      version,
      isDirty: false,
      getText: () => text,
      lineCount: text.split(/\r?\n/).length,
      save: async () => true,
    };
  };

  const getActiveTextDocument = () => makeTextDocument(state.activeDocument);
  const getTextDocuments = () => {
    const doc = getActiveTextDocument();
    return doc ? [doc] : [];
  };

  const getActiveTextEditor = () => {
    const doc = getActiveTextDocument();
    if (!doc) return undefined;
    return {
      document: doc,
      selection: undefined,
      selections: [],
      viewColumn: 1,
    };
  };

  const notifyActiveEditorChanged = () => {
    onDidChangeActiveTextEditorEmitter.fire(getActiveTextEditor());
    onDidChangeVisibleTextEditorsEmitter.fire(getActiveTextEditor() ? [getActiveTextEditor()] : []);
  };

  state._lumina = state._lumina ?? {};
  state._lumina.setTheme = (theme) => {
    const next = theme === "light" ? "light" : "dark";
    if (state.theme === next) return;
    state.theme = next;
    onDidChangeActiveColorThemeEmitter.fire(getActiveColorTheme());
  };
  state._lumina.setActiveDocument = (nextDoc) => {
    const prev = state.activeDocument;
    if (nextDoc == null) {
      state.activeDocument = null;
      notifyActiveEditorChanged();
      return;
    }

    const pathStr = String(nextDoc.path ?? "");
    const languageId = nextDoc.languageId ? String(nextDoc.languageId) : undefined;
    const content = String(nextDoc.content ?? "");

    const version = (prev?.path === pathStr ? (prev.version ?? 1) + 1 : 1) | 0;
    state.activeDocument = { path: pathStr, languageId, content, version };

    const docObj = getActiveTextDocument();
    if (docObj) {
      if (!prev || prev.path !== pathStr) onDidOpenTextDocumentEmitter.fire(docObj);
      onDidChangeTextDocumentEmitter.fire({ document: docObj, contentChanges: [] });
    }
    notifyActiveEditorChanged();
  };

  const workspaceFolderFromPath = (fsPath, index = 0) => {
    const abs = path.resolve(fsPath);
    return {
      uri: Uri.file(abs),
      name: path.basename(abs),
      index,
    };
  };

  const getWorkspaceFolders = () => {
    if (!state.workspacePath) return [];
    return [workspaceFolderFromPath(state.workspacePath, 0)];
  };

  const openTextDocument = async (uriOrPath) => {
    const uri = typeof uriOrPath === "string" ? Uri.file(uriOrPath) : uriOrPath;
    const active = getActiveTextDocument();
    if (active && uri?.fsPath && active.uri.fsPath === uri.fsPath) return active;

    if (uri?.fsPath) {
      const fs = await import("node:fs/promises");
      const buf = await fs.readFile(uri.fsPath, "utf8").catch(() => "");
      return makeTextDocument({ path: uri.fsPath, languageId: "plaintext", content: String(buf), version: 1 });
    }
    return makeTextDocument({ path: String(uriOrPath ?? "untitled"), languageId: "plaintext", content: "", version: 1 });
  };

  const createHostedWebview = ({ viewType, token }) => {
    const asWebviewUri = (uri) => {
      if (uri?.scheme === "file" && uri.fsPath) {
        const rel = path.relative(state.extensionPath, uri.fsPath).replaceAll("\\", "/");
        return Uri.parse(`${originForApi()}/ext/${encodeURIComponent(rel)}`);
      }
      return Uri.parse(`${originForApi()}/ext/`);
    };

    const queue = createQueue();
    const webview = new Webview({
      postMessageSink: (msg) => {
        recordDebugEvent(state, {
          category: "webviewMessage",
          direction: "host->webview",
          viewType,
          summary: summarizeDebugValue(msg),
        });
        queue.push(msg);
      },
      asWebviewUri,
      cspSource: originForApi(),
    });
    return { webview, queue };
  };

  const handleBuiltInCommand = async (command, args) => {
    if (command === "vscode.diff") {
      recordDebugEvent(state, {
        category: "builtinCommand",
        summary: {
          command,
          left: summarizeDebugValue(args[0]),
          right: summarizeDebugValue(args[1]),
          title: summarizeDebugValue(args[2]),
        },
      });
      return undefined;
    }
    return undefined;
  };

  return {
    Uri,
    Disposable,
    EventEmitter,
    Range,
    Position,
    CodeLens,
    env: {
      remoteName: undefined,
      async openExternal(uri) {
        const url = uri?.toString?.() ?? uri;
        logger.info("openExternal", url);
        recordDebugEvent(state, {
          category: "openExternal",
          summary: { url: summarizeDebugValue(url) },
        });
        return openExternalUrl(url);
      },
    },
    ConfigurationTarget: {
      Global: 1,
      Workspace: 2,
      WorkspaceFolder: 3,
    },
    commands: {
      registerCommand(command, callback) {
        state.commands.set(command, callback);
        recordDebugEvent(state, {
          category: "commandRegistration",
          summary: { command },
        });
        return new Disposable(() => state.commands.delete(command));
      },
      async executeCommand(command, ...args) {
        const cb = state.commands.get(command);
        const builtIn = command === "vscode.diff";
        recordDebugEvent(state, {
          category: "command",
          summary: {
            command,
            handled: Boolean(cb) || builtIn,
            args: summarizeDebugValue(args),
          },
        });
        if (!cb && !builtIn) return undefined;
        const result = cb ? await cb(...args) : await handleBuiltInCommand(command, args);
        recordDebugEvent(state, {
          category: "commandResult",
          summary: {
            command,
            result: summarizeDebugValue(result),
          },
        });
        return result;
      },
    },
    extensions: {
      getExtension(id) {
        const selfId = `${state.extensionPackage.publisher}.${state.extensionPackage.name}`;
        if (id !== selfId) return undefined;
        return {
          id: selfId,
          extensionPath: state.extensionPath,
          extensionUri: Uri.file(state.extensionPath),
          packageJSON: state.extensionPackage,
        };
      },
    },
    workspace: {
      onDidChangeWorkspaceFolders: onDidChangeWorkspaceFoldersEmitter.event,
      onDidOpenTextDocument: onDidOpenTextDocumentEmitter.event,
      onDidCloseTextDocument: onDidCloseTextDocumentEmitter.event,
      onDidSaveTextDocument: onDidSaveTextDocumentEmitter.event,
      onDidChangeTextDocument: onDidChangeTextDocumentEmitter.event,
      getConfiguration(section) {
        const prefix = section ? `${section}.` : "";
        return {
          get: (key, defaultValue) => {
            const full = `${prefix}${key}`;
            return state.config.has(full) ? state.config.get(full) : defaultValue;
          },
          update: async (key, value) => {
            const full = `${prefix}${key}`;
            state.config.set(full, value);
            onDidChangeConfigurationEmitter.fire({
              affectsConfiguration: (s) => s === full || s === section,
            });
          },
        };
      },
      onDidChangeConfiguration: onDidChangeConfigurationEmitter.event,
      get workspaceFolders() {
        return getWorkspaceFolders();
      },
      getWorkspaceFolder(uri) {
        const folders = getWorkspaceFolders();
        if (!folders.length) return undefined;
        if (!uri) return undefined;
        const u = uri.fsPath ? path.resolve(uri.fsPath) : null;
        if (!u) return undefined;
        const root = folders[0].uri.fsPath;
        if (!root) return undefined;
        const a = root.toLowerCase();
        const b = u.toLowerCase();
        if (b === a || b.startsWith(a + path.sep)) return folders[0];
        return undefined;
      },
      updateWorkspaceFolders(start, deleteCount, ...folders) {
        const before = getWorkspaceFolders();
        const removed = before.splice(start, deleteCount ?? 0);
        const added = folders
          .filter(Boolean)
          .map((f, i) => workspaceFolderFromPath(f.uri?.fsPath ?? f.uri?.path ?? String(f.uri), start + i));

        // This host only supports a single-folder workspace today.
        const next = [...before.slice(0, start), ...added];
        state.workspacePath = next[0]?.uri?.fsPath ?? null;

        onDidChangeWorkspaceFoldersEmitter.fire({ added, removed });
        return true;
      },
      get textDocuments() {
        return getTextDocuments();
      },
      openTextDocument,
      asRelativePath(p) {
        const root = state.workspacePath ? path.resolve(state.workspacePath) : null;
        const input = typeof p === "string" ? p : p?.fsPath ?? p?.path ?? "";
        if (!root || !input) return input;
        const abs = path.resolve(input);
        const rel = path.relative(root, abs).replaceAll("\\", "/");
        return rel.startsWith("..") ? input : rel;
      },
      fs: {
        async readFile(uri) {
          const fs = await import("node:fs/promises");
          return fs.readFile(uri.fsPath);
        },
        async writeFile(uri, content) {
          const fs = await import("node:fs/promises");
          await fs.writeFile(uri.fsPath, content);
        },
      },
    },
    languages: {
      DiagnosticCollection: class {},
      getDiagnostics(uri) {
        if (uri) return [];
        return [];
      },
      registerCodeLensProvider() {
        return new Disposable(() => {});
      },
    },
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    },
    chat: {
      registerChatSessionItemProvider() {
        throw new Error("chat API not supported in lumina host (yet)");
      },
    },
    window: {
      onDidChangeActiveColorTheme: onDidChangeActiveColorThemeEmitter.event,
      onDidChangeActiveTextEditor: onDidChangeActiveTextEditorEmitter.event,
      onDidChangeTextEditorSelection: onDidChangeTextEditorSelectionEmitter.event,
      onDidChangeVisibleTextEditors: onDidChangeVisibleTextEditorsEmitter.event,
      onDidChangeWindowState: onDidChangeWindowStateEmitter.event,
      onDidOpenTerminal: onDidOpenTerminalEmitter.event,
      onDidCloseTerminal: onDidCloseTerminalEmitter.event,
      onDidChangeActiveTerminal: onDidChangeActiveTerminalEmitter.event,
      onDidChangeTerminalShellIntegration: onDidChangeTerminalShellIntegrationEmitter.event,
      tabGroups: { all: [] },
      get activeColorTheme() {
        return getActiveColorTheme();
      },
      get activeTextEditor() {
        return getActiveTextEditor();
      },
      get visibleTextEditors() {
        const e = getActiveTextEditor();
        return e ? [e] : [];
      },
      get activeTerminal() {
        return state.activeTerminal;
      },
      get terminals() {
        return [...state.terminals.values()];
      },
      registerWebviewViewProvider(viewType, provider) {
        state.viewProviders.set(viewType, provider);
        recordDebugEvent(state, {
          category: "viewProviderRegistration",
          summary: { viewType },
        });
        return new Disposable(() => state.viewProviders.delete(viewType));
      },
      createWebviewPanel(viewType, title, showOptions, options = {}) {
        const id = String(state.nextPanelId++);
        const token = `panel-${id}`;
        const channel = `panel:${id}`;
        const { webview, queue } = createHostedWebview({ viewType: channel, token });
        webview.options = options;
        const viewColumn =
          typeof showOptions === "number"
            ? showOptions
            : typeof showOptions?.viewColumn === "number"
              ? showOptions.viewColumn
              : 1;
        const panel = new WebviewPanel(viewType, title, webview, viewColumn);
        const entry = { webview, panel, queue, token };
        state.panels.set(id, entry);
        panel.onDidDispose(() => {
          state.panels.delete(id);
        });
        recordDebugEvent(state, {
          category: "webviewPanel",
          summary: {
            event: "create",
            id,
            viewType,
            title,
            url: `${originForApi()}/panel/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
          },
        });
        return panel;
      },
      createOutputChannel(name) {
        return new OutputChannel(name);
      },
      createTerminal(nameOrOptions, shellPath, shellArgs) {
        const id = String(state.nextTerminalId++);
        const name =
          typeof nameOrOptions === "string"
            ? nameOrOptions
            : nameOrOptions?.name || `Terminal ${id}`;
        const terminal = {
          name,
          processId: Promise.resolve(0),
          creationOptions: typeof nameOrOptions === "object" ? nameOrOptions : { shellPath, shellArgs },
          exitStatus: undefined,
          sendText(text, addNewLine = true) {
            recordDebugEvent(state, {
              category: "terminal",
              summary: {
                event: "sendText",
                id,
                name,
                text: truncateDebugString(text, 240),
                addNewLine,
              },
            });
          },
          show() {
            state.activeTerminal = terminal;
            onDidChangeActiveTerminalEmitter.fire(terminal);
            recordDebugEvent(state, {
              category: "terminal",
              summary: { event: "show", id, name },
            });
          },
          hide() {
            recordDebugEvent(state, {
              category: "terminal",
              summary: { event: "hide", id, name },
            });
          },
          dispose() {
            state.terminals.delete(id);
            onDidCloseTerminalEmitter.fire(terminal);
            if (state.activeTerminal === terminal) {
              state.activeTerminal = undefined;
              onDidChangeActiveTerminalEmitter.fire(undefined);
            }
            recordDebugEvent(state, {
              category: "terminal",
              summary: { event: "dispose", id, name },
            });
          },
        };
        state.terminals.set(id, terminal);
        onDidOpenTerminalEmitter.fire(terminal);
        recordDebugEvent(state, {
          category: "terminal",
          summary: { event: "create", id, name },
        });
        return terminal;
      },
      registerCustomEditorProvider() {
        return new Disposable(() => {});
      },
      registerUriHandler(handler) {
        state.uriHandlers.push(handler);
        return new Disposable(() => {
          const idx = state.uriHandlers.indexOf(handler);
          if (idx >= 0) state.uriHandlers.splice(idx, 1);
        });
      },
      setStatusBarMessage() {
        return new Disposable(() => {});
      },
      async showTextDocument(documentOrUri, columnOrOptions) {
        const document =
          documentOrUri?.getText && documentOrUri?.uri
            ? documentOrUri
            : await openTextDocument(documentOrUri);
        const editor = {
          document,
          selection: undefined,
          selections: [],
          viewColumn:
            typeof columnOrOptions === "number"
              ? columnOrOptions
              : typeof columnOrOptions?.viewColumn === "number"
                ? columnOrOptions.viewColumn
                : 1,
          revealRange() {},
          edit: async () => false,
        };
        recordDebugEvent(state, {
          category: "editor",
          summary: {
            event: "showTextDocument",
            fileName: document?.fileName ?? document?.uri?.toString?.() ?? null,
          },
        });
        return editor;
      },
      showInformationMessage(message) {
        logger.info("info", message);
        recordDebugEvent(state, {
          category: "notification",
          level: "info",
          summary: { message: summarizeDebugValue(message) },
        });
      },
      showWarningMessage(message) {
        logger.warn("warn", message);
        recordDebugEvent(state, {
          category: "notification",
          level: "warning",
          summary: { message: summarizeDebugValue(message) },
        });
      },
      showErrorMessage(message) {
        logger.error("error", message);
        recordDebugEvent(state, {
          category: "notification",
          level: "error",
          summary: { message: summarizeDebugValue(message) },
        });
      },
    },
    ColorThemeKind,
    ViewColumn: {
      Active: -1,
      One: 1,
      Two: 2,
      Three: 3,
    },
    version: "lumina-vscode-host-0.0.1",
    // Minimal shape: extensions may check for proposed APIs via namespaces existing.
    _lumina: {
      originForApi,
    },
  };
}

function createExtensionContext(state) {
  const extensionUri = Uri.file(state.extensionPath);
  return {
    subscriptions: [],
    extensionUri,
    extensionPath: state.extensionPath,
    globalState: new Memento(),
    workspaceState: new Memento(),
    secrets: new SecretStorage(),
    extension: {
      packageJSON: state.extensionPackage,
    },
    asAbsolutePath: (relPath) => path.join(state.extensionPath, relPath),
  };
}

async function ensureView({ state, viewType, token, origin }) {
  if (state.views.has(viewType)) {
    const existing = state.views.get(viewType);
    existing.token = token;
    recordDebugEvent(state, {
      category: "viewLifecycle",
      summary: { viewType, event: "reuse" },
    });
    return existing;
  }

  const provider = state.viewProviders.get(viewType);
  if (!provider) return null;

  const asWebviewUri = (uri) => {
    if (uri?.scheme === "file" && uri.fsPath) {
      const rel = path.relative(state.extensionPath, uri.fsPath).replaceAll("\\", "/");
      return Uri.parse(`${origin}/ext/${encodeURIComponent(rel)}`);
    }
    return Uri.parse(`${origin}/ext/`);
  };

  const queue = createQueue();
  const webview = new Webview({
    postMessageSink: (msg) => {
      recordDebugEvent(state, {
        category: "webviewMessage",
        direction: "host->webview",
        viewType,
        summary: summarizeDebugValue(msg),
      });
      queue.push(msg);
    },
    asWebviewUri,
    cspSource: origin,
  });

  const view = new WebviewView(webview);
  const cancellationToken = { isCancellationRequested: false };
  recordDebugEvent(state, {
    category: "viewLifecycle",
    summary: { viewType, event: "resolve:start" },
  });

  await provider.resolveWebviewView?.(view, {}, cancellationToken);
  recordDebugEvent(state, {
    category: "viewLifecycle",
    summary: { viewType, event: "resolve:done", htmlLength: view.webview.html.length },
  });

  const entry = { webview, view, queue, token };
  state.views.set(viewType, entry);
  return entry;
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
