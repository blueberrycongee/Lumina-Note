import { motion } from "framer-motion";
import { Bot, MessageSquare, Microscope, Trash2, X } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { formatSessionTime } from "./hooks/useSessionManagement";

type SessionType = "agent" | "chat" | "research";

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
        className="absolute inset-0 bg-black/20 z-30"
        onClick={onClose}
      />
      {/* Sidebar panel */}
      <motion.div
        initial={{ x: -240, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -240, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute left-0 top-0 h-full w-60 border-r border-border/60 bg-background shadow-lg z-40 flex flex-col"
      >
        <div className="p-3 border-b border-border/60 flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t.ai.historyChats}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
          >
            <X size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {allSessions.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground text-center">
              {t.ai.noHistory}
            </div>
          ) : (
            allSessions.map((session) => {
              const isActive = isCurrentSession(session.id, session.type);
              const IconComponent =
                session.type === "agent"
                  ? Bot
                  : session.type === "research"
                    ? Microscope
                    : MessageSquare;
              const iconColor =
                session.type === "agent"
                  ? "text-purple-500"
                  : session.type === "research"
                    ? "text-emerald-500"
                    : "text-muted-foreground";

              return (
                <div
                  key={session.id}
                  className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                    isActive ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                  onClick={() => onSwitchSession(session.id, session.type)}
                >
                  <IconComponent size={14} className={`shrink-0 ${iconColor}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{session.title}</div>
                    <div className="flex items-center gap-1">
                      {session.type === "agent" && (
                        <span className="text-[9px] text-purple-600 bg-purple-50 dark:bg-purple-900/30 px-1 rounded">
                          Agent
                        </span>
                      )}
                      {session.type === "research" && (
                        <span className="text-[9px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1 rounded">
                          Research
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatSessionTime(session.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id, session.type);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    title={t.common.delete}
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
