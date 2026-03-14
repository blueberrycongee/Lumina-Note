import * as Y from "yjs";
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";

// ---------------------------------------------------------------------------
// Message type constants (byte 0 prefix for WebSocket frames)
// ---------------------------------------------------------------------------

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

// ---------------------------------------------------------------------------
// CollabConnection — lightweight wrapper around a Y.Doc + custom WebSocket
// that speaks typed binary frames (matching the backend yrs relay).
// ---------------------------------------------------------------------------

export interface CollabConnection {
  ydoc: Y.Doc;
  provider: CustomCollabProvider;
  ytext: Y.Text;
  awareness: Awareness;
  destroy: () => void;
}

/** Status reported by the provider. */
export type CollabStatus = "connecting" | "connected" | "disconnected";

export type CollabStatusListener = (status: CollabStatus) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 45%)`;
}

// ---------------------------------------------------------------------------
// CustomCollabProvider
// ---------------------------------------------------------------------------

export class CustomCollabProvider {
  private ws: WebSocket | null = null;
  private ydoc: Y.Doc;
  private awareness: Awareness;
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _status: CollabStatus = "disconnected";
  private _destroyed = false;
  private statusListeners = new Set<CollabStatusListener>();

  /** Base reconnect delay in ms (doubles on each consecutive failure, capped). */
  private reconnectDelay = 3_000;
  private readonly maxReconnectDelay = 30_000;
  private consecutiveFailures = 0;

  constructor(
    ydoc: Y.Doc,
    awareness: Awareness,
    url: string,
    userName?: string,
    userColor?: string,
  ) {
    this.ydoc = ydoc;
    this.awareness = awareness;
    this.url = url;

    // Set local awareness state
    awareness.setLocalStateField("user", {
      name: userName || "Anonymous",
      color: userColor || hashColor(userName || String(ydoc.clientID)),
    });

    // Forward local doc updates to the server.
    this.ydoc.on("update", this.handleLocalUpdate);

    // Forward local awareness changes to the server.
    this.awareness.on("update", this.handleAwarenessUpdate);

    this.connect();
  }

  // -- public API -----------------------------------------------------------

  get status(): CollabStatus {
    return this._status;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  onStatus(listener: CollabStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this._status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.clearReconnect();
    this.ydoc.off("update", this.handleLocalUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    removeAwarenessStates(this.awareness, [this.ydoc.clientID], "destroyed");
    this.ws?.close();
    this.ws = null;
    this.setStatus("disconnected");
  }

  // -- internals ------------------------------------------------------------

  private handleLocalUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === "remote") return;
    this.sendSyncMessage(update);
  };

  private handleAwarenessUpdate = (
    {
      added,
      updated,
      removed,
    }: { added: number[]; updated: number[]; removed: number[] },
    _origin: unknown,
  ): void => {
    const changedClients = added.concat(updated, removed);
    const encoded = encodeAwarenessUpdate(this.awareness, changedClients);
    this.sendAwarenessMessage(encoded);
  };

  private sendSyncMessage(update: Uint8Array): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const msg = new Uint8Array(1 + update.byteLength);
    msg[0] = MSG_SYNC;
    msg.set(update, 1);
    this.ws.send(msg);
  }

  private sendAwarenessMessage(data: Uint8Array): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const msg = new Uint8Array(1 + data.byteLength);
    msg[0] = MSG_AWARENESS;
    msg.set(data, 1);
    this.ws.send(msg);
  }

  private setStatus(s: CollabStatus): void {
    if (this._status === s) return;
    this._status = s;
    for (const fn of this.statusListeners) {
      try {
        fn(s);
      } catch {
        /* listener errors must not break the provider */
      }
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this._destroyed) return;
    this.clearReconnect();
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.consecutiveFailures),
      this.maxReconnectDelay,
    );
    this.consecutiveFailures++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private connect(): void {
    if (this._destroyed) return;

    this.setStatus("connecting");

    const ws = new WebSocket(this.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      if (this._destroyed) {
        ws.close();
        return;
      }
      this.consecutiveFailures = 0;
      this.setStatus("connected");

      // Sync local state that may have accumulated while offline
      const localState = Y.encodeStateAsUpdate(this.ydoc);
      this.sendSyncMessage(localState);

      // Send local awareness state so other peers see us
      const awarenessUpdate = encodeAwarenessUpdate(this.awareness, [
        this.ydoc.clientID,
      ]);
      this.sendAwarenessMessage(awarenessUpdate);
    };

    ws.onmessage = (event: MessageEvent) => {
      if (this._destroyed) return;
      const data = new Uint8Array(event.data as ArrayBuffer);
      if (data.byteLength === 0) return;

      const type = data[0];
      const payload = data.subarray(1);

      switch (type) {
        case MSG_SYNC:
          Y.applyUpdate(this.ydoc, payload, "remote");
          break;
        case MSG_AWARENESS:
          applyAwarenessUpdate(this.awareness, payload, "remote");
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      if (this._destroyed) return;
      this.setStatus("disconnected");
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCollabConnection(options: {
  serverUrl: string; // e.g. 'ws://localhost:3000'
  docId: string;
  token: string;
  userName?: string;
  userColor?: string;
}): CollabConnection {
  const ydoc = new Y.Doc();
  const awareness = new Awareness(ydoc);
  const ytext = ydoc.getText("codemirror");

  const wsUrl = `${options.serverUrl}/collab/${encodeURIComponent(options.docId)}?token=${encodeURIComponent(options.token)}`;

  const provider = new CustomCollabProvider(
    ydoc,
    awareness,
    wsUrl,
    options.userName,
    options.userColor,
  );

  return {
    ydoc,
    provider,
    ytext,
    awareness,
    destroy: () => {
      provider.destroy();
      awareness.destroy();
      ydoc.destroy();
    },
  };
}
