// Lazy singleton OpencodeClient wired to the in-process opencode server
// running inside Electron main. Server credentials are fetched once from
// window.lumina.opencode.getServerInfo() and reused across the renderer.

// Import from /client subpath only — the root barrel re-exports /server
// (which needs cross-spawn + node's `process`) and crashes in the renderer.
import {
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk/client";

type ServerInfo = {
  url: string;
  username: string;
  password: string;
};

declare global {
  interface Window {
    lumina?: {
      opencode?: {
        getServerInfo(): Promise<ServerInfo | null>;
        onServerChanged?(
          handler: (info: ServerInfo | null) => void,
        ): () => void;
      };
    };
  }
}

let cachedClient: OpencodeClient | null = null;
let cachedInfo: ServerInfo | null = null;
let pending: Promise<OpencodeClient> | null = null;
// Every opencode route that carries session/message state goes through
// InstanceMiddleware, which picks the active `directory` from query or
// `x-opencode-directory` and routes the request to an Instance keyed by
// that path. If a later request arrives with a different directory, it
// hits a different Instance and the session you just created is "not
// found". We stash the current vault path and attach it as a default
// header so every request stays in the same Instance.
let defaultDirectory: string | null = null;

async function resolveServerInfo(): Promise<ServerInfo> {
  const bridge = window.lumina?.opencode;
  if (!bridge) {
    throw new Error(
      "opencode bridge missing: window.lumina.opencode not exposed by preload",
    );
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    const info = await bridge.getServerInfo();
    if (info) return info;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("opencode server never reported ready from main process");
}

function buildAuthHeader(info: ServerInfo): string {
  const token = btoa(`${info.username}:${info.password}`);
  return `Basic ${token}`;
}

export async function getOpencodeClient(): Promise<OpencodeClient> {
  if (cachedClient) return cachedClient;
  if (pending) return pending;

  pending = (async () => {
    const info = await resolveServerInfo();
    cachedInfo = info;
    const headers: Record<string, string> = {
      authorization: buildAuthHeader(info),
    };
    if (defaultDirectory) {
      headers["x-opencode-directory"] = defaultDirectory;
    }
    cachedClient = createOpencodeClient({
      baseUrl: info.url,
      headers,
    });
    return cachedClient;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

export function getCachedServerInfo(): ServerInfo | null {
  return cachedInfo;
}

/**
 * Pin every subsequent opencode request to `directory`. Call this once
 * the vault path is known so session/message routes all land in the same
 * Instance. Resets the cached client so the new default header sticks.
 */
export function setDefaultDirectory(directory: string | null): void {
  if (defaultDirectory === directory) return;
  defaultDirectory = directory && directory.length > 0 ? directory : null;
  cachedClient = null;
  pending = null;
}

export function getDefaultDirectory(): string | null {
  return defaultDirectory;
}

export function resetOpencodeClient(): void {
  cachedClient = null;
  cachedInfo = null;
  pending = null;
}
