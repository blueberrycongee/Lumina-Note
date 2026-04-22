/**
 * 统一的会话管理 Hook
 *
 * Agent-only session management (chat mode removed)
 */

import { useMemo, useCallback } from "react";
import { useOpencodeAgent } from "@/stores/useOpencodeAgent";

export type SessionType = "agent" | "chat";

export interface UnifiedSession {
  id: string;
  title: string;
  type: SessionType;
  createdAt: number;
  updatedAt: number;
}

export function useConversationManager() {
  // Agent store — opencode-backed.
  const rustAgentStore = useOpencodeAgent();

  const agentSessions = rustAgentStore.sessions;
  const agentCurrentId = rustAgentStore.currentSessionId;
  const deleteAgentSession = rustAgentStore.deleteSession;
  const switchAgentSession = rustAgentStore.switchSession;
  const clearAgentChat = rustAgentStore.clearChat;

  // 统一会话列表 — agent-only
  const allSessions = useMemo<UnifiedSession[]>(() => {
    return agentSessions
      .map((s) => ({
        id: s.id,
        title: s.title,
        type: "agent" as const,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [agentSessions]);

  // 切换会话
  const handleSwitchSession = useCallback(
    (id: string, _type: SessionType) => {
      switchAgentSession(id);
    },
    [switchAgentSession],
  );

  // 删除会话
  const handleDeleteSession = useCallback(
    (id: string, _type: SessionType) => {
      deleteAgentSession(id);
    },
    [deleteAgentSession],
  );

  // 新建会话
  const handleNewConversation = useCallback(() => {
    clearAgentChat();
  }, [clearAgentChat]);

  // 判断是否当前会话
  const isCurrentSession = useCallback(
    (id: string, _type: SessionType): boolean => {
      return agentCurrentId === id;
    },
    [agentCurrentId],
  );

  // 获取当前会话 ID
  const currentSessionId = agentCurrentId;

  // 删除当前会话
  const handleDeleteCurrentSession = useCallback(() => {
    if (!currentSessionId) return;
    deleteAgentSession(currentSessionId);
  }, [currentSessionId, deleteAgentSession]);

  // 清空历史（保留当前会话）
  const handleClearHistory = useCallback(() => {
    agentSessions.forEach((s) => {
      if (s.id !== agentCurrentId) deleteAgentSession(s.id);
    });
  }, [agentSessions, agentCurrentId, deleteAgentSession]);

  return {
    // 状态
    chatMode: "agent" as const,
    allSessions,
    currentSessionId,

    // 操作
    handleSwitchSession,
    handleDeleteSession,
    handleNewConversation,
    handleDeleteCurrentSession,
    handleClearHistory,
    isCurrentSession,

    // 模式切换 (no-op for backwards compat)
    setChatMode: (_mode: string) => {},
  };
}
