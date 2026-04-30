import { useMemo, useCallback } from "react";
import { useOpencodeAgent } from "@/stores/useOpencodeAgent";

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
    sessions: agentSessions,
    currentSessionId: agentSessionId,
    switchSession: switchAgentSession,
    deleteSession: deleteAgentSession,
    clearChat: clearAgentChat,
  } = useOpencodeAgent();

  const allSessions = useMemo(() => {
    return agentSessions
      .map((s) => ({
        ...s,
        type: "agent" as const,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [agentSessions]);

  const handleSwitchSession = useCallback(
    (id: string, _type: "agent" | "chat") => {
      switchAgentSession(id);
    },
    [switchAgentSession],
  );

  const handleDeleteSession = useCallback(
    (id: string, _type: "agent" | "chat") => {
      deleteAgentSession(id);
    },
    [deleteAgentSession],
  );

  const isCurrentSession = useCallback(
    (id: string, _type: "agent" | "chat") => {
      return agentSessionId === id;
    },
    [agentSessionId],
  );

  const handleNewChat = useCallback(() => {
    clearAgentChat();
  }, [clearAgentChat]);

  return {
    allSessions,
    handleSwitchSession,
    handleDeleteSession,
    isCurrentSession,
    handleNewChat,
    agentSessionId,
    chatSessionId: "",
  };
}
