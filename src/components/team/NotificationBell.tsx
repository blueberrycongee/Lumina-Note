import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useShallow } from "zustand/react/shallow";
import { NotificationPanel } from "./NotificationPanel";

export function NotificationBell() {
  const { unreadCount, fetchUnreadCount, wsConnected } = useNotificationStore(
    useShallow((s) => ({
      unreadCount: s.unreadCount,
      fetchUnreadCount: s.fetchUnreadCount,
      wsConnected: s.wsConnected,
    })),
  );

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fallback polling only when WebSocket is not connected
  useEffect(() => {
    if (wsConnected) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60_000);
    return () => clearInterval(interval);
  }, [wsConnected, fetchUnreadCount]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <Bell size={16} className="text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center px-0.5 leading-none font-medium">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && <NotificationPanel onClose={() => setOpen(false)} />}
    </div>
  );
}
