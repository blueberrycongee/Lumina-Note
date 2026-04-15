import { useMemo, useCallback } from "react";
import { useRustAgentStore } from "@/stores/useRustAgentStore";

export function formatSessionTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function useSessionManagement() {
  const {
    sessions: rustSessions,
    currentSessionId: rustSessionId,
    switchSession: rustSwitchSession,
    deleteSession: rustDeleteSession,
    clearChat: rustClearChat,
  } = useRustAgentStore();

  const allSessions = useMemo(() => {
    return rustSessions
      .map((s) => ({
        ...s,
        type: "agent" as const,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [rustSessions]);

  const handleSwitchSession = useCallback(
    (id: string, _type: "agent" | "chat") => {
      rustSwitchSession(id);
    },
    [rustSwitchSession],
  );

  const handleDeleteSession = useCallback(
    (id: string, _type: "agent" | "chat") => {
      rustDeleteSession(id);
    },
    [rustDeleteSession],
  );

  const isCurrentSession = useCallback(
    (id: string, _type: "agent" | "chat") => {
      return rustSessionId === id;
    },
    [rustSessionId],
  );

  const handleNewChat = useCallback(() => {
    rustClearChat();
  }, [rustClearChat]);

  return {
    allSessions,
    handleSwitchSession,
    handleDeleteSession,
    isCurrentSession,
    handleNewChat,
    rustSessionId,
    chatSessionId: "",
  };
}
