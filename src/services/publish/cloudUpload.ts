/**
 * Cloud upload service for publishing static sites.
 *
 * Uses the existing Tauri WebDAV commands to push the locally-generated
 * site to the cloud server, then exposes REST helpers for managing the
 * publish lifecycle (status / confirm / unpublish).
 */

import { invoke } from '@/lib/host';
import { tauriFetchJson } from '@/lib/tauriFetch';
import { readFile, readDir } from '@/lib/host';
import type { WebDAVConfig } from '@/services/webdav/types';
import type { FileEntry } from '@/lib/host';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadSiteParams {
  /** Absolute path to the local output directory */
  localDir: string;
  /** Cloud server base URL (e.g. https://cloud.example.com) */
  baseUrl: string;
  /** User email (WebDAV username) */
  email: string;
  /** User password (WebDAV password) */
  password: string;
  /** Bearer token for REST API calls */
  token: string;
  /** Progress callback – called after each file is uploaded */
  onProgress?: (current: number, total: number, filePath: string) => void;
}

export interface PublishStatus {
  published: boolean;
  url: string | null;
  updatedAt: number | null;
}

export interface PublishConfirmResult {
  ok: boolean;
  url: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function buildSiteWebDAVConfig(baseUrl: string, email: string, password: string): WebDAVConfig {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  return {
    server_url: `${normalizedBase}/dav-sites`,
    username: email,
    password: password,
    remote_base_path: '/',
    auto_sync: false,
    sync_interval_secs: 0,
  };
}

function parseErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { message?: string };
    if (typeof parsed.message === 'string' && parsed.message.length > 0) {
      return parsed.message;
    }
  } catch {
    return raw;
  }
  return raw;
}

/**
 * Recursively collect all file entries (non-directories) from a local dir.
 */
async function collectFiles(dirPath: string): Promise<FileEntry[]> {
  const entries = await readDir(dirPath);
  const files: FileEntry[] = [];

  for (const entry of entries) {
    if (entry.is_dir || entry.isDirectory) {
      const children = await collectFiles(entry.path);
      files.push(...children);
    } else {
      files.push(entry);
    }
  }

  return files;
}

/**
 * Compute the remote relative path for a file given the local root dir.
 */
function toRemotePath(filePath: string, localRoot: string): string {
  const normalized = localRoot.endsWith('/') ? localRoot : `${localRoot}/`;
  const relative = filePath.startsWith(normalized)
    ? filePath.slice(normalized.length)
    : filePath;
  return `/${relative}`;
}

/**
 * Extract unique parent directory paths from a remote path.
 * e.g. "/a/b/c.html" -> ["/a", "/a/b"]
 */
function parentDirs(remotePath: string): string[] {
  const parts = remotePath.split('/').filter(Boolean);
  parts.pop(); // remove the file name
  const dirs: string[] = [];
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    dirs.push(current);
  }
  return dirs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Upload a local directory to the cloud via WebDAV.
 *
 * 1. DELETE the existing remote site directory (ignore 404).
 * 2. Walk the local directory and collect all files.
 * 3. For each file, ensure parent directories exist (MKCOL), then PUT.
 * 4. Call `onProgress` after each file.
 */
export async function uploadSiteToCloud(params: UploadSiteParams): Promise<void> {
  const { localDir, baseUrl, email, password, onProgress } = params;
  const config = buildSiteWebDAVConfig(baseUrl, email, password);

  // Step 1 – clear old content (ignore errors if the dir doesn't exist)
  try {
    await invoke('webdav_delete', { config, remotePath: '/' });
  } catch {
    // Directory may not exist yet – safe to ignore.
  }

  // Step 2 – collect all local files
  const files = await collectFiles(localDir);
  const total = files.length;

  // Collect all unique parent dirs we need to create
  const dirsToCreate = new Set<string>();
  for (const file of files) {
    const remote = toRemotePath(file.path, localDir);
    for (const dir of parentDirs(remote)) {
      dirsToCreate.add(dir);
    }
  }

  // Create directories in order (shorter paths first so parents come before children)
  const sortedDirs = Array.from(dirsToCreate).sort((a, b) => a.length - b.length);
  for (const dir of sortedDirs) {
    try {
      await invoke('webdav_create_dir', { config, remotePath: dir });
    } catch {
      // Directory may already exist – safe to ignore.
    }
  }

  // Step 3 – upload each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const remotePath = toRemotePath(file.path, localDir);
    const content = await readFile(file.path);

    await invoke('webdav_upload', { config, remotePath, content });

    onProgress?.(i + 1, total, remotePath);
  }
}

/**
 * Fetch the current publish status from the cloud server.
 */
export async function getCloudPublishStatus(
  baseUrl: string,
  token: string,
): Promise<PublishStatus> {
  const base = normalizeBaseUrl(baseUrl);
  const response = await tauriFetchJson<PublishStatus>(`${base}/publish/status`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok || !response.data) {
    throw new Error(parseErrorMessage(response.error || 'Failed to get publish status'));
  }
  return response.data;
}

/**
 * Confirm the cloud publish (makes the uploaded site publicly accessible).
 */
export async function confirmCloudPublish(
  baseUrl: string,
  token: string,
): Promise<PublishConfirmResult> {
  const base = normalizeBaseUrl(baseUrl);
  const response = await tauriFetchJson<PublishConfirmResult>(`${base}/publish/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok || !response.data) {
    throw new Error(parseErrorMessage(response.error || 'Failed to confirm publish'));
  }
  return response.data;
}

/**
 * Unpublish the site from the cloud (removes public access and deletes content).
 */
export async function unpublishFromCloud(
  baseUrl: string,
  token: string,
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl);
  const response = await tauriFetchJson<unknown>(`${base}/publish`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(parseErrorMessage(response.error || 'Failed to unpublish'));
  }
}
