/**
 * 统一的会话管理 Hook
 * 
 * 从 MainAIChatShell 抽取的会话管理逻辑，供 ConversationList 等组件复用
 * 支持 Agent / Chat / Research 三种会话类型
 */

import { useMemo, useCallback } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { useRustAgentStore } from "@/stores/useRustAgentStore";
import { useDeepResearchStore } from "@/stores/useDeepResearchStore";

export type SessionType = "agent" | "chat" | "research";

export interface UnifiedSession {
  id: string;
  title: string;
  type: SessionType;
  createdAt: number;
  updatedAt: number;
}

export function useConversationManager() {
  const { chatMode, setChatMode } = useUIStore();

  // Chat store
  const {
    sessions: chatSessions,
    currentSessionId: chatCurrentId,
    createSession: createChatSession,
    deleteSession: deleteChatSession,
    switchSession: switchChatSession,
  } = useAIStore();

  // Agent store - 使用 Rust Agent
  const rustAgentStore = useRustAgentStore();

  const agentSessions = rustAgentStore.sessions;
  const agentCurrentId = rustAgentStore.currentSessionId;
  const createAgentSession = rustAgentStore.createSession;
  const deleteAgentSession = rustAgentStore.deleteSession;
  const switchAgentSession = rustAgentStore.switchSession;
  const clearAgentChat = rustAgentStore.clearChat;

  // Deep Research store
  const {
    sessions: researchSessions,
    selectedSessionId: researchSelectedId,
    selectSession: selectResearchSession,
    deleteSession: deleteResearchSession,
    reset: resetResearch,
  } = useDeepResearchStore();

  // 统一会话列表 - 合并所有类型，按更新时间排序
  const allSessions = useMemo<UnifiedSession[]>(() => {
    const agentList = agentSessions.map(s => ({
      id: s.id,
      title: s.title,
      type: "agent" as const,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
    
    const chatList = chatSessions.map(s => ({
      id: s.id,
      title: s.title,
      type: "chat" as const,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
    
    const researchList = researchSessions.map(s => ({
      id: s.id,
      title: s.topic,  // Research 用 topic 作为 title
      type: "research" as const,
      createdAt: s.startedAt.getTime(),
      updatedAt: (s.completedAt || s.startedAt).getTime(),
    }));
    
    return [...agentList, ...chatList, ...researchList].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [agentSessions, chatSessions, researchSessions]);

  // 切换会话
  const handleSwitchSession = useCallback((id: string, type: SessionType) => {
    if (type === "agent") {
      switchAgentSession(id);
      if (chatMode !== "agent") setChatMode("agent");
    } else if (type === "research") {
      selectResearchSession(id);
      if (chatMode !== "research") setChatMode("research");
    } else {
      switchChatSession(id);
      if (chatMode !== "chat") setChatMode("chat");
    }
  }, [chatMode, setChatMode, switchAgentSession, switchChatSession, selectResearchSession]);

  // 删除会话
  const handleDeleteSession = useCallback((id: string, type: SessionType) => {
    if (type === "agent") {
      deleteAgentSession(id);
    } else if (type === "research") {
      deleteResearchSession(id);
    } else {
      deleteChatSession(id);
    }
  }, [deleteAgentSession, deleteChatSession, deleteResearchSession]);

  // 新建会话
  const handleNewConversation = useCallback(() => {
    if (chatMode === "research") {
      // Research 模式: 重置当前研究会话
      resetResearch();
    } else if (chatMode === "agent") {
      // Rust Agent: 清空消息
      clearAgentChat();
    } else {
      createChatSession();
    }
  }, [chatMode, createAgentSession, createChatSession, clearAgentChat, resetResearch]);

  // 判断是否当前会话
  const isCurrentSession = useCallback((id: string, type: SessionType): boolean => {
    if (type === "agent") {
      return chatMode === "agent" && agentCurrentId === id;
    }
    if (type === "research") {
      return researchSelectedId === id;
    }
    return chatMode === "chat" && chatCurrentId === id;
  }, [chatMode, agentCurrentId, chatCurrentId, researchSelectedId]);

  // 获取当前会话 ID（按模式）
  const currentSessionId = useMemo(() => {
    if (chatMode === "agent") return agentCurrentId;
    if (chatMode === "research") return researchSelectedId;
    return chatCurrentId;
  }, [chatMode, agentCurrentId, chatCurrentId, researchSelectedId]);

  // 删除当前会话
  const handleDeleteCurrentSession = useCallback(() => {
    if (!currentSessionId) return;
    
    if (chatMode === "agent") {
      deleteAgentSession(currentSessionId);
    } else if (chatMode === "research") {
      deleteResearchSession(currentSessionId);
    } else {
      deleteChatSession(currentSessionId);
    }
  }, [chatMode, currentSessionId, deleteAgentSession, deleteChatSession, deleteResearchSession]);

  // 清空当前模式的历史（保留当前会话）
  const handleClearHistory = useCallback(() => {
    if (chatMode === "agent") {
      agentSessions.forEach(s => {
        if (s.id !== agentCurrentId) deleteAgentSession(s.id);
      });
    } else if (chatMode === "research") {
      researchSessions.forEach(s => {
        if (s.id !== researchSelectedId) deleteResearchSession(s.id);
      });
    } else {
      chatSessions.forEach(s => {
        if (s.id !== chatCurrentId) deleteChatSession(s.id);
      });
    }
  }, [
    chatMode,
    agentSessions, agentCurrentId, deleteAgentSession,
    chatSessions, chatCurrentId, deleteChatSession,
    researchSessions, researchSelectedId, deleteResearchSession,
  ]);

  return {
    // 状态
    chatMode,
    allSessions,
    currentSessionId,
    
    // 操作
    handleSwitchSession,
    handleDeleteSession,
    handleNewConversation,
    handleDeleteCurrentSession,
    handleClearHistory,
    isCurrentSession,
    
    // 模式切换
    setChatMode,
  };
}
