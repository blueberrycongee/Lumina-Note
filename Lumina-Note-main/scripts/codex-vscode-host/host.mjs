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

function injectAcquireVsCodeApi(html, { origin, viewType, token }) {
  const src = `${origin}/vscode/api.js?viewType=${encodeURIComponent(viewType)}&token=${encodeURIComponent(token)}`;
  const apiScript = `<script src="${src}"></script>`;

  if (html.includes("<head>")) return html.replace("<head>", `<head>${apiScript}`);
  if (html.includes("<head ")) return html.replace(/<head[^>]*>/, (m) => `${m}${apiScript}`);
  return `${apiScript}\n${html}`;
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
          window.dispatchEvent(new MessageEvent("message", { data: msg }));
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
    commands: new Map(),
    uriHandlers: [],
    config: new Map(),
    workspacePath,
    theme: "dark",
    activeDocument: null, // { path, languageId, content, version }
  };

  const server = http.createServer(
    withErrorBoundary(async (req, res) => {
      setCors(res);
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        return res.end();
      }
      const u = new URL(req.url ?? "/", "http://127.0.0.1");

      if (u.pathname === "/health") {
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
        });
      }

      if (u.pathname === "/debug/registered") {
        return json(res, 200, { viewTypes: [...state.viewProviders.keys()] });
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
        const entry = state.views.get(viewType);
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
        const withApi = injectAcquireVsCodeApi(raw, { origin: `http://127.0.0.1:${server.address().port}`, viewType, token });
        const withBase = injectBaseLayout(withApi);
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
        const entry = state.views.get(viewType);
        if (!entry) return json(res, 404, { ok: false, error: "unknown viewType" });
        if (entry.token !== token) return json(res, 403, { ok: false, error: "bad token" });
        entry.webview._deliverFromClient(message);
        return json(res, 200, { ok: true });
      }

      if (u.pathname === "/vscode/poll" && req.method === "GET") {
        const viewType = u.searchParams.get("viewType") ?? "";
        const token = u.searchParams.get("token") ?? "";
        const cursor = Number(u.searchParams.get("cursor") ?? "0");
        const entry = state.views.get(viewType);
        if (!entry) return json(res, 404, { ok: false, error: "unknown viewType" });
        if (entry.token !== token) return json(res, 403, { ok: false, error: "bad token" });
        const { nextCursor, messages } = entry.queue.drain(cursor);
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
        return new Disposable(() => state.commands.delete(command));
      },
      async executeCommand(command, ...args) {
        const cb = state.commands.get(command);
        if (!cb) return undefined;
        return await cb(...args);
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
      async openTextDocument(uriOrPath) {
        const uri = typeof uriOrPath === "string" ? Uri.file(uriOrPath) : uriOrPath;
        const active = getActiveTextDocument();
        if (active && uri?.fsPath && active.uri.fsPath === uri.fsPath) return active;

        if (uri?.fsPath) {
          const fs = await import("node:fs/promises");
          const buf = await fs.readFile(uri.fsPath, "utf8").catch(() => "");
          return makeTextDocument({ path: uri.fsPath, languageId: "plaintext", content: String(buf), version: 1 });
        }
        return makeTextDocument({ path: String(uriOrPath ?? "untitled"), languageId: "plaintext", content: "", version: 1 });
      },
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
      registerWebviewViewProvider(viewType, provider) {
        state.viewProviders.set(viewType, provider);
        return new Disposable(() => state.viewProviders.delete(viewType));
      },
      createOutputChannel(name) {
        return new OutputChannel(name);
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
      showInformationMessage(message) {
        logger.info("info", message);
      },
      showWarningMessage(message) {
        logger.warn("warn", message);
      },
      showErrorMessage(message) {
        logger.error("error", message);
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
    postMessageSink: (msg) => queue.push(msg),
    asWebviewUri,
    cspSource: origin,
  });

  const view = new WebviewView(webview);
  const cancellationToken = { isCancellationRequested: false };

  await provider.resolveWebviewView?.(view, {}, cancellationToken);

  const entry = { webview, view, queue, token };
  state.views.set(viewType, entry);
  return entry;
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
