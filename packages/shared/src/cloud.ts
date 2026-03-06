export type CloudErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'conflict'
  | 'internal_error'
  | 'invalid_credentials'
  | 'unknown_error';

export interface CloudUser {
  id: string;
  email: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
}

export interface CloudErrorResponse {
  code: CloudErrorCode;
  message: string;
}

export interface CloudAuthResponse {
  token: string;
  user: CloudUser;
  workspaces: WorkspaceSummary[];
}

export interface AuthSession {
  token: string;
  user: CloudUser;
  workspaces: WorkspaceSummary[];
  currentWorkspaceId: string | null;
}

export interface CloudServerConfig {
  baseUrl: string;
  email: string;
  password: string;
  autoSync: boolean;
  syncIntervalSecs: number;
}

export interface CreateWorkspaceRequest {
  name: string;
}

export interface CloudSyncConflictItem {
  path: string;
  reason: string;
  localModified: number | null;
  remoteModified: number | null;
}

export const DEFAULT_SYNC_INTERVAL_SECS = 300;
