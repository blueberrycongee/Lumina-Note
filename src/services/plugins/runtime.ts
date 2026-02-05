import { isAbsolute, join, normalize } from "@/lib/path";
import { readFile, saveFile, readPluginEntry } from "@/lib/tauri";
import { useCommandStore } from "@/stores/useCommandStore";
import type { PluginInfo, PluginPermission, PluginRuntimeStatus } from "@/types/plugins";

type PluginHostEvent = "app:ready" | "workspace:changed" | "active-file:changed";

type SlashCommandInput = {
  key: string;
  description: string;
  prompt: string;
};

type PluginSetupResult =
  | void
  | (() => void)
  | Promise<void | (() => void)>
  | { dispose?: () => void };

type PluginEventHandler = (payload: Record<string, unknown>) => void;

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
  };
  commands: {
    registerSlashCommand: (input: SlashCommandInput) => () => void;
  };
  workspace: {
    getPath: () => string | null;
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
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
}

class PluginRuntime {
  private loaded = new Map<string, LoadedPlugin>();
  private listeners = new Map<PluginHostEvent, Map<string, Set<PluginEventHandler>>>();

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
        const permissions = new Set(entry.info.permissions || []);
        const api = this.createApi(entry.info, permissions, input.workspacePath);
        const dispose = await this.runPlugin(entry.info, entry.code, api);
        this.loaded.set(plugin.id, {
          info: entry.info,
          signature,
          dispose,
          unsubscribers: [],
        });
        statuses[plugin.id] = { enabled: true, loaded: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        statuses[plugin.id] = { enabled: true, loaded: false, error: message };
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
    workspacePath?: string
  ): LuminaPluginApi {
    const requirePermission = (permission: PluginPermission) => {
      if (!permissions.has(permission) && !permissions.has("*")) {
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

      return () => {
        handlers?.delete(handler);
        if (handlers && handlers.size === 0) {
          eventMap?.delete(info.id);
        }
      };
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

      return () => {
        useCommandStore.setState((state) => ({
          ...state,
          commands: state.commands.filter((cmd) => cmd.id !== id),
        }));
      };
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
          console.info(`[PluginNotify:${info.id}] ${message}`);
          window.dispatchEvent(
            new CustomEvent("lumina-plugin-notify", {
              detail: { pluginId: info.id, message },
            })
          );
        },
      },
      commands: {
        registerSlashCommand,
      },
      workspace: {
        getPath: () => workspacePath || null,
        readFile: async (path: string) => {
          requirePermission("workspace:read");
          return readFile(resolveWorkspacePath(path));
        },
        writeFile: async (path: string, content: string) => {
          requirePermission("workspace:write");
          return saveFile(resolveWorkspacePath(path), content);
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
    };
  }

  private unload(pluginId: string, loaded: LoadedPlugin) {
    try {
      loaded.dispose?.();
    } catch (err) {
      console.error(`[PluginRuntime:${pluginId}] dispose failed`, err);
    }
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
