/**
 * LLM 配置管理测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setLLMConfig, getLLMConfig, resetLLMConfig } from './config';

describe('LLM Config', () => {
  beforeEach(() => {
    // 每个测试前重置配置
    resetLLMConfig();
  });

  describe('getLLMConfig', () => {
    it('should return default config initially', () => {
      const config = getLLMConfig();
      expect(config.provider).toBe('moonshot');
      expect(config.model).toBe('kimi-k2.5');
      expect(config.thinkingMode).toBe('auto');
      expect(config.temperature).toBeUndefined();
      expect(config.apiKey).toBe('');
    });

    it('should return a copy, not the original object', () => {
      const config1 = getLLMConfig();
      const config2 = getLLMConfig();
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('setLLMConfig', () => {
    it('should update single property', () => {
      setLLMConfig({ apiKey: 'test-key' });
      const config = getLLMConfig();
      expect(config.apiKey).toBe('test-key');
      // Other properties should remain unchanged
      expect(config.provider).toBe('moonshot');
    });

    it('should update multiple properties', () => {
      setLLMConfig({
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-xxx',
      });
      const config = getLLMConfig();
      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-4o');
      expect(config.apiKey).toBe('sk-xxx');
    });

    it('should merge with existing config', () => {
      setLLMConfig({ provider: 'anthropic' });
      setLLMConfig({ model: 'claude-3-opus' });
      const config = getLLMConfig();
      expect(config.provider).toBe('anthropic');
      expect(config.model).toBe('claude-3-opus');
    });

    it('should update routing config', () => {
      setLLMConfig({
        routing: {
          enabled: true,
          targetIntents: ['chat', 'search'],
        },
      });
      const config = getLLMConfig();
      expect(config.routing?.enabled).toBe(true);
      expect(config.routing?.targetIntents).toEqual(['chat', 'search']);
    });
  });

  describe('resetLLMConfig', () => {
    it('should reset to default values', () => {
      // First modify the config
      setLLMConfig({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      
      // Then reset
      resetLLMConfig();
      
      const config = getLLMConfig();
      expect(config.provider).toBe('moonshot');
      expect(config.apiKey).toBe('');
      expect(config.model).toBe('kimi-k2.5');
      expect(config.thinkingMode).toBe('auto');
    });
  });
});
