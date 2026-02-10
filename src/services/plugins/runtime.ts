import { isAbsolute, join, normalize } from "@/lib/path";
import {
  deleteFile,
  listDirectory,
  moveFile,
  readFile,
  readPluginEntry,
  renameFile,
  saveFile,
} from "@/lib/tauri";
import { useCommandStore } from "@/stores/useCommandStore";
import { useFileStore } from "@/stores/useFileStore";
import { usePluginUiStore } from "@/stores/usePluginUiStore";
import type { PluginInfo, PluginPermission, PluginRuntimeStatus } from "@/types/plugins";

type PluginHostEvent = "app:ready" | "workspace:changed" | "active-file:changed";

type SlashCommandInput = {
  key: string;
  description: string;
  prompt: string;
};
type PluginCommandInput = {
  id: string;
  title: string;
  description?: string;
  hotkey?: string;
  run: () => void;
};

type PluginSetupResult =
  | void
  | (() => void)
  | Promise<void | (() => void)>
  | { dispose?: () => void };

type PluginEventHandler = (payload: Record<string, unknown>) => void;
type PluginTabRenderer = (payload: Record<string, unknown>) => string;
type PluginCommandRecord = {
  pluginId: string;
  id: string;
  title: string;
  description?: string;
  hotkey?: string;
  normalizedHotkey?: string;
  run: () => void;
};

type LoadedPlugin = {
  info: PluginInfo;
  signature: string;
  dispose?: () => void;
  unsubscribers: Array<() => void>;
};

type SyncInput = {
  plugins: PluginInfo[];
  workspacePath?: string;
  enabledById: Record<string, boolean>;
};

const HOST_API_VERSION = "1";
const HOST_APP_VERSION = __LUMINA_APP_VERSION__;

interface LuminaPluginApi {
  meta: {
    id: string;
    name: string;
    version: string;
    source: string;
    permissions: string[];
  };
  logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
  ui: {
    notify: (message: string) => void;
    injectStyle: (css: string, scopeId?: string) => () => void;
    setThemeVariables: (variables: Record<string, string>) => () => void;
  };
  commands: {
    registerSlashCommand: (input: SlashCommandInput) => () => void;
    registerCommand: (input: PluginCommandInput) => () => void;
  };
  vault: {
    getPath: () => string | null;
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
    deleteFile: (path: string) => Promise<void>;
    renameFile: (oldPath: string, newPath: string) => Promise<void>;
    moveFile: (sourcePath: string, targetFolder: string) => Promise<string>;
    listFiles: () => Promise<string[]>;
  };
  metadata: {
    getFileMetadata: (path: string) => Promise<{
      frontmatter: Record<string, unknown> | null;
      links: string[];
      tags: string[];
    }>;
  };
  workspace: {
    getPath: () => string | null;
    getActiveFile: () => string | null;
    openFile: (path: string) => Promise<void>;
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
    registerPanel: (input: { id: string; title: string; html: string }) => () => void;
    registerTabType: (input: {
      type: string;
      title: string;
      render: (payload: Record<string, unknown>) => string;
    }) => () => void;
    openRegisteredTab: (type: string, payload?: Record<string, unknown>) => void;
  };
  editor: {
    getActiveFile: () => string | null;
    getActiveContent: () => string | null;
    setActiveContent: (next: string) => void;
    replaceRange: (start: number, end: number, next: string) => void;
    registerDecoration: (className: string, css: string) => () => void;
  };
  storage: {
    get: (key: string) => string | null;
    set: (key: string, value: string) => void;
    remove: (key: string) => void;
  };
  events: {
    on: (event: PluginHostEvent, handler: PluginEventHandler) => () => void;
  };
  network: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
  runtime: {
    setInterval: (handler: () => void, ms: number) => number;
    clearInterval: (id: number) => void;
    setTimeout: (handler: () => void, ms: number) => number;
    clearTimeout: (id: number) => void;
  };
  interop: {
    openExternal: (url: string) => void;
  };
}

const hasPermission = (permissions: Set<string>, required: string) => {
  if (permissions.has("*") || permissions.has(required)) {
    return true;
  }
  const [namespace] = required.split(":");
  return permissions.has(`${namespace}:*`);
};

const normalizePermissionSet = (rawPermissions: string[]) => {
  const next = new Set<string>(rawPermissions);
  if (next.has("workspace:read")) next.add("vault:read");
  if (next.has("workspace:write")) next.add("vault:write");
  if (next.has("network:fetch")) next.add("network:*");
  if (next.has("storage:read")) next.add("storage:*");
  if (next.has("storage:write")) next.add("storage:*");
  if (next.has("events:subscribe")) next.add("events:*");
  if (next.has("commands:register")) next.add("commands:*");
  return next;
};

const parseVersion = (value: string) => {
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
};

const versionLt = (left: string, right: string) => {
  const l = parseVersion(left);
  const r = parseVersion(right);
  if (!l || !r) return false;
  for (let i = 0; i < 3; i += 1) {
    if (l[i] < r[i]) return true;
    if (l[i] > r[i]) return false;
  }
  return false;
};

const getCompatibilityIssue = (plugin: PluginInfo): string | null => {
  if (plugin.api_version && plugin.api_version !== HOST_API_VERSION) {
    return `Unsupported api_version=${plugin.api_version}. Host supports ${HOST_API_VERSION}.`;
  }
  if (plugin.min_app_version && versionLt(HOST_APP_VERSION, plugin.min_app_version)) {
    return `Requires app >= ${plugin.min_app_version}, current is ${HOST_APP_VERSION}.`;
  }
  return null;
};

const parseStructuredManifestError = (message: string) => {
  const prefix = "PLUGIN_MANIFEST_VALIDATION_JSON:";
  if (!message.startsWith(prefix)) return null;
  const payload = message.slice(prefix.length);
  try {
    const parsed = JSON.parse(payload) as {
      code?: string;
      field?: string;
      message?: string;
    };
    if (!parsed || typeof parsed !== "object") return null;
    return {
      code: parsed.code || "manifest_validation_error",
      field: parsed.field,
      message: parsed.message || "Invalid plugin manifest",
    };
  } catch {
    return null;
  }
};

const withOnce = (fn: () => void) => {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    fn();
  };
};

const parseFrontmatter = (content: string): Record<string, unknown> | null => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return null;
  const lines = match[1].split("\n");
  const result: Record<string, unknown> = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
};

const parseLinksAndTags = (content: string) => {
  const links = Array.from(content.matchAll(/\[\[([^\]]+)\]\]/g)).map((m) => m[1].trim());
  const tags = Array.from(content.matchAll(/(^|\s)#([^\s#]+)/g)).map((m) => m[2].trim());
  return {
    links: Array.from(new Set(links.filter(Boolean))),
    tags: Array.from(new Set(tags.filter(Boolean))),
  };
};

const normalizeHotkeyToken = (value: string) => value.trim().toLowerCase();

const matchHotkey = (event: KeyboardEvent, pattern: string) => {
  const tokens = pattern
    .split("+")
    .map(normalizeHotkeyToken)
    .filter(Boolean);
  if (tokens.length === 0) return false;
  const wantMeta = tokens.includes("mod")
    ? /mac|iphone|ipad|ipod/i.test(navigator.platform)
      ? event.metaKey
      : event.ctrlKey
    : tokens.includes("meta")
      ? event.metaKey
      : tokens.includes("ctrl")
        ? event.ctrlKey
        : false;
  const wantShift = tokens.includes("shift");
  const wantAlt = tokens.includes("alt") || tokens.includes("option");
  if (Boolean(event.shiftKey) !== wantShift) return false;
  if (Boolean(event.altKey) !== wantAlt) return false;
  const expectMod = tokens.includes("mod") || tokens.includes("meta") || tokens.includes("ctrl");
  if (expectMod && !wantMeta) return false;
  if (!expectMod && (event.metaKey || event.ctrlKey)) return false;
  const keyToken = tokens.find(
    (token) => !["mod", "meta", "ctrl", "shift", "alt", "option"].includes(token),
  );
  if (!keyToken) return false;
  return event.key.toLowerCase() === keyToken;
};

const normalizeHotkeyPattern = (pattern: string) => {
  const tokens = pattern
    .split("+")
    .map(normalizeHotkeyToken)
    .filter(Boolean);
  if (tokens.length === 0) return "";
  const modifiers: string[] = [];
  if (tokens.includes("mod")) modifiers.push("mod");
  else if (tokens.includes("meta")) modifiers.push("meta");
  else if (tokens.includes("ctrl")) modifiers.push("ctrl");
  if (tokens.includes("shift")) modifiers.push("shift");
  if (tokens.includes("alt") || tokens.includes("option")) modifiers.push("alt");
  const key = tokens.find(
    (token) => !["mod", "meta", "ctrl", "shift", "alt", "option"].includes(token),
  );
  if (!key) return "";
  return [...modifiers, key].join("+");
};

class PluginRuntime {
  private loaded = new Map<string, LoadedPlugin>();
  private listeners = new Map<PluginHostEvent, Map<string, Set<PluginEventHandler>>>();
  private pluginTabTypes = new Map<string, { pluginId: string; title: string; render: PluginTabRenderer }>();
  private pluginCommands = new Map<string, PluginCommandRecord>();

  async sync(input: SyncInput): Promise<Record<string, PluginRuntimeStatus>> {
    const statuses: Record<string, PluginRuntimeStatus> = {};
    const pluginsById = new Map(input.plugins.map((plugin) => [plugin.id, plugin]));

    for (const [pluginId, loaded] of this.loaded) {
      const nextInfo = pluginsById.get(pluginId);
      const enabled = this.isEnabled(nextInfo, input.enabledById);
      if (!nextInfo || !enabled) {
        this.unload(pluginId, loaded);
      }
    }

    for (const plugin of input.plugins) {
      const enabled = this.isEnabled(plugin, input.enabledById);
      if (!enabled) {
        statuses[plugin.id] = { enabled: false, loaded: false };
        continue;
      }

      if (plugin.validation_error) {
        const reason = `[${plugin.validation_error.code}] ${plugin.validation_error.message}`;
        statuses[plugin.id] = {
          enabled: true,
          loaded: false,
          incompatible: true,
          reason,
          error: reason,
        };
        this.removePluginCommands(plugin.id);
        this.removePluginListeners(plugin.id);
        continue;
      }

      const compatibilityIssue = getCompatibilityIssue(plugin);
      if (compatibilityIssue) {
        statuses[plugin.id] = {
          enabled: true,
          loaded: false,
          incompatible: true,
          reason: compatibilityIssue,
          error: compatibilityIssue,
        };
        this.removePluginCommands(plugin.id);
        this.removePluginListeners(plugin.id);
        continue;
      }

      const signature = this.signatureOf(plugin);
      const existing = this.loaded.get(plugin.id);
      if (existing && existing.signature === signature) {
        statuses[plugin.id] = { enabled: true, loaded: true };
        continue;
      }

      if (existing) {
        this.unload(plugin.id, existing);
      }

      try {
        const entry = await readPluginEntry(plugin.id, input.workspacePath);
        const permissions = normalizePermissionSet(entry.info.permissions || []);
        const unsubscribers: Array<() => void> = [];
        const api = this.createApi(entry.info, permissions, input.workspacePath, unsubscribers);
        const dispose = await this.runPlugin(entry.info, entry.code, api);
        this.loaded.set(plugin.id, {
          info: entry.info,
          signature,
          dispose,
          unsubscribers,
        });
        statuses[plugin.id] = { enabled: true, loaded: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const structured = parseStructuredManifestError(message);
        statuses[plugin.id] = structured
          ? {
              enabled: true,
              loaded: false,
              incompatible: true,
              reason: `[${structured.code}] ${structured.message}`,
              error: `[${structured.code}] ${structured.message}`,
              error_detail: structured,
            }
          : { enabled: true, loaded: false, error: message };
        this.removePluginCommands(plugin.id);
        this.removePluginListeners(plugin.id);
      }
    }

    return statuses;
  }

  emit(event: PluginHostEvent, payload: Record<string, unknown>) {
    const perPlugin = this.listeners.get(event);
    if (!perPlugin) return;
    for (const [pluginId, handlers] of perPlugin.entries()) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[PluginRuntime:${pluginId}] event handler failed`, err);
        }
      }
    }
  }

  unloadAll() {
    for (const [pluginId, loaded] of this.loaded) {
      this.unload(pluginId, loaded);
    }
    this.loaded.clear();
  }

  getRegisteredCommands() {
    return Array.from(this.pluginCommands.values()).map((item) => ({
      id: item.id,
      pluginId: item.pluginId,
      title: item.title,
      description: item.description,
      hotkey: item.hotkey,
    }));
  }

  executeCommand(commandId: string): boolean {
    const command = this.pluginCommands.get(commandId);
    if (!command) return false;
    try {
      command.run();
      return true;
    } catch (err) {
      console.error(`[PluginRuntime:${command.pluginId}] command failed`, err);
      return false;
    }
  }

  handleHotkey(event: KeyboardEvent): boolean {
    for (const command of this.pluginCommands.values()) {
      if (!command.normalizedHotkey) continue;
      if (matchHotkey(event, command.normalizedHotkey)) {
        event.preventDefault();
        return this.executeCommand(command.id);
      }
    }
    return false;
  }

  private async runPlugin(
    info: PluginInfo,
    code: string,
    api: LuminaPluginApi
  ): Promise<(() => void) | undefined> {
    const execute = new Function(
      "api",
      "plugin",
      `
const module = { exports: {} };
const exports = module.exports;
${code}
const exported = module.exports && module.exports.default ? module.exports.default : module.exports;
if (typeof exported !== "function") {
  throw new Error("Plugin entry must export a setup function: module.exports = function(api) { ... }");
}
return exported(api, plugin);
`
    ) as (api: LuminaPluginApi, plugin: PluginInfo) => PluginSetupResult;

    const result = await Promise.resolve(execute(api, info));
    if (typeof result === "function") {
      return result;
    }
    if (result && typeof result === "object" && typeof result.dispose === "function") {
      return result.dispose;
    }
    return undefined;
  }

  private createApi(
    info: PluginInfo,
    permissions: Set<string>,
    workspacePath?: string,
    unsubscribers: Array<() => void> = []
  ): LuminaPluginApi {
    const requirePermission = (permission: PluginPermission) => {
      if (!hasPermission(permissions, permission)) {
        throw new Error(`Plugin ${info.id} missing permission: ${permission}`);
      }
    };

    const resolveWorkspacePath = (path: string) => {
      if (!workspacePath) {
        throw new Error("No workspace is currently open");
      }
      const normalizedWorkspace = normalize(workspacePath.replace(/\\/g, "/"));
      const workspacePrefix = normalizedWorkspace.endsWith("/")
        ? normalizedWorkspace
        : `${normalizedWorkspace}/`;
      const candidate = isAbsolute(path)
        ? normalize(path.replace(/\\/g, "/"))
        : normalize(join(normalizedWorkspace, path));
      if (candidate !== normalizedWorkspace && !candidate.startsWith(workspacePrefix)) {
        throw new Error(`Path is outside workspace: ${path}`);
      }
      return candidate;
    };

    const registerListener = (event: PluginHostEvent, handler: PluginEventHandler) => {
      let eventMap = this.listeners.get(event);
      if (!eventMap) {
        eventMap = new Map();
        this.listeners.set(event, eventMap);
      }
      let handlers = eventMap.get(info.id);
      if (!handlers) {
        handlers = new Set();
        eventMap.set(info.id, handlers);
      }
      handlers.add(handler);

      const unsubscribe = withOnce(() => {
        handlers?.delete(handler);
        if (handlers && handlers.size === 0) {
          eventMap?.delete(info.id);
        }
      });
      unsubscribers.push(unsubscribe);
      return unsubscribe;
    };

    const registerSlashCommand = (input: SlashCommandInput) => {
      requirePermission("commands:register");
      const key = input.key.trim().replace(/^\//, "");
      if (!key) {
        throw new Error("Slash command key cannot be empty");
      }

      const id = `plugin:${info.id}:${key}`;
      useCommandStore.setState((state) => {
        const conflict = state.commands.find(
          (cmd) => cmd.key === key && cmd.id !== id && !cmd.id.startsWith("plugin:")
        );
        if (conflict) {
          throw new Error(`Slash command key already exists: /${key}`);
        }

        const commands = state.commands.filter((cmd) => cmd.id !== id);
        commands.push({
          id,
          key,
          description: input.description,
          prompt: input.prompt,
          isDefault: false,
        });
        return { ...state, commands };
      });

      const unregister = withOnce(() => {
        useCommandStore.setState((state) => ({
          ...state,
          commands: state.commands.filter((cmd) => cmd.id !== id),
        }));
      });
      unsubscribers.push(unregister);
      return unregister;
    };

    const registerCommand = (input: PluginCommandInput) => {
      requirePermission("commands:register");
      const rawId = input.id.trim();
      if (!rawId) {
        throw new Error("Command id cannot be empty");
      }
      const id = `plugin-command:${info.id}:${rawId}`;
      const normalizedHotkey = input.hotkey ? normalizeHotkeyPattern(input.hotkey) : "";
      if (input.hotkey && !normalizedHotkey) {
        throw new Error(`Invalid hotkey pattern: ${input.hotkey}`);
      }
      if (normalizedHotkey) {
        const conflict = Array.from(this.pluginCommands.values()).find(
          (cmd) =>
            cmd.normalizedHotkey && cmd.normalizedHotkey === normalizedHotkey && cmd.id !== id,
        );
        if (conflict) {
          throw new Error(`Hotkey conflict: ${input.hotkey} (matches ${conflict.hotkey})`);
        }
      }
      this.pluginCommands.set(id, {
        pluginId: info.id,
        id,
        title: input.title || rawId,
        description: input.description,
        hotkey: input.hotkey,
        normalizedHotkey: normalizedHotkey || undefined,
        run: input.run,
      });
      window.dispatchEvent(new CustomEvent("lumina-plugin-commands-updated"));
      const cleanup = withOnce(() => {
        this.pluginCommands.delete(id);
        window.dispatchEvent(new CustomEvent("lumina-plugin-commands-updated"));
      });
      unsubscribers.push(cleanup);
      return cleanup;
    };

    const resolvePluginPath = (path: string) => resolveWorkspacePath(path);

    const registerPanel = (panel: { id: string; title: string; html: string }) => {
      requirePermission("workspace:*");
      const panelId = panel.id.trim();
      if (!panelId) {
        throw new Error("Panel id cannot be empty");
      }
      usePluginUiStore.getState().registerPanel({
        pluginId: info.id,
        panelId,
        title: panel.title || panelId,
        html: panel.html || "",
      });
      const cleanup = withOnce(() => {
        usePluginUiStore.getState().unregisterPanel(info.id, panelId);
      });
      unsubscribers.push(cleanup);
      return cleanup;
    };

    const registerTabType = (input: {
      type: string;
      title: string;
      render: (payload: Record<string, unknown>) => string;
    }) => {
      requirePermission("workspace:*");
      const type = input.type.trim();
      if (!type) {
        throw new Error("Tab type cannot be empty");
      }
      const scopedType = `${info.id}:${type}`;
      this.pluginTabTypes.set(scopedType, {
        pluginId: info.id,
        title: input.title || type,
        render: input.render,
      });
      const cleanup = withOnce(() => {
        this.pluginTabTypes.delete(scopedType);
      });
      unsubscribers.push(cleanup);
      return cleanup;
    };

    const openRegisteredTab = (type: string, payload: Record<string, unknown> = {}) => {
      requirePermission("workspace:*");
      const scopedType = `${info.id}:${type.trim()}`;
      const def = this.pluginTabTypes.get(scopedType);
      if (!def) {
        throw new Error(`Tab type not found: ${type}`);
      }
      const html = def.render(payload);
      useFileStore.getState().openPluginViewTab(scopedType, def.title, html);
    };

    const storageKey = (key: string) => `lumina-plugin:${info.id}:${key}`;

    return {
      meta: {
        id: info.id,
        name: info.name,
        version: info.version,
        source: info.source,
        permissions: info.permissions,
      },
      logger: {
        info: (message: string) => console.info(`[Plugin:${info.id}] ${message}`),
        warn: (message: string) => console.warn(`[Plugin:${info.id}] ${message}`),
        error: (message: string) => console.error(`[Plugin:${info.id}] ${message}`),
      },
      ui: {
        notify: (message: string) => {
          requirePermission("ui:notify");
          console.info(`[PluginNotify:${info.id}] ${message}`);
          window.dispatchEvent(
            new CustomEvent("lumina-plugin-notify", {
              detail: { pluginId: info.id, message },
            })
          );
        },
        injectStyle: (css: string, scopeId?: string) => {
          requirePermission("ui:decorate");
          const style = document.createElement("style");
          style.setAttribute("data-lumina-plugin-style", info.id);
          if (scopeId) {
            style.setAttribute("data-lumina-plugin-scope", scopeId);
          }
          style.textContent = css;
          document.head.appendChild(style);
          const cleanup = withOnce(() => style.remove());
          unsubscribers.push(cleanup);
          return cleanup;
        },
        setThemeVariables: (variables: Record<string, string>) => {
          requirePermission("ui:theme");
          const root = document.documentElement;
          const previous = new Map<string, string>();
          for (const [key, value] of Object.entries(variables)) {
            const varName = key.startsWith("--") ? key : `--${key}`;
            previous.set(varName, root.style.getPropertyValue(varName));
            root.style.setProperty(varName, value);
          }
          const cleanup = withOnce(() => {
            for (const [varName, value] of previous.entries()) {
              if (value) {
                root.style.setProperty(varName, value);
              } else {
                root.style.removeProperty(varName);
              }
            }
          });
          unsubscribers.push(cleanup);
          return cleanup;
        },
      },
      commands: {
        registerSlashCommand,
        registerCommand,
      },
      vault: {
        getPath: () => workspacePath || null,
        readFile: async (path: string) => {
          requirePermission("vault:read");
          return readFile(resolvePluginPath(path));
        },
        writeFile: async (path: string, content: string) => {
          requirePermission("vault:write");
          return saveFile(resolvePluginPath(path), content);
        },
        deleteFile: async (path: string) => {
          requirePermission("vault:delete");
          return deleteFile(resolvePluginPath(path));
        },
        renameFile: async (oldPath: string, newPath: string) => {
          requirePermission("vault:move");
          return renameFile(resolvePluginPath(oldPath), resolvePluginPath(newPath));
        },
        moveFile: async (sourcePath: string, targetFolder: string) => {
          requirePermission("vault:move");
          return moveFile(resolvePluginPath(sourcePath), resolvePluginPath(targetFolder));
        },
        listFiles: async () => {
          requirePermission("vault:list");
          if (!workspacePath) {
            throw new Error("No workspace is currently open");
          }
          const entries = await listDirectory(workspacePath);
          const files: string[] = [];
          const stack = [...entries];
          while (stack.length > 0) {
            const next = stack.pop();
            if (!next) continue;
            if (next.is_dir && Array.isArray(next.children)) {
              stack.push(...next.children);
              continue;
            }
            if (!next.is_dir && next.path) {
              files.push(next.path);
            }
          }
          return files;
        },
      },
      metadata: {
        getFileMetadata: async (path: string) => {
          requirePermission("metadata:read");
          const content = await readFile(resolvePluginPath(path));
          const frontmatter = parseFrontmatter(content);
          const { links, tags } = parseLinksAndTags(content);
          return { frontmatter, links, tags };
        },
      },
      workspace: {
        getPath: () => workspacePath || null,
        getActiveFile: () => useFileStore.getState().currentFile,
        openFile: async (path: string) => {
          requirePermission("workspace:open");
          await useFileStore.getState().openFile(resolvePluginPath(path), true, false);
        },
        readFile: async (path: string) => {
          requirePermission("vault:read");
          return readFile(resolvePluginPath(path));
        },
        writeFile: async (path: string, content: string) => {
          requirePermission("vault:write");
          return saveFile(resolvePluginPath(path), content);
        },
        registerPanel,
        registerTabType,
        openRegisteredTab,
      },
      editor: {
        getActiveFile: () => useFileStore.getState().currentFile,
        getActiveContent: () => {
          requirePermission("editor:read");
          const { currentFile, currentContent } = useFileStore.getState();
          return currentFile ? currentContent : null;
        },
        setActiveContent: (next: string) => {
          requirePermission("editor:write");
          const store = useFileStore.getState();
          if (!store.currentFile) {
            throw new Error("No active file to edit");
          }
          store.updateContent(next, "ai", `plugin:${info.id}:set-active-content`);
        },
        replaceRange: (start: number, end: number, next: string) => {
          requirePermission("editor:write");
          const store = useFileStore.getState();
          if (!store.currentFile) {
            throw new Error("No active file to edit");
          }
          const safeStart = Math.max(0, Math.min(start, store.currentContent.length));
          const safeEnd = Math.max(safeStart, Math.min(end, store.currentContent.length));
          const updated =
            store.currentContent.slice(0, safeStart) + next + store.currentContent.slice(safeEnd);
          store.updateContent(updated, "ai", `plugin:${info.id}:replace-range`);
        },
        registerDecoration: (className: string, css: string) => {
          requirePermission("editor:decorate");
          const style = document.createElement("style");
          style.setAttribute("data-lumina-plugin-editor-decoration", info.id);
          style.textContent = `.cm-editor .${className} { ${css} }`;
          document.head.appendChild(style);
          const cleanup = withOnce(() => style.remove());
          unsubscribers.push(cleanup);
          return cleanup;
        },
      },
      storage: {
        get: (key: string) => {
          requirePermission("storage:read");
          return localStorage.getItem(storageKey(key));
        },
        set: (key: string, value: string) => {
          requirePermission("storage:write");
          localStorage.setItem(storageKey(key), value);
        },
        remove: (key: string) => {
          requirePermission("storage:write");
          localStorage.removeItem(storageKey(key));
        },
      },
      events: {
        on: (event: PluginHostEvent, handler: PluginEventHandler) => {
          requirePermission("events:subscribe");
          return registerListener(event, handler);
        },
      },
      network: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          requirePermission("network:fetch");
          return fetch(input, init);
        },
      },
      runtime: {
        setInterval: (handler: () => void, ms: number) => {
          requirePermission("runtime:timer");
          const id = window.setInterval(handler, ms);
          unsubscribers.push(withOnce(() => window.clearInterval(id)));
          return id;
        },
        clearInterval: (id: number) => {
          requirePermission("runtime:timer");
          window.clearInterval(id);
        },
        setTimeout: (handler: () => void, ms: number) => {
          requirePermission("runtime:timer");
          const id = window.setTimeout(handler, ms);
          unsubscribers.push(withOnce(() => window.clearTimeout(id)));
          return id;
        },
        clearTimeout: (id: number) => {
          requirePermission("runtime:timer");
          window.clearTimeout(id);
        },
      },
      interop: {
        openExternal: (url: string) => {
          requirePermission("interop:open-external");
          window.open(url, "_blank", "noopener,noreferrer");
        },
      },
    };
  }

  private unload(pluginId: string, loaded: LoadedPlugin) {
    try {
      loaded.dispose?.();
    } catch (err) {
      console.error(`[PluginRuntime:${pluginId}] dispose failed`, err);
    }
    for (const unsubscribe of loaded.unsubscribers) {
      try {
        unsubscribe();
      } catch (err) {
        console.error(`[PluginRuntime:${pluginId}] cleanup failed`, err);
      }
    }
    usePluginUiStore.getState().clearPluginPanels(pluginId);
    for (const [type, def] of this.pluginTabTypes.entries()) {
      if (def.pluginId === pluginId) {
        this.pluginTabTypes.delete(type);
      }
    }
    for (const [id, command] of this.pluginCommands.entries()) {
      if (command.pluginId === pluginId) {
        this.pluginCommands.delete(id);
      }
    }
    window.dispatchEvent(new CustomEvent("lumina-plugin-commands-updated"));
    this.removePluginCommands(pluginId);
    this.removePluginListeners(pluginId);
    this.loaded.delete(pluginId);
  }

  private removePluginCommands(pluginId: string) {
    useCommandStore.setState((state) => ({
      ...state,
      commands: state.commands.filter((cmd) => !cmd.id.startsWith(`plugin:${pluginId}:`)),
    }));
  }

  private removePluginListeners(pluginId: string) {
    for (const eventMap of this.listeners.values()) {
      eventMap.delete(pluginId);
    }
  }

  private isEnabled(plugin: PluginInfo | undefined, enabledById: Record<string, boolean>) {
    if (!plugin) return false;
    if (Object.prototype.hasOwnProperty.call(enabledById, plugin.id)) {
      return Boolean(enabledById[plugin.id]);
    }
    return plugin.enabled_by_default;
  }

  private signatureOf(plugin: PluginInfo) {
    return `${plugin.source}:${plugin.version}:${plugin.entry_path}`;
  }
}

export const pluginRuntime = new PluginRuntime();
