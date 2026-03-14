import { create } from "zustand";
import type { NotificationSummary } from "@/services/team/types";
import * as teamApi from "@/services/team/client";

// ===== Module-level WebSocket state =====

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let consecutiveFailures = 0;
let destroyed = false;

const RECONNECT_BASE = 3_000;
const RECONNECT_MAX = 30_000;
const HEARTBEAT_TIMEOUT = 45_000;

// ===== WebSocket lifecycle functions =====

function disconnectWebSocket(): void {
  destroyed = true;

  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (heartbeatTimer !== null) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.close();
    ws = null;
  }

  useNotificationStore.setState({ wsConnected: false });
}

function resetHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearTimeout(heartbeatTimer);
  }
  heartbeatTimer = setTimeout(() => {
    if (ws) {
      ws.close();
    }
  }, HEARTBEAT_TIMEOUT);
}

function scheduleReconnect(baseUrl: string, token: string): void {
  if (destroyed) return;
  const delay = Math.min(
    RECONNECT_BASE * Math.pow(2, consecutiveFailures),
    RECONNECT_MAX,
  );
  consecutiveFailures++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!destroyed) {
      doConnect(baseUrl, token);
    }
  }, delay);
}

function doConnect(baseUrl: string, token: string): void {
  const wsUrl =
    baseUrl.replace(/^http/, "ws") +
    `/ws/notifications?token=${encodeURIComponent(token)}`;
  const socket = new WebSocket(wsUrl);
  ws = socket;

  socket.onopen = () => {
    const wasReconnect = consecutiveFailures > 0;
    consecutiveFailures = 0;
    useNotificationStore.setState({ wsConnected: true });
    resetHeartbeat();

    if (wasReconnect) {
      useNotificationStore.getState().fetchNotifications();
    }
  };

  socket.onmessage = (event: MessageEvent) => {
    resetHeartbeat();

    try {
      const msg = JSON.parse(event.data as string) as {
        type: string;
        count?: number;
        data?: NotificationSummary;
        unread_count?: number;
      };

      if (msg.type === "unread" && msg.count !== undefined) {
        useNotificationStore.setState({ unreadCount: msg.count });
      } else if (msg.type === "notification" && msg.data) {
        const incoming = msg.data;
        useNotificationStore.setState((state) => {
          // Dedup by id before prepend
          const exists = state.notifications.some((n) => n.id === incoming.id);
          const updated = exists
            ? state.notifications.map((n) =>
                n.id === incoming.id ? incoming : n,
              )
            : [incoming, ...state.notifications];
          return {
            notifications: updated,
            unreadCount:
              msg.unread_count !== undefined
                ? msg.unread_count
                : state.unreadCount,
          };
        });
      }
    } catch {
      // Ignore malformed messages
    }
  };

  socket.onclose = (event: CloseEvent) => {
    useNotificationStore.setState({ wsConnected: false });

    if (heartbeatTimer !== null) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }

    // 4401 = auth error, do not reconnect
    if (event.code === 4401) return;

    scheduleReconnect(baseUrl, token);
  };

  socket.onerror = () => {
    // onclose handles reconnection
  };
}

function connectWebSocket(baseUrl: string, token: string): void {
  disconnectWebSocket();
  destroyed = false;
  consecutiveFailures = 0;
  doConnect(baseUrl, token);
}

// ===== Zustand store =====

interface NotificationState {
  notifications: NotificationSummary[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  wsConnected: boolean;

  // Connection
  baseUrl: string;
  token: string;

  setConnection: (baseUrl: string, token: string) => void;

  fetchNotifications: (limit?: number) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markRead: (notificationIds: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  // Connection
  baseUrl: "",
  token: "",

  // Initial state
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
  wsConnected: false,

  setConnection: (baseUrl: string, token: string) => {
    disconnectWebSocket();
    set({ baseUrl, token });
    if (baseUrl && token) {
      connectWebSocket(baseUrl, token);
    }
  },

  fetchNotifications: async (limit?: number) => {
    const { baseUrl, token } = get();
    if (!baseUrl || !token) return;
    set({ loading: true, error: null });
    try {
      const fetched = await teamApi.listNotifications(baseUrl, token, limit);
      set((state) => {
        const merged = new Map(state.notifications.map((n) => [n.id, n]));
        for (const n of fetched) merged.set(n.id, n);
        return {
          notifications: [...merged.values()].sort(
            (a, b) => b.created_at - a.created_at,
          ),
          loading: false,
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, loading: false });
    }
  },

  fetchUnreadCount: async () => {
    const { baseUrl, token } = get();
    if (!baseUrl || !token) return;
    set({ error: null });
    try {
      const unreadCount = await teamApi.getUnreadNotificationCount(
        baseUrl,
        token,
      );
      set({ unreadCount });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    }
  },

  markRead: async (notificationIds: string[]) => {
    const { baseUrl, token, notifications, unreadCount } = get();

    // Optimistic update
    const idSet = new Set(notificationIds);
    const newlyReadCount = notifications.filter(
      (n) => idSet.has(n.id) && !n.read,
    ).length;

    set({
      error: null,
      notifications: notifications.map((n) =>
        idSet.has(n.id) ? { ...n, read: true } : n,
      ),
      unreadCount: Math.max(0, unreadCount - newlyReadCount),
    });

    try {
      await teamApi.markNotificationsRead(baseUrl, token, {
        notification_ids: notificationIds,
      });
    } catch (err) {
      // Full resync on failure instead of snapshot rollback
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      get().fetchNotifications();
      get().fetchUnreadCount();
    }
  },

  markAllRead: async () => {
    const { baseUrl, token, notifications } = get();

    // Optimistic update
    set({
      error: null,
      notifications: notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    });

    try {
      await teamApi.markAllNotificationsRead(baseUrl, token);
    } catch (err) {
      // Full resync on failure instead of snapshot rollback
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      get().fetchNotifications();
      get().fetchUnreadCount();
    }
  },
}));
