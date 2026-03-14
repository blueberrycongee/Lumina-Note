import { create } from 'zustand';
import type { NotificationSummary } from '@/services/team/types';
import * as teamApi from '@/services/team/client';

interface NotificationState {
  notifications: NotificationSummary[];
  unreadCount: number;
  loading: boolean;
  error: string | null;

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
  baseUrl: '',
  token: '',

  // Initial state
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,

  setConnection: (baseUrl: string, token: string) => {
    set({ baseUrl, token });
  },

  fetchNotifications: async (limit?: number) => {
    const { baseUrl, token } = get();
    set({ loading: true, error: null });
    try {
      const notifications = await teamApi.listNotifications(baseUrl, token, limit);
      set({ notifications, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, loading: false });
    }
  },

  fetchUnreadCount: async () => {
    const { baseUrl, token } = get();
    set({ error: null });
    try {
      const unreadCount = await teamApi.getUnreadNotificationCount(baseUrl, token);
      set({ unreadCount });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    }
  },

  markRead: async (notificationIds: string[]) => {
    const { baseUrl, token, notifications, unreadCount } = get();

    // Optimistic update
    const prevNotifications = notifications;
    const prevUnreadCount = unreadCount;
    const idSet = new Set(notificationIds);
    const newlyReadCount = notifications.filter((n) => idSet.has(n.id) && !n.read).length;

    set({
      error: null,
      notifications: notifications.map((n) =>
        idSet.has(n.id) ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, unreadCount - newlyReadCount),
    });

    try {
      await teamApi.markNotificationsRead(baseUrl, token, {
        notification_ids: notificationIds,
      });
    } catch (err) {
      // Rollback on failure
      const message = err instanceof Error ? err.message : String(err);
      set({
        notifications: prevNotifications,
        unreadCount: prevUnreadCount,
        error: message,
      });
    }
  },

  markAllRead: async () => {
    const { baseUrl, token, notifications, unreadCount } = get();

    // Optimistic update
    const prevNotifications = notifications;
    const prevUnreadCount = unreadCount;

    set({
      error: null,
      notifications: notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    });

    try {
      await teamApi.markAllNotificationsRead(baseUrl, token);
    } catch (err) {
      // Rollback on failure
      const message = err instanceof Error ? err.message : String(err);
      set({
        notifications: prevNotifications,
        unreadCount: prevUnreadCount,
        error: message,
      });
    }
  },
}));
