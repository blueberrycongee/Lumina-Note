import { useMemo, useCallback } from "react";
import { useRustAgentStore } from "@/stores/useRustAgentStore";
import { useAIStore } from "@/stores/useAIStore";
import { useUIStore } from "@/stores/useUIStore";
import { useShallow } from "zustand/react/shallow";

export function formatSessionTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function useSessionManagement() {
  const chatMode = useUIStore((s) => s.chatMode);
  const setChatMode = useUIStore((s) => s.setChatMode);

  const {
    sessions: rustSessions,
    currentSessionId: rustSessionId,
    createSession: rustCreateSession,
    switchSession: rustSwitchSession,
    deleteSession: rustDeleteSession,
    clearChat: rustClearChat,
  } = useRustAgentStore();

  const {
    sessions: chatSessions,
    currentSessionId: chatSessionId,
    createSession: createChatSession,
    switchSession: switchChatSession,
    deleteSession: deleteChatSession,
  } = useAIStore(
    useShallow((state) => ({
      sessions: state.sessions,
      currentSessionId: state.currentSessionId,
      createSession: state.createSession,
      switchSession: state.switchSession,
      deleteSession: state.deleteSession,
    })),
  );

  const allSessions = useMemo(() => {
    const agentList = rustSessions.map((s) => ({
      ...s,
      type: "agent" as const,
    }));
    const chatList = chatSessions.map((s) => ({
      ...s,
      type: "chat" as const,
    }));
    return [...agentList, ...chatList].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }, [rustSessions, chatSessions]);

  const createSession =
    chatMode === "agent" ? rustCreateSession : createChatSession;

  const handleSwitchSession = useCallback(
    (id: string, type: "agent" | "chat") => {
      if (type === "agent") {
        rustSwitchSession(id);
        if (chatMode !== "agent") setChatMode("agent");
      } else {
        switchChatSession(id);
        if (chatMode !== "chat") setChatMode("chat");
      }
    },
    [chatMode, setChatMode, rustSwitchSession, switchChatSession],
  );

  const handleDeleteSession = useCallback(
    (id: string, type: "agent" | "chat") => {
      if (type === "agent") {
        rustDeleteSession(id);
      } else {
        deleteChatSession(id);
      }
    },
    [rustDeleteSession, deleteChatSession],
  );

  const isCurrentSession = useCallback(
    (id: string, type: "agent" | "chat") => {
      if (type === "agent") {
        return chatMode === "agent" && rustSessionId === id;
      }
      return chatMode === "chat" && chatSessionId === id;
    },
    [chatMode, rustSessionId, chatSessionId],
  );

  const handleNewChat = useCallback(() => {
    if (chatMode === "codex") return;
    if (chatMode === "agent") {
      rustClearChat();
    } else {
      createSession();
    }
  }, [chatMode, rustClearChat, createSession]);

  return {
    allSessions,
    createSession,
    handleSwitchSession,
    handleDeleteSession,
    isCurrentSession,
    handleNewChat,
    rustSessionId,
    chatSessionId,
  };
}
