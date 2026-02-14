import { create } from "zustand";

export type AppErrorLevel = "error" | "warning";

export interface AppErrorNotice {
  id: string;
  title: string;
  message: string;
  level: AppErrorLevel;
  source?: string;
  action?: string;
  detail?: string;
  count: number;
  createdAt: number;
  lastSeenAt: number;
}

interface ErrorStoreState {
  notices: AppErrorNotice[];
  pushNotice: (notice: {
    title: string;
    message: string;
    level?: AppErrorLevel;
    source?: string;
    action?: string;
    detail?: string;
  }) => string;
  dismissNotice: (id: string) => void;
  clearNotices: () => void;
}

const MAX_NOTICES = 6;
const DEDUPE_WINDOW_MS = 2500;

const buildNoticeId = () =>
  `err-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

export const useErrorStore = create<ErrorStoreState>()((set, get) => ({
  notices: [],

  pushNotice: (notice) => {
    const now = Date.now();
    const level = notice.level ?? "error";
    const notices = get().notices;
    const existing = notices.find(
      (item) =>
        item.title === notice.title &&
        item.message === notice.message &&
        item.level === level &&
        item.source === notice.source &&
        item.action === notice.action &&
        now - item.lastSeenAt <= DEDUPE_WINDOW_MS,
    );

    if (existing) {
      set((state) => ({
        notices: state.notices.map((item) =>
          item.id === existing.id
            ? { ...item, count: item.count + 1, lastSeenAt: now }
            : item,
        ),
      }));
      return existing.id;
    }

    const next: AppErrorNotice = {
      id: buildNoticeId(),
      title: notice.title,
      message: notice.message,
      level,
      source: notice.source,
      action: notice.action,
      detail: notice.detail,
      count: 1,
      createdAt: now,
      lastSeenAt: now,
    };

    set((state) => ({
      notices: [next, ...state.notices].slice(0, MAX_NOTICES),
    }));

    return next.id;
  },

  dismissNotice: (id) => {
    set((state) => ({
      notices: state.notices.filter((notice) => notice.id !== id),
    }));
  },

  clearNotices: () => set({ notices: [] }),
}));
