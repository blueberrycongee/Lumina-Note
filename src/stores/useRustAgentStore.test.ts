/**
 * useRustAgentStore 测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';

// Mock dependencies before importing the store
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@/lib/ai', () => ({
  getAIConfig: vi.fn(() => ({
    provider: 'openai',
    model: 'gpt-4',
    apiKey: 'test-key',
  })),
}));

// Import after mocks
import { useRustAgentStore } from './useRustAgentStore';

describe('useRustAgentStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const store = useRustAgentStore.getState();
    store.clearChat();
    
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
      const initialSessionId = store.currentSessionId;
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
  });
});
