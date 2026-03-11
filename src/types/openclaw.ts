export const OPENCLAW_ROOT_MEMORY_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "USER.md",
  "HEARTBEAT.md",
  "MEMORY.md",
] as const;

export const OPENCLAW_ROOT_MEMORY_FOLDERS = [
  "memory",
  "output",
  ".openclaw",
] as const;

export type OpenClawAttachmentStatus = "attached" | "unavailable";

export interface OpenClawGatewaySettings {
  enabled: boolean;
  endpoint: string | null;
}

export interface OpenClawWorkspaceAttachment {
  kind: "openclaw";
  workspacePath: string;
  status: OpenClawAttachmentStatus;
  attachedAt: string;
  lastValidatedAt: string | null;
  detectedFiles: string[];
  detectedFolders: string[];
  gateway: OpenClawGatewaySettings;
}
