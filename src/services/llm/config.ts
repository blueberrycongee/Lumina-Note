/**
 * LLM 配置管理
 */

import type { LLMConfig } from "./types";

// 默认配置
const DEFAULT_CONFIG: LLMConfig = {
  provider: "moonshot",
  apiKey: "",
  model: "moonshot-v1-8k",
};

let config: LLMConfig = { ...DEFAULT_CONFIG };

/**
 * 设置 LLM 配置
 */
export function setLLMConfig(newConfig: Partial<LLMConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * 获取当前 LLM 配置
 */
export function getLLMConfig(): LLMConfig {
  return { ...config };
}

/**
 * 重置为默认配置
 */
export function resetLLMConfig(): void {
  config = { ...DEFAULT_CONFIG };
}
