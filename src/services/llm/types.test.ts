/**
 * LLM Types 测试 - 主要测试 PROVIDER_REGISTRY
 */
import { describe, it, expect } from 'vitest';
import { PROVIDER_REGISTRY, LLMProviderType } from './types';

describe('PROVIDER_REGISTRY', () => {
  const allProviders: LLMProviderType[] = [
    'anthropic',
    'openai',
    'gemini',
    'moonshot',
    'deepseek',
    'zai',
    'groq',
    'openrouter',
    'ollama',
  ];

  it('should have all expected providers', () => {
    const registeredProviders = Object.keys(PROVIDER_REGISTRY);
    expect(registeredProviders).toEqual(expect.arrayContaining(allProviders));
    expect(registeredProviders.length).toBe(allProviders.length);
  });

  describe.each(allProviders)('%s provider', (providerName) => {
    const provider = PROVIDER_REGISTRY[providerName];

    it('should have required metadata', () => {
      expect(provider.name).toBe(providerName);
      expect(provider.label).toBeTruthy();
      expect(provider.description).toBeTruthy();
    });

    it('should have at least one model', () => {
      expect(provider.models.length).toBeGreaterThan(0);
    });

    it('should have valid model definitions', () => {
      provider.models.forEach((model) => {
        expect(model.id).toBeTruthy();
        expect(model.name).toBeTruthy();
      });
    });

    it('should have custom model option', () => {
      const customModel = provider.models.find((m) => m.id === 'custom');
      expect(customModel).toBeTruthy();
      expect(customModel?.name).toBe('Custom Model');
    });
  });

  describe('specific provider checks', () => {
    it('anthropic should have Claude models with vision support', () => {
      const anthropic = PROVIDER_REGISTRY.anthropic;
      expect(anthropic.defaultBaseUrl).toBe('https://api.anthropic.com');
      
      const sonnet = anthropic.models.find((m) => m.id.includes('sonnet'));
      expect(sonnet).toBeTruthy();
      expect(sonnet?.supportsVision).toBe(true);
    });

    it('openai should have GPT models', () => {
      const openai = PROVIDER_REGISTRY.openai;
      expect(openai.defaultBaseUrl).toBe('https://api.openai.com/v1');
      
      const gpt4o = openai.models.find((m) => m.id === 'gpt-4o');
      expect(gpt4o).toBeTruthy();
      expect(gpt4o?.contextWindow).toBe(128000);
    });

    it('gemini should have large context window models', () => {
      const gemini = PROVIDER_REGISTRY.gemini;
      const gemini25Pro = gemini.models.find((m) => m.id === 'gemini-2.5-pro');
      expect(gemini25Pro?.contextWindow).toBe(1000000);
    });

    it('deepseek should have thinking model', () => {
      const deepseek = PROVIDER_REGISTRY.deepseek;
      const reasoner = deepseek.models.find((m) => m.id === 'deepseek-reasoner');
      expect(reasoner?.supportsThinking).toBe(true);
    });

    it('zai should expose GLM models with official base URL', () => {
      const zai = PROVIDER_REGISTRY.zai;
      expect(zai.defaultBaseUrl).toBe('https://open.bigmodel.cn/api/paas/v4');
      expect(zai.models.some((m) => m.id === 'glm-5')).toBe(true);
      expect(zai.models.some((m) => m.id === 'glm-4.7')).toBe(true);
      expect(zai.models.some((m) => m.id === 'glm-4.7-flash')).toBe(true);
    });

    it('ollama should have local default URL', () => {
      const ollama = PROVIDER_REGISTRY.ollama;
      expect(ollama.defaultBaseUrl).toBe('http://localhost:11434/v1');
    });
  });
});
