import { useEffect } from 'react';
import { Check } from 'lucide-react';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useShallow } from 'zustand/react/shallow';

interface NotificationPanelProps {
  onClose: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

export function NotificationPanel({ onClose: _onClose }: NotificationPanelProps) {
  const { notifications, loading, fetchNotifications, markRead, markAllRead } =
    useNotificationStore(
      useShallow((s) => ({
        notifications: s.notifications,
        loading: s.loading,
        fetchNotifications: s.fetchNotifications,
        markRead: s.markRead,
        markAllRead: s.markAllRead,
      })),
    );

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="absolute right-0 top-full mt-1 w-80 max-h-96 bg-popover border border-border rounded-lg shadow-lg z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-semibold text-foreground">Notifications</span>
        {hasUnread && (
          <button
            onClick={() => markAllRead()}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Check size={12} />
            Mark all read
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          <div>
            {notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => {
                  if (!notification.read) {
                    markRead([notification.id]);
                  }
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors border-b border-border/50 last:border-b-0 flex gap-2.5"
              >
                {/* Unread indicator */}
                <div className="pt-1.5 shrink-0">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      notification.read ? 'bg-transparent' : 'bg-blue-500'
                    }`}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground leading-snug truncate">
                    {notification.title}
                  </div>
                  {notification.body && (
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notification.body}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground/70 mt-1">
                    {formatRelativeTime(notification.created_at)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
