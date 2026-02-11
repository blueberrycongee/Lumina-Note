/**
 * LLM Factory 测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createProvider } from './factory';
import { setLLMConfig, resetLLMConfig } from './config';

// Mock console to suppress debug logs
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('createProvider', () => {
  beforeEach(() => {
    resetLLMConfig();
    vi.clearAllMocks();
  });

  describe('API Key validation', () => {
    it('should throw error when API key is missing (non-ollama)', () => {
      setLLMConfig({ provider: 'openai', model: 'gpt-4o' });
      expect(() => createProvider()).toThrow('请先配置 openai 的 API Key');
    });

    it('should not throw for ollama without API key', () => {
      setLLMConfig({ provider: 'ollama', model: 'llama3.2' });
      expect(() => createProvider()).not.toThrow();
    });

    it('should work when API key is provided', () => {
      setLLMConfig({ 
        provider: 'openai', 
        model: 'gpt-4o',
        apiKey: 'sk-test-key' 
      });
      const provider = createProvider();
      expect(provider).toBeTruthy();
    });
  });

  describe('Provider creation', () => {
    const providers = [
      { name: 'anthropic', model: 'claude-sonnet-4-5' },
      { name: 'openai', model: 'gpt-5.2' },
      { name: 'gemini', model: 'gemini-2.5-pro' },
      { name: 'moonshot', model: 'kimi-k2.5' },
      { name: 'deepseek', model: 'deepseek-chat' },
      { name: 'zai', model: 'glm-4.7' },
      { name: 'groq', model: 'meta-llama/llama-4-maverick-17b-128e-instruct' },
      { name: 'openrouter', model: 'openai/gpt-5.2' },
    ] as const;

    it.each(providers)('should create $name provider', ({ name, model }) => {
      setLLMConfig({ 
        provider: name as any, 
        model,
        apiKey: 'test-key' 
      });
      const provider = createProvider();
      expect(provider).toBeTruthy();
      expect(provider.call).toBeInstanceOf(Function);
    });

    it('should create ollama provider without API key', () => {
      setLLMConfig({ provider: 'ollama', model: 'llama3.2' });
      const provider = createProvider();
      expect(provider).toBeTruthy();
    });
  });

  describe('Config override', () => {
    it('should use override config over global config', () => {
      setLLMConfig({ 
        provider: 'openai', 
        model: 'gpt-5.2-mini',
        apiKey: 'global-key' 
      });
      
      // Override with different provider
      const provider = createProvider({
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        apiKey: 'override-key',
      });
      
      expect(provider).toBeTruthy();
    });

    it('should merge partial override with global config', () => {
      setLLMConfig({ 
        provider: 'openai', 
        model: 'gpt-4o',
        apiKey: 'test-key',
        temperature: 0.5,
      });
      
      // Only override model
      const provider = createProvider({ model: 'gpt-5-mini' });
      expect(provider).toBeTruthy();
    });
  });

  describe('Thinking mode resolution', () => {
    it('should switch deepseek chat to reasoner when thinking mode is enabled', () => {
      setLLMConfig({
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'test-key',
        thinkingMode: 'thinking',
      });

      const provider = createProvider() as any;
      expect(provider.config.model).toBe('deepseek-reasoner');
      expect(provider.config.thinkingMode).toBe('thinking');
    });

    it('should switch deepseek reasoner to chat when instant mode is enabled', () => {
      setLLMConfig({
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        apiKey: 'test-key',
        thinkingMode: 'instant',
      });

      const provider = createProvider() as any;
      expect(provider.config.model).toBe('deepseek-chat');
      expect(provider.config.thinkingMode).toBe('instant');
    });
  });

  describe('Custom model handling', () => {
    it('should use customModelId when model is "custom"', () => {
      setLLMConfig({ 
        provider: 'openai', 
        model: 'custom',
        customModelId: 'my-fine-tuned-model',
        apiKey: 'test-key' 
      });
      
      const provider = createProvider();
      expect(provider).toBeTruthy();
    });

    it('should ignore customModelId when model is not "custom"', () => {
      setLLMConfig({ 
        provider: 'openai', 
        model: 'gpt-4o',
        customModelId: 'my-fine-tuned-model',
        apiKey: 'test-key' 
      });
      
      const provider = createProvider();
      expect(provider).toBeTruthy();
    });
  });

  describe('Unsupported provider', () => {
    it('should throw for unsupported provider', () => {
      setLLMConfig({ 
        provider: 'unknown-provider' as any,
        model: 'some-model',
        apiKey: 'test-key' 
      });
      expect(() => createProvider()).toThrow('不支持的 AI 提供商');
    });
  });
});
