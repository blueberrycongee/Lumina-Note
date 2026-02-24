/**
 * useRustAgentStore 测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';

const callLLMMock = vi.hoisted(() => vi.fn());
const getAIConfigMock = vi.hoisted(() => vi.fn(() => ({
  provider: 'openai',
  model: 'gpt-4',
  apiKey: 'test-key',
  baseUrl: undefined,
})));

// Mock dependencies before importing the store
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@/services/ai/ai', () => ({
  getAIConfig: getAIConfigMock,
}));

vi.mock('@/services/llm', () => ({
  callLLM: callLLMMock,
  normalizeThinkingMode: (mode: unknown) =>
    mode === "thinking" || mode === "instant" || mode === "auto" ? mode : "auto",
  supportsThinkingModeSwitch: () => false,
  PROVIDER_REGISTRY: {
    openai: {
      models: [
        { id: 'gpt-4', contextWindow: 8192 },
        { id: 'custom', contextWindow: 8192 },
      ],
    },
  },
}));

vi.mock('@/stores/useLocaleStore', () => ({
  getCurrentTranslations: () => ({
    common: { newConversation: '新对话' },
    ai: { apiKeyRequired: '请先配置 API Key', contextSummaryTitle: 'Context Summary' },
    prompts: {
      contextSummary: { system: 'Summarize the conversation.' },
    },
  }),
}));

// Import after mocks
import { useRustAgentStore, type Message } from './useRustAgentStore';

describe('useRustAgentStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const store = useRustAgentStore.getState();
    store.clearChat();
    callLLMMock.mockReset();
    
    // Reset to initial session
    useRustAgentStore.setState({
      sessions: [{
        id: 'default-rust-session',
        title: '新对话',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalTokensUsed: 0,
      }],
      currentSessionId: 'default-rust-session',
      totalTokensUsed: 0,
      autoCompactEnabled: true,
      pendingCompaction: false,
      isCompacting: false,
      lastTokenUsage: null,
    });
  });

  describe('Initial State', () => {
    it('should have idle status initially', () => {
      const state = useRustAgentStore.getState();
      expect(state.status).toBe('idle');
    });

    it('should have empty messages initially', () => {
      const state = useRustAgentStore.getState();
      expect(state.messages).toEqual([]);
    });

    it('should have a default session', () => {
      const state = useRustAgentStore.getState();
      expect(state.sessions.length).toBeGreaterThan(0);
      expect(state.currentSessionId).toBeTruthy();
    });
  });

  describe('Session Management', () => {
    it('should create a new session', () => {
      const store = useRustAgentStore.getState();
      const initialSessionCount = store.sessions.length;
      
      act(() => {
        store.createSession('Test Session');
      });
      
      const newState = useRustAgentStore.getState();
      expect(newState.sessions.length).toBe(initialSessionCount + 1);
      expect(newState.sessions.find(s => s.title === 'Test Session')).toBeTruthy();
    });

    it('should switch between sessions', async () => {
      const store = useRustAgentStore.getState();
      const initialSessionId = store.currentSessionId;
      
      // Create a new session
      act(() => {
        store.createSession('Session 2');
      });
      
      const afterCreate = useRustAgentStore.getState();
      const session2Id = afterCreate.currentSessionId;
      
      // Session ID should be different from initial
      expect(session2Id).not.toBe(initialSessionId);
      
      // Switch back to initial session
      act(() => {
        afterCreate.switchSession(initialSessionId!);
      });
      
      const finalState = useRustAgentStore.getState();
      expect(finalState.currentSessionId).toBe(initialSessionId);
    });

    it('should delete a session', () => {
      const store = useRustAgentStore.getState();
      const initialCount = store.sessions.length;
      
      // Create a new session
      act(() => {
        store.createSession('Session To Delete');
      });
      
      const afterCreate = useRustAgentStore.getState();
      const newSessionId = afterCreate.currentSessionId;
      
      // Verify we have one more session
      expect(afterCreate.sessions.length).toBe(initialCount + 1);
      
      // Delete the new session
      act(() => {
        afterCreate.deleteSession(newSessionId!);
      });
      
      const afterDelete = useRustAgentStore.getState();
      expect(afterDelete.sessions.length).toBe(initialCount);
      expect(afterDelete.sessions.find(s => s.id === newSessionId)).toBeUndefined();
      // Should switch to another session after deleting current
      expect(afterDelete.currentSessionId).not.toBe(newSessionId);
    });

    it('should rename a session', () => {
      const store = useRustAgentStore.getState();
      const currentSessionId = store.currentSessionId;
      
      act(() => {
        store.renameSession(currentSessionId!, 'New Name');
      });
      
      const afterRename = useRustAgentStore.getState();
      const session = afterRename.sessions.find(s => s.id === currentSessionId);
      expect(session?.title).toBe('New Name');
    });
  });

  describe('clearChat', () => {
    it('should clear messages and reset status', () => {
      // Manually set some state
      useRustAgentStore.setState({
        messages: [{ role: 'user', content: 'test' }],
        status: 'completed',
        error: 'some error',
      });
      
      const store = useRustAgentStore.getState();
      
      act(() => {
        store.clearChat();
      });
      
      const afterClear = useRustAgentStore.getState();
      expect(afterClear.messages).toEqual([]);
      expect(afterClear.status).toBe('idle');
      expect(afterClear.error).toBe(null);
    });
  });

  describe('startTask', () => {
    it('should fail fast when api key is missing', async () => {
      getAIConfigMock.mockReturnValueOnce({
        provider: 'openai',
        model: 'gpt-4',
        apiKey: '',
        baseUrl: undefined,
      });

      const store = useRustAgentStore.getState();
      await store.startTask('hello', { workspace_path: '/tmp' });

      const state = useRustAgentStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toContain('API Key');
    });
  });

  describe('autoApprove', () => {
    it('should set autoApprove value', () => {
      const store = useRustAgentStore.getState();
      
      act(() => {
        store.setAutoApprove(true);
      });
      
      expect(useRustAgentStore.getState().autoApprove).toBe(true);
      
      act(() => {
        store.setAutoApprove(false);
      });
      
      expect(useRustAgentStore.getState().autoApprove).toBe(false);
    });
  });

  describe('_handleEvent', () => {
    it('should handle status_change event', () => {
      const store = useRustAgentStore.getState();
      
      act(() => {
        store._handleEvent({ type: 'status_change', data: { status: 'running' } });
      });
      
      expect(useRustAgentStore.getState().status).toBe('running');
    });

    it('should handle message_chunk event', () => {
      const store = useRustAgentStore.getState();
      
      // Set running status first
      useRustAgentStore.setState({ status: 'running' });
      
      act(() => {
        store._handleEvent({
          type: 'message_chunk',
          data: { content: 'Hello ', agent: 'coordinator' },
        });
      });
      
      expect(useRustAgentStore.getState().streamingContent).toBe('Hello ');
      
      act(() => {
        store._handleEvent({
          type: 'message_chunk',
          data: { content: 'World', agent: 'coordinator' },
        });
      });
      
      expect(useRustAgentStore.getState().streamingContent).toBe('Hello World');
    });

    it('should handle token_usage event', () => {
      const store = useRustAgentStore.getState();
      
      act(() => {
        store._handleEvent({
          type: 'token_usage',
          data: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        });
      });
      
      expect(useRustAgentStore.getState().totalTokensUsed).toBe(150);
    });

    it('should handle error event', () => {
      const store = useRustAgentStore.getState();
      
      act(() => {
        store._handleEvent({
          type: 'error',
          data: { message: 'Something went wrong' },
        });
      });
      
      expect(useRustAgentStore.getState().error).toBe('Something went wrong');
    });

    it('should handle llm_retry_scheduled event', () => {
      const store = useRustAgentStore.getState();

      act(() => {
        store._handleEvent({
          type: 'llm_retry_scheduled',
          data: {
            request_id: 'req-123',
            attempt: 2,
            max_retries: 3,
            delay_ms: 1500,
            reason: 'HTTP 429',
            next_retry_at: 1700000000000,
          },
        });
      });

      expect(useRustAgentStore.getState().llmRetryState).toEqual({
        requestId: 'req-123',
        attempt: 2,
        maxRetries: 3,
        delayMs: 1500,
        reason: 'HTTP 429',
        nextRetryAt: 1700000000000,
      });
    });

    it('should clear llmRetryState on llm_request_end', () => {
      useRustAgentStore.setState({
        llmRetryState: {
          requestId: 'req-123',
          attempt: 1,
          maxRetries: 3,
          delayMs: 1000,
          reason: 'timeout',
          nextRetryAt: 1700000000000,
        },
        llmRequestId: 'req-123',
        llmRequestStartTime: 1700000000000,
      });
      const store = useRustAgentStore.getState();

      act(() => {
        store._handleEvent({
          type: 'llm_request_end',
          data: { request_id: 'req-123' },
        });
      });

      const state = useRustAgentStore.getState();
      expect(state.llmRetryState).toBeNull();
      expect(state.llmRequestId).toBeNull();
      expect(state.llmRequestStartTime).toBeNull();
    });

    it('should clear llmRetryState on run_completed', () => {
      useRustAgentStore.setState({
        llmRetryState: {
          requestId: 'req-123',
          attempt: 3,
          maxRetries: 3,
          delayMs: 3000,
          reason: 'gateway timeout',
          nextRetryAt: 1700000003000,
        },
      });
      const store = useRustAgentStore.getState();

      act(() => {
        store._handleEvent({
          type: 'run_completed',
          data: {},
        });
      });

      expect(useRustAgentStore.getState().llmRetryState).toBeNull();
    });
  });

  describe('_compactSession', () => {
    it('should preserve messages added during compaction', async () => {
      const store = useRustAgentStore.getState();

      const baseMessages: Message[] = [
        { role: 'user', content: 'm1' },
        { role: 'assistant', content: 'm2' },
        { role: 'user', content: 'm3' },
        { role: 'assistant', content: 'm4' },
        { role: 'user', content: 'm5' },
        { role: 'assistant', content: 'm6' },
        { role: 'user', content: 'm7' },
        { role: 'assistant', content: 'm8' },
      ];

      useRustAgentStore.setState({
        messages: baseMessages,
        pendingCompaction: true,
      });

      const resolveRef: { current?: (value: { content: string }) => void } = {};
      const callPromise = new Promise<{ content: string }>((resolve) => {
        resolveRef.current = resolve;
      });
      callLLMMock.mockReturnValue(callPromise);

      const compactionPromise = store._compactSession();

      useRustAgentStore.setState((state) => ({
        messages: [...state.messages, { role: 'user', content: 'late-message' }],
      }));

      resolveRef.current?.({ content: '- summary' });
      await compactionPromise;

      const finalMessages = useRustAgentStore.getState().messages;
      const hasLateMessage = finalMessages.some((msg) => msg.content === 'late-message');
      expect(hasLateMessage).toBe(true);
    });

    it('should not overwrite messages after session switch during compaction', async () => {
      const store = useRustAgentStore.getState();

      useRustAgentStore.setState({
        sessions: [
          {
            id: 'default-rust-session',
            title: '新对话',
            messages: [
              { role: 'user', content: 's1-m1' },
              { role: 'assistant', content: 's1-m2' },
              { role: 'user', content: 's1-m3' },
              { role: 'assistant', content: 's1-m4' },
              { role: 'user', content: 's1-m5' },
              { role: 'assistant', content: 's1-m6' },
              { role: 'user', content: 's1-m7' },
            ],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            totalTokensUsed: 0,
          },
          {
            id: 'rust-session-2',
            title: 'Session 2',
            messages: [{ role: 'user', content: 's2-m1' }],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            totalTokensUsed: 0,
          },
        ],
        currentSessionId: 'default-rust-session',
        messages: [
          { role: 'user', content: 's1-m1' },
          { role: 'assistant', content: 's1-m2' },
          { role: 'user', content: 's1-m3' },
          { role: 'assistant', content: 's1-m4' },
          { role: 'user', content: 's1-m5' },
          { role: 'assistant', content: 's1-m6' },
          { role: 'user', content: 's1-m7' },
        ],
        pendingCompaction: true,
      });

      const resolveRef: { current?: (value: { content: string }) => void } = {};
      const callPromise = new Promise<{ content: string }>((resolve) => {
        resolveRef.current = resolve;
      });
      callLLMMock.mockReturnValue(callPromise);

      const compactionPromise = store._compactSession();

      act(() => {
        store.switchSession('rust-session-2');
      });

      resolveRef.current?.({ content: '- summary' });
      await compactionPromise;

      const stateAfter = useRustAgentStore.getState();
      expect(stateAfter.currentSessionId).toBe('rust-session-2');
      expect(stateAfter.messages).toEqual([{ role: 'user', content: 's2-m1' }]);
    });
  });
});
