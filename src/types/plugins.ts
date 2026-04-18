export type PluginPermission =
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

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  entry: string;
  permissions: string[];
  enabled_by_default: boolean;
  min_app_version?: string;
  api_version?: string;
  is_desktop_only?: boolean;
  source: string;
  root_path: string;
  entry_path: string;
  validation_error?: {
    code: string;
    field?: string;
    message: string;
  } | null;
  theme?: {
    auto_apply?: boolean;
    tokens?: Record<string, string>;
    light?: Record<string, string>;
    dark?: Record<string, string>;
  } | null;
}

export interface PluginEntry {
  info: PluginInfo;
  code: string;
}

export interface PluginRuntimeStatus {
  enabled: boolean;
  loaded: boolean;
  error?: string;
  incompatible?: boolean;
  reason?: string;
  error_detail?: {
    code: string;
    field?: string;
    message: string;
  };
}
