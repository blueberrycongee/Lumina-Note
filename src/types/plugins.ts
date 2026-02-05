export type PluginPermission =
  | "commands:register"
  | "events:subscribe"
  | "workspace:read"
  | "workspace:write"
  | "storage:read"
  | "storage:write"
  | "network:fetch";

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
  source: string;
  root_path: string;
  entry_path: string;
}

export interface PluginEntry {
  info: PluginInfo;
  code: string;
}

export interface PluginRuntimeStatus {
  enabled: boolean;
  loaded: boolean;
  error?: string;
}
