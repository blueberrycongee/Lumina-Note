import { tauriFetchJson } from '@/lib/tauriFetch';
import type { WebDAVConfig } from '@/services/webdav';
import type {
  CloudAuthResponse,
  CloudErrorResponse,
  WorkspaceSummary,
  CreateWorkspaceRequest,
} from '@lumina/shared';
import { DEFAULT_SYNC_INTERVAL_SECS } from '@lumina/shared';

export interface CloudCredentials {
  baseUrl: string;
  email: string;
  password: string;
}

export function normalizeCloudBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export function buildCloudWebDavConfig(input: {
  baseUrl: string;
  email: string;
  password: string;
  workspaceId: string;
  autoSync?: boolean;
  syncIntervalSecs?: number;
}): WebDAVConfig {
  const normalizedBaseUrl = normalizeCloudBaseUrl(input.baseUrl);
  return {
    server_url: `${normalizedBaseUrl}/dav`,
    username: input.email,
    password: input.password,
    remote_base_path: `/${input.workspaceId}`,
    auto_sync: input.autoSync ?? false,
    sync_interval_secs: input.syncIntervalSecs ?? DEFAULT_SYNC_INTERVAL_SECS,
  };
}

export function parseCloudErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Partial<CloudErrorResponse>;
    if (typeof parsed.message === 'string' && parsed.message.length > 0) {
      return parsed.message;
    }
  } catch {
    return raw;
  }
  return raw;
}

async function postJson<T>(url: string, body: unknown, token?: string): Promise<T> {
  const response = await tauriFetchJson<T>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.data) {
    throw new Error(parseCloudErrorMessage(response.error || 'Request failed'));
  }
  return response.data;
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const response = await tauriFetchJson<T>(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok || !response.data) {
    throw new Error(parseCloudErrorMessage(response.error || 'Request failed'));
  }
  return response.data;
}

export async function registerCloudAccount(credentials: CloudCredentials): Promise<CloudAuthResponse> {
  return postJson<CloudAuthResponse>(`${normalizeCloudBaseUrl(credentials.baseUrl)}/auth/register`, {
    email: credentials.email,
    password: credentials.password,
  });
}

export async function loginCloudAccount(credentials: CloudCredentials): Promise<CloudAuthResponse> {
  return postJson<CloudAuthResponse>(`${normalizeCloudBaseUrl(credentials.baseUrl)}/auth/login`, {
    email: credentials.email,
    password: credentials.password,
  });
}

export async function refreshCloudToken(baseUrl: string, token: string): Promise<{ token: string }> {
  return postJson<{ token: string }>(`${normalizeCloudBaseUrl(baseUrl)}/auth/refresh`, {}, token);
}

export async function listCloudWorkspaces(baseUrl: string, token: string): Promise<WorkspaceSummary[]> {
  return getJson<WorkspaceSummary[]>(`${normalizeCloudBaseUrl(baseUrl)}/workspaces`, token);
}

export async function createCloudWorkspace(
  baseUrl: string,
  token: string,
  request: CreateWorkspaceRequest
): Promise<WorkspaceSummary> {
  return postJson<WorkspaceSummary>(`${normalizeCloudBaseUrl(baseUrl)}/workspaces`, request, token);
}
