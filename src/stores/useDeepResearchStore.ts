/**
 * Deep Research Store
 *
 * 管理深度研究的状态和事件监听
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

// ============ 类型定义 ============

/** 研究阶段 */
export type ResearchPhase =
  | "init"
  | "analyzing_topic"
  | "waiting_for_clarification"  // 等待用户澄清
  | "searching_notes"
  | "searching_web"  // 搜索网络
  | "crawling_web"  // 爬取网页
  | "reading_notes"
  | "generating_outline"
  | "writing_report"
  | "completed"
  | "error";

/** 报告风格 */
export type ReportStyle = "detailed" | "summary" | "outline";

/** 笔记引用 */
export interface NoteReference {
  path: string;
  title: string;
  score: number;
  snippet?: string;
}

/** 网络搜索结果 */
export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

/** 大纲章节 */
export interface OutlineSection {
  heading: string;
  points: string[];
  related_notes: string[];
}

/** 报告大纲 */
export interface ReportOutline {
  title: string;
  sections: OutlineSection[];
}

/** 研究配置 */
export interface DeepResearchConfig {
  provider: string;
  model: string;
  api_key: string;
  base_url?: string;
  temperature?: number;
  max_search_results?: number;
  max_notes_to_read?: number;
  report_style?: ReportStyle;
  include_citations?: boolean;
  locale?: string;
  // 网络搜索配置
  enable_web_search?: boolean;
  tavily_api_key?: string;
  max_web_search_results?: number;
}

/** 研究请求 */
export interface DeepResearchRequest {
  topic: string;
  workspace_path: string;
  search_scope?: string;
  report_style: ReportStyle;
  include_citations: boolean;
  pre_searched_notes: NoteReference[];
}

/** 澄清信息 */
export interface ClarificationInfo {
  question: string;
  suggestions: string[];
  interruptId: string;
}

/** Token 使用统计 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 研究会话 */
export interface ResearchSession {
  id: string;
  chatId: string;  // 关联的聊天对话 ID
  topic: string;
  startedAt: Date;
  completedAt?: Date;  // 完成时间
  phase: ResearchPhase;
  phaseMessage: string;
  keywords: string[];
  foundNotes: NoteReference[];
  webSearchResults: WebSearchResult[];  // 网络搜索结果
  crawlingProgress: { current: number; total: number };  // 爬取进度
  readingProgress: { current: number; total: number };
  outline: ReportOutline | null;
  reportChunks: string[];
  finalReport: string | null;
  error: string | null;
  // 澄清相关
  clarification: ClarificationInfo | null;
  // Token 使用统计
  tokenUsage: TokenUsage;
}

// ============ Store 定义 ============

interface DeepResearchState {
  // 当前会话
  currentSession: ResearchSession | null;
  isRunning: boolean;
  // 是否等待澄清
  isWaitingForClarification: boolean;

  // 历史会话
  sessions: ResearchSession[];
  // 当前选中的会话 ID（查看历史时用）
  selectedSessionId: string | null;

  // 操作
  startResearch: (
    topic: string,
    workspacePath: string,
    config: DeepResearchConfig,
    options?: {
      chatId?: string;  // 关联的聊天对话 ID
      searchScope?: string;
      reportStyle?: ReportStyle;
      includeCitations?: boolean;
      preSearchedNotes?: NoteReference[];
    }
  ) => Promise<void>;
  abortResearch: () => Promise<void>;
  submitClarification: (clarification: string) => Promise<void>;
  reset: () => void;

  // 会话管理
  selectSession: (sessionId: string | null) => void;
  deleteSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  getSelectedSession: () => ResearchSession | null;

  // 内部方法
  _handleEvent: (event: DeepResearchEvent) => void;
  _setupListener: () => Promise<UnlistenFn>;
  _saveToHistory: () => void;
}

/** 后端事件类型 */
type DeepResearchEvent =
  | { type: "phase_change"; data: { phase: ResearchPhase; message: string } }
  | { type: "keywords_extracted"; data: { keywords: string[] } }
  | { type: "notes_found"; data: { notes: NoteReference[] } }
  | { type: "web_search_complete"; data: { results: WebSearchResult[] } }
  | {
      type: "crawling_page";
      data: { url: string; title: string; index: number; total: number };
    }
  | {
      type: "page_crawled";
      data: { url: string; title: string; content_preview: string };
    }
  | {
      type: "reading_note";
      data: { path: string; title: string; index: number; total: number };
    }
  | {
      type: "note_read";
      data: { path: string; title: string; summary?: string };
    }
  | { type: "outline_generated"; data: { outline: ReportOutline } }
  | { type: "report_chunk"; data: { content: string } }
  | { type: "token_usage"; data: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }
  | { type: "needs_clarification"; data: { question: string; suggestions: string[]; interrupt_id: string } }
  | { type: "complete"; data: { report: string } }
  | { type: "error"; data: { message: string } };

// ============ Store 实现 ============

const STORAGE_KEY = "deep-research-sessions";
const MAX_SESSIONS = 50;  // 最多保存 50 个会话

export const useDeepResearchStore = create<DeepResearchState>()(
  persist(
    (set, get) => ({
      currentSession: null,
      isRunning: false,
      isWaitingForClarification: false,
      sessions: [],
      selectedSessionId: null,

      startResearch: async (topic, workspacePath, config, options = {}) => {
    const {
      chatId = crypto.randomUUID(),  // 默认生成一个 ID
      searchScope,
      reportStyle = "detailed",
      includeCitations = true,
      preSearchedNotes = [],
    } = options;

    // 创建新会话
    const session: ResearchSession = {
      id: crypto.randomUUID(),
      chatId,
      topic,
      startedAt: new Date(),
      phase: "init",
      phaseMessage: "准备开始研究...",
      keywords: [],
      foundNotes: [],
      webSearchResults: [],
      crawlingProgress: { current: 0, total: 0 },
      readingProgress: { current: 0, total: 0 },
      outline: null,
      reportChunks: [],
      finalReport: null,
      error: null,
      clarification: null,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };

    set({ currentSession: session, isRunning: true });

    // 构建请求
    const request: DeepResearchRequest = {
      topic,
      workspace_path: workspacePath,
      search_scope: searchScope,
      report_style: reportStyle,
      include_citations: includeCitations,
      pre_searched_notes: preSearchedNotes,
    };

    try {
      console.log("[DeepResearch] Starting research:", { config, request });
      await invoke("deep_research_start", { config, request });
      console.log("[DeepResearch] Research started successfully");
    } catch (error) {
      console.error("[DeepResearch] Failed to start research:", error);
      set((state) => ({
        currentSession: state.currentSession
          ? {
              ...state.currentSession,
              phase: "error",
              error: String(error),
            }
          : null,
        isRunning: false,
      }));
    }
  },

  abortResearch: async () => {
    try {
      await invoke("deep_research_abort");
    } catch (error) {
      console.error("Failed to abort research:", error);
    }
    set({ isRunning: false, isWaitingForClarification: false });
  },

  submitClarification: async (clarification: string) => {
    const { currentSession } = get();
    if (!currentSession || !currentSession.clarification) {
      console.error("[DeepResearch] No clarification pending");
      return;
    }

    try {
      console.log("[DeepResearch] Submitting clarification:", clarification);
      await invoke("deep_research_resume", { clarification });
      
      // 更新状态
      set({
        isWaitingForClarification: false,
        currentSession: {
          ...currentSession,
          phase: "analyzing_topic",
          phaseMessage: "收到澄清，继续分析...",
          clarification: null,
        },
      });
    } catch (error) {
      console.error("[DeepResearch] Failed to submit clarification:", error);
      set({
        isWaitingForClarification: false,
        currentSession: {
          ...currentSession,
          phase: "error",
          error: String(error),
        },
        isRunning: false,
      });
    }
  },

  reset: () => {
    set({ currentSession: null, isRunning: false, selectedSessionId: null });
  },

  // ============ 会话管理 ============

  selectSession: (sessionId: string | null) => {
    if (!sessionId) {
      set({ selectedSessionId: null, currentSession: null });
      return;
    }
    // 从历史会话中恢复到 currentSession
    const { sessions } = get();
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      set({ selectedSessionId: sessionId, currentSession: session, isRunning: false });
    } else {
      set({ selectedSessionId: sessionId });
    }
  },

  deleteSession: (sessionId: string) => {
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
      selectedSessionId: state.selectedSessionId === sessionId ? null : state.selectedSessionId,
    }));
  },

  clearAllSessions: () => {
    set({ sessions: [], selectedSessionId: null });
  },

  getSelectedSession: () => {
    const { sessions, selectedSessionId } = get();
    if (!selectedSessionId) return null;
    return sessions.find((s) => s.id === selectedSessionId) || null;
  },

  _saveToHistory: () => {
    const { currentSession, sessions } = get();
    if (!currentSession) return;
    
    // 添加完成时间
    const sessionToSave: ResearchSession = {
      ...currentSession,
      completedAt: new Date(),
    };
    
    // 检查是否已存在
    const existingIndex = sessions.findIndex((s) => s.id === currentSession.id);
    let newSessions: ResearchSession[];
    
    if (existingIndex >= 0) {
      // 更新现有会话
      newSessions = [...sessions];
      newSessions[existingIndex] = sessionToSave;
    } else {
      // 添加新会话到开头
      newSessions = [sessionToSave, ...sessions];
    }
    
    // 限制最大数量
    if (newSessions.length > MAX_SESSIONS) {
      newSessions = newSessions.slice(0, MAX_SESSIONS);
    }
    
    set({ sessions: newSessions });
  },

  _handleEvent: (event) => {
    const { currentSession } = get();
    if (!currentSession) return;

    switch (event.type) {
      case "phase_change":
        set({
          currentSession: {
            ...currentSession,
            phase: event.data.phase,
            phaseMessage: event.data.message,
          },
        });
        break;

      case "keywords_extracted":
        set({
          currentSession: {
            ...currentSession,
            keywords: event.data.keywords,
          },
        });
        break;

      case "notes_found":
        set({
          currentSession: {
            ...currentSession,
            foundNotes: event.data.notes,
          },
        });
        break;

      case "web_search_complete":
        set({
          currentSession: {
            ...currentSession,
            webSearchResults: event.data.results,
          },
        });
        break;

      case "crawling_page":
        set({
          currentSession: {
            ...currentSession,
            crawlingProgress: {
              current: event.data.index,
              total: event.data.total,
            },
          },
        });
        break;

      case "page_crawled":
        // 可以更新已爬取页面的信息
        break;

      case "reading_note":
        set({
          currentSession: {
            ...currentSession,
            readingProgress: {
              current: event.data.index,
              total: event.data.total,
            },
          },
        });
        break;

      case "note_read":
        // 可以更新笔记的摘要信息
        break;

      case "outline_generated":
        set({
          currentSession: {
            ...currentSession,
            outline: event.data.outline,
          },
        });
        break;

      case "report_chunk":
        set({
          currentSession: {
            ...currentSession,
            reportChunks: [
              ...currentSession.reportChunks,
              event.data.content,
            ],
          },
        });
        break;

      case "token_usage":
        // 累加 token 使用量
        set({
          currentSession: {
            ...currentSession,
            tokenUsage: {
              promptTokens: currentSession.tokenUsage.promptTokens + event.data.prompt_tokens,
              completionTokens: currentSession.tokenUsage.completionTokens + event.data.completion_tokens,
              totalTokens: currentSession.tokenUsage.totalTokens + event.data.total_tokens,
            },
          },
        });
        break;

      case "needs_clarification":
        set({
          currentSession: {
            ...currentSession,
            phase: "waiting_for_clarification",
            phaseMessage: event.data.question,
            clarification: {
              question: event.data.question,
              suggestions: event.data.suggestions,
              interruptId: event.data.interrupt_id,
            },
          },
          isWaitingForClarification: true,
        });
        break;

      case "complete":
        set({
          currentSession: {
            ...currentSession,
            phase: "completed",
            finalReport: event.data.report,
            completedAt: new Date(),
          },
          isRunning: false,
        });
        // 保存到历史
        get()._saveToHistory();
        break;

      case "error":
        set({
          currentSession: {
            ...currentSession,
            phase: "error",
            error: event.data.message,
          },
          isRunning: false,
        });
        break;
    }
  },

  _setupListener: async () => {
    const unlisten = await listen<DeepResearchEvent>(
      "deep-research-event",
      (event) => {
        get()._handleEvent(event.payload);
      }
    );
    return unlisten;
  },
    }),
    {
      name: STORAGE_KEY,
      // 只持久化 sessions，不持久化运行状态
      partialize: (state) => ({
        sessions: state.sessions,
      }),
      // 合并时恢复 Date 对象
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<DeepResearchState>;
        return {
          ...current,
          sessions: (persistedState.sessions || []).map((s) => ({
            ...s,
            startedAt: new Date(s.startedAt),
            completedAt: s.completedAt ? new Date(s.completedAt) : undefined,
          })),
        };
      },
    }
  )
);

// ============ Hook: 自动监听事件 ============

let listenerSetup = false;
let unlistenFn: UnlistenFn | null = null;

export async function setupDeepResearchListener() {
  if (listenerSetup) return;
  listenerSetup = true;

  unlistenFn = await useDeepResearchStore.getState()._setupListener();
}

export function cleanupDeepResearchListener() {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
    listenerSetup = false;
  }
}

// ============ 辅助函数 ============

/** 获取阶段显示名称 */
export function getPhaseLabel(phase: ResearchPhase): string {
  const labels: Record<ResearchPhase, string> = {
    init: "初始化",
    analyzing_topic: "分析主题",
    waiting_for_clarification: "等待澄清",
    searching_notes: "搜索笔记",
    searching_web: "搜索网络",
    crawling_web: "爬取网页",
    reading_notes: "阅读笔记",
    generating_outline: "生成大纲",
    writing_report: "撰写报告",
    completed: "完成",
    error: "错误",
  };
  return labels[phase] || phase;
}

/** 获取阶段进度（0-100） */
export function getPhaseProgress(phase: ResearchPhase): number {
  const progress: Record<ResearchPhase, number> = {
    init: 0,
    analyzing_topic: 10,
    waiting_for_clarification: 10,  // 等待用户输入时暂停
    searching_notes: 20,
    searching_web: 30,
    crawling_web: 40,
    reading_notes: 55,
    generating_outline: 70,
    writing_report: 85,
    completed: 100,
    error: 0,
  };
  return progress[phase] || 0;
}

/** 阶段列表（用于进度展示） */
export const RESEARCH_PHASES: ResearchPhase[] = [
  "analyzing_topic",
  "searching_notes",
  "searching_web",
  "crawling_web",
  "reading_notes",
  "generating_outline",
  "writing_report",
];
