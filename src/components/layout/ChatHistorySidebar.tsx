import { motion } from "framer-motion";
import { Bot, MessageSquare, Trash2, X } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { formatSessionTime } from "./hooks/useSessionManagement";
import { Row } from "@/components/ui";

type SessionType = "agent" | "chat";

interface SessionItem {
  id: string;
  title: string;
  updatedAt: number;
  type: SessionType;
}

interface ChatHistorySidebarProps {
  allSessions: SessionItem[];
  isCurrentSession: (id: string, type: SessionType) => boolean;
  onSwitchSession: (id: string, type: SessionType) => void;
  onDeleteSession: (id: string, type: SessionType) => void;
  onClose: () => void;
}

export function ChatHistorySidebar({
  allSessions,
  isCurrentSession,
  onSwitchSession,
  onDeleteSession,
  onClose,
}: ChatHistorySidebarProps) {
  const { t } = useLocaleStore();

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-30 bg-foreground/20"
        onClick={onClose}
      />
      {/* Sidebar panel */}
      <motion.div
        initial={{ x: -240, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -240, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.2, 0.9, 0.1, 1] }}
        className="absolute left-0 top-0 z-40 flex h-full w-60 flex-col border-r border-border bg-background shadow-elev-2"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t.ai.historyChats}
          </h3>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-ui-sm text-muted-foreground transition-colors duration-fast ease-out-subtle hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
          {allSessions.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              {t.ai.noHistory}
            </div>
          ) : (
            allSessions.map((session) => {
              const isActive = isCurrentSession(session.id, session.type);
              const Icon = session.type === "agent" ? Bot : MessageSquare;
              return (
                <div key={session.id} className="group relative">
                  <Row
                    icon={<Icon size={16} />}
                    title={session.title}
                    description={formatSessionTime(session.updatedAt)}
                    selected={isActive}
                    onSelect={() => onSwitchSession(session.id, session.type)}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id, session.type);
                    }}
                    title={t.common.delete}
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-ui-sm text-muted-foreground opacity-0 transition-all duration-fast ease-out-subtle hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/40 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </>
  );
}
