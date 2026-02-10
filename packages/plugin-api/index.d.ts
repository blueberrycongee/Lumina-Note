export type LuminaPluginPermission =
  | "*"
  | "commands:*"
  | "commands:register"
  | "events:*"
  | "events:subscribe"
  | "vault:*"
  | "vault:read"
  | "vault:write"
  | "vault:delete"
  | "vault:move"
  | "vault:list"
  | "metadata:read"
  | "workspace:*"
  | "workspace:read"
  | "workspace:open"
  | "workspace:panel"
  | "workspace:tab"
  | "editor:*"
  | "editor:read"
  | "editor:write"
  | "editor:decorate"
  | "ui:*"
  | "ui:notify"
  | "ui:theme"
  | "ui:decorate"
  | "storage:*"
  | "storage:read"
  | "storage:write"
  | "network:*"
  | "network:fetch"
  | "runtime:*"
  | "runtime:timer"
  | "interop:*"
  | "interop:open-external";

export interface LuminaPluginMeta {
  id: string;
  name: string;
  version: string;
  source: string;
  permissions: string[];
}

export interface LuminaPluginManifestV1 {
  id: string;
  name: string;
  version: string;
  entry: string;
  description?: string;
  author?: string;
  homepage?: string;
  min_app_version?: string;
  api_version?: string;
  permissions?: string[];
  enabled_by_default?: boolean;
  is_desktop_only?: boolean;
  theme?: {
    auto_apply?: boolean;
    tokens?: Record<string, string>;
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
}

export interface LuminaPluginApi {
  meta: LuminaPluginMeta;
  logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
  ui: {
    notify: (message: string) => void;
    injectStyle: (
      css:
        | string
        | {
            css: string;
            scopeId?: string;
            global?: boolean;
            layer?: "base" | "theme" | "component" | "override";
          },
      scopeId?: string
    ) => () => void;
    setThemeVariables: (variables: Record<string, string>) => () => void;
  };
  theme: {
    registerPreset: (input: {
      id: string;
      name?: string;
      tokens?: Record<string, string>;
      light?: Record<string, string>;
      dark?: Record<string, string>;
    }) => () => void;
    applyPreset: (id: string) => void;
    setToken: (input: { token: string; value: string; mode?: "all" | "light" | "dark" }) => () => void;
    resetToken: (input: { token: string; mode?: "all" | "light" | "dark" }) => void;
  };
  commands: {
    registerSlashCommand: (input: {
      key: string;
      description: string;
      prompt: string;
    }) => () => void;
    registerCommand: (input: {
      id: string;
      title: string;
      description?: string;
      hotkey?: string;
      run: () => void;
    }) => () => void;
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
    on: (
      event: "app:ready" | "workspace:changed" | "active-file:changed",
      handler: (payload: Record<string, unknown>) => void,
    ) => () => void;
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

export type LuminaPluginSetup =
  | void
  | (() => void)
  | Promise<void | (() => void)>
  | { dispose?: () => void };

export type LuminaPluginEntrypoint = (
  api: LuminaPluginApi,
  plugin: LuminaPluginMeta,
) => LuminaPluginSetup;
