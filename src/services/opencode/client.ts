// Lazy singleton OpencodeClient wired to the in-process opencode server
// running inside Electron main. Server credentials are fetched once from
// window.lumina.opencode.getServerInfo() and reused across the renderer.

import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";

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
      };
    };
  }
}

let cachedClient: OpencodeClient | null = null;
let cachedInfo: ServerInfo | null = null;
let pending: Promise<OpencodeClient> | null = null;

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
    cachedClient = createOpencodeClient({
      baseUrl: info.url,
      headers: {
        authorization: buildAuthHeader(info),
      },
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

export function resetOpencodeClient(): void {
  cachedClient = null;
  cachedInfo = null;
  pending = null;
}
