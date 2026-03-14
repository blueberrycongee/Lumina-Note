import * as Y from 'yjs';

// ---------------------------------------------------------------------------
// CollabConnection — lightweight wrapper around a Y.Doc + custom WebSocket
// that speaks raw Yjs v1 update binary frames (matching the backend yrs relay).
// ---------------------------------------------------------------------------

export interface CollabConnection {
  ydoc: Y.Doc;
  provider: CustomCollabProvider;
  ytext: Y.Text;
  destroy: () => void;
}

/** Status reported by the provider. */
export type CollabStatus = 'connecting' | 'connected' | 'disconnected';

export type CollabStatusListener = (status: CollabStatus) => void;

// ---------------------------------------------------------------------------
// CustomCollabProvider
// ---------------------------------------------------------------------------

export class CustomCollabProvider {
  private ws: WebSocket | null = null;
  private ydoc: Y.Doc;
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _status: CollabStatus = 'disconnected';
  private _destroyed = false;
  private statusListeners = new Set<CollabStatusListener>();

  /** Base reconnect delay in ms (doubles on each consecutive failure, capped). */
  private reconnectDelay = 3_000;
  private readonly maxReconnectDelay = 30_000;
  private consecutiveFailures = 0;

  constructor(ydoc: Y.Doc, url: string) {
    this.ydoc = ydoc;
    this.url = url;

    // Forward local updates to the server.
    this.ydoc.on('update', this.handleLocalUpdate);

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
    // Immediately fire with current status so callers can initialise.
    listener(this._status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.clearReconnect();
    this.ydoc.off('update', this.handleLocalUpdate);
    this.ws?.close();
    this.ws = null;
    this.setStatus('disconnected');
  }

  // -- internals ------------------------------------------------------------

  private handleLocalUpdate = (update: Uint8Array, origin: unknown): void => {
    // Only forward updates that originated locally (not from the remote).
    if (origin === 'remote') return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(update);
    }
  };

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

    this.setStatus('connecting');

    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      if (this._destroyed) {
        ws.close();
        return;
      }
      this.consecutiveFailures = 0;
      this.setStatus('connected');
    };

    ws.onmessage = (event: MessageEvent) => {
      if (this._destroyed) return;
      const data = new Uint8Array(event.data as ArrayBuffer);
      Y.applyUpdate(this.ydoc, data, 'remote');
    };

    ws.onclose = () => {
      if (this._destroyed) return;
      this.setStatus('disconnected');
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // The close handler will fire right after; just ensure the socket is
      // torn down so we don't leak.
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
  const ytext = ydoc.getText('codemirror');

  const wsUrl = `${options.serverUrl}/collab/${encodeURIComponent(options.docId)}?token=${encodeURIComponent(options.token)}`;

  const provider = new CustomCollabProvider(ydoc, wsUrl);

  return {
    ydoc,
    provider,
    ytext,
    destroy: () => {
      provider.destroy();
      ydoc.destroy();
    },
  };
}
