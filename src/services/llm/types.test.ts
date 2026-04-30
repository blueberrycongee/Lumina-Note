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
  'glm',
  'mimo',
  'groq',
  'openrouter',
  'ollama',
  'openai-compatible',
];

describe('LLMProviderType', () => {
  it('should be a valid union type with 11 top-level providers', () => {
    // W5: moonshot promoted; W6: glm + mimo promoted. MiMo Token Plan is an endpoint option under MiMo.
    expect(allProviders.length).toBe(11);
    expect(allProviders).toContain('anthropic');
    expect(allProviders).toContain('openai');
    expect(allProviders).toContain('google');
    expect(allProviders).toContain('deepseek');
    expect(allProviders).toContain('moonshot');
    expect(allProviders).toContain('glm');
    expect(allProviders).toContain('mimo');
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
