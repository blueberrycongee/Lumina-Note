/**
 * StateManager 测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateManager } from './StateManager';

describe('StateManager', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  describe('initial state', () => {
    it('should have idle status', () => {
      expect(manager.getStatus()).toBe('idle');
    });

    it('should have empty messages', () => {
      expect(manager.getMessages()).toEqual([]);
    });

    it('should have no pending tool', () => {
      expect(manager.getPendingTool()).toBeNull();
    });

    it('should have zero token usage', () => {
      const usage = manager.getTokenUsage();
      expect(usage.prompt).toBe(0);
      expect(usage.completion).toBe(0);
      expect(usage.total).toBe(0);
    });

    it('should have zero LLM request count', () => {
      expect(manager.getLLMRequestCount()).toBe(0);
    });
  });

  describe('setStatus', () => {
    it('should update status', () => {
      manager.setStatus('running');
      expect(manager.getStatus()).toBe('running');
    });

    it('should emit status_change event', () => {
      const handler = vi.fn();
      manager.on('status_change', handler);
      
      manager.setStatus('running');
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status_change',
          data: { previousStatus: 'idle', newStatus: 'running' },
        })
      );
    });

    it('should not emit if status unchanged', () => {
      const handler = vi.fn();
      manager.on('status_change', handler);
      
      manager.setStatus('idle');
      
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('messages', () => {
    it('should add message', () => {
      const message = { role: 'user' as const, content: 'Hello' };
      manager.addMessage(message);
      
      expect(manager.getMessages()).toHaveLength(1);
      expect(manager.getMessages()[0]).toEqual(message);
    });

    it('should emit message event', () => {
      const handler = vi.fn();
      manager.on('message', handler);
      
      const message = { role: 'assistant' as const, content: 'Hi' };
      manager.addMessage(message);
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'message', data: message })
      );
    });

    it('should set messages array', () => {
      const messages = [
        { role: 'user' as const, content: 'A' },
        { role: 'assistant' as const, content: 'B' },
      ];
      manager.setMessages(messages);
      
      expect(manager.getMessages()).toHaveLength(2);
    });

    it('should return copy of messages', () => {
      manager.addMessage({ role: 'user' as const, content: 'Test' });
      const messages = manager.getMessages();
      messages.push({ role: 'assistant' as const, content: 'Extra' });
      
      expect(manager.getMessages()).toHaveLength(1);
    });
  });

  describe('pending tool', () => {
    it('should set pending tool', () => {
      const tool = { name: 'read_note', params: { path: '/test.md' }, raw: '' };
      manager.setPendingTool(tool);
      
      expect(manager.getPendingTool()).toEqual(tool);
    });

    it('should emit tool_call event', () => {
      const handler = vi.fn();
      manager.on('tool_call', handler);
      
      const tool = { name: 'search_notes', params: { query: 'test' }, raw: '' };
      manager.setPendingTool(tool);
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'tool_call', data: tool })
      );
    });

    it('should clear pending tool', () => {
      manager.setPendingTool({ name: 'test', params: {}, raw: '' });
      manager.setPendingTool(null);
      
      expect(manager.getPendingTool()).toBeNull();
    });
  });

  describe('errors', () => {
    it('should increment errors', () => {
      manager.incrementErrors();
      manager.incrementErrors();
      
      expect(manager.getConsecutiveErrors()).toBe(2);
    });

    it('should reset errors', () => {
      manager.incrementErrors();
      manager.resetErrors();
      
      expect(manager.getConsecutiveErrors()).toBe(0);
    });

    it('should set error message', () => {
      const handler = vi.fn();
      manager.on('error', handler);
      
      manager.setError('Something went wrong');
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ data: { error: 'Something went wrong' } })
      );
    });
  });

  describe('LLM tracking', () => {
    it('should set LLM request start time', () => {
      const time = Date.now();
      manager.setLLMRequestStartTime(time);
      
      expect(manager.getLLMRequestStartTime()).toBe(time);
    });

    it('should increment request count', () => {
      manager.incrementLLMRequestCount();
      manager.incrementLLMRequestCount();
      
      expect(manager.getLLMRequestCount()).toBe(2);
    });

    it('should reset request count and time', () => {
      manager.setLLMRequestStartTime(Date.now());
      manager.incrementLLMRequestCount();
      manager.resetLLMRequestCount();
      
      expect(manager.getLLMRequestCount()).toBe(0);
      expect(manager.getLLMRequestStartTime()).toBeNull();
    });
  });

  describe('token usage', () => {
    it('should add token usage', () => {
      manager.addTokenUsage({ promptTokens: 100, completionTokens: 50 });
      
      const usage = manager.getTokenUsage();
      expect(usage.prompt).toBe(100);
      expect(usage.completion).toBe(50);
      expect(usage.total).toBe(150);
    });

    it('should accumulate token usage', () => {
      manager.addTokenUsage({ promptTokens: 100, completionTokens: 50 });
      manager.addTokenUsage({ promptTokens: 200, completionTokens: 100 });
      
      const usage = manager.getTokenUsage();
      expect(usage.prompt).toBe(300);
      expect(usage.completion).toBe(150);
    });

    it('should track total tokens used', () => {
      manager.addTokenUsage({ totalTokens: 100 });
      manager.addTokenUsage({ totalTokens: 200 });
      
      expect(manager.getTotalTokensUsed()).toBe(300);
    });

    it('should handle undefined usage', () => {
      manager.addTokenUsage(undefined);
      
      expect(manager.getTotalTokensUsed()).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      manager.setStatus('running');
      manager.addMessage({ role: 'user' as const, content: 'Test' });
      manager.incrementErrors();
      manager.addTokenUsage({ totalTokens: 100 });
      
      manager.reset();
      
      expect(manager.getStatus()).toBe('idle');
      expect(manager.getMessages()).toEqual([]);
      expect(manager.getConsecutiveErrors()).toBe(0);
      expect(manager.getTotalTokensUsed()).toBe(0);
    });
  });

  describe('event system', () => {
    it('should subscribe to events', () => {
      const handler = vi.fn();
      manager.on('message', handler);
      
      manager.addMessage({ role: 'user' as const, content: 'Test' });
      
      expect(handler).toHaveBeenCalled();
    });

    it('should unsubscribe via returned function', () => {
      const handler = vi.fn();
      const unsubscribe = manager.on('message', handler);
      
      unsubscribe();
      manager.addMessage({ role: 'user' as const, content: 'Test' });
      
      expect(handler).not.toHaveBeenCalled();
    });

    it('should unsubscribe via off method', () => {
      const handler = vi.fn();
      manager.on('message', handler);
      
      manager.off('message', handler);
      manager.addMessage({ role: 'user' as const, content: 'Test' });
      
      expect(handler).not.toHaveBeenCalled();
    });

    it('should include timestamp in events', () => {
      const handler = vi.fn();
      manager.on('message', handler);
      
      const before = Date.now();
      manager.addMessage({ role: 'user' as const, content: 'Test' });
      const after = Date.now();
      
      const event = handler.mock.calls[0][0];
      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle handler errors gracefully', () => {
      const badHandler = vi.fn(() => { throw new Error('Handler error'); });
      const goodHandler = vi.fn();
      
      manager.on('message', badHandler);
      manager.on('message', goodHandler);
      
      // Should not throw
      expect(() => {
        manager.addMessage({ role: 'user' as const, content: 'Test' });
      }).not.toThrow();
      
      // Good handler should still be called
      expect(goodHandler).toHaveBeenCalled();
    });
  });

  describe('task', () => {
    it('should set task', () => {
      manager.setTask('Write a note');
      expect(manager.getState().currentTask).toBe('Write a note');
    });

    it('should clear task', () => {
      manager.setTask('Task');
      manager.setTask(null);
      expect(manager.getState().currentTask).toBeNull();
    });
  });

  describe('LLM config', () => {
    it('should set LLM config', () => {
      const config = { model: 'gpt-4' };
      manager.setLLMConfig(config);
      
      expect(manager.getLLMConfig()).toEqual(config);
    });

    it('should handle undefined config', () => {
      manager.setLLMConfig({ model: 'test' });
      manager.setLLMConfig(undefined);
      
      expect(manager.getLLMConfig()).toBeUndefined();
    });
  });
});
