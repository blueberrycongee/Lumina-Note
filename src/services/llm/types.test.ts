/**
 * LLM Types 测试 - 主要测试 LLMProviderType 和基础类型
 */
import { describe, it, expect } from 'vitest';
import type { LLMProviderType } from './types';

const allProviders: LLMProviderType[] = [
  'anthropic',
  'openai',
  'google',
  'deepseek',
  'moonshot',
  'groq',
  'openrouter',
  'ollama',
  'openai-compatible',
];

describe('LLMProviderType', () => {
  it('should be a valid union type with 9 providers', () => {
    expect(allProviders.length).toBe(9);
    expect(allProviders).toContain('anthropic');
    expect(allProviders).toContain('openai');
    expect(allProviders).toContain('google');
    expect(allProviders).toContain('deepseek');
    // W5: moonshot promoted to top-level provider.
    expect(allProviders).toContain('moonshot');
    expect(allProviders).toContain('groq');
    expect(allProviders).toContain('openrouter');
    expect(allProviders).toContain('ollama');
    expect(allProviders).toContain('openai-compatible');
  });

  it('should not include old provider IDs', () => {
    const oldProviders = ['gemini', 'zai', 'custom'];
    for (const old of oldProviders) {
      expect(allProviders).not.toContain(old);
    }
  });
});
