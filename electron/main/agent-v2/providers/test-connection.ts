/**
 * Provider 测试连接 — 发一次最小 generateText 请求,验证 apiKey + baseUrl + model 三件套有效。
 *
 * 主 IPC 命令: agent_test_provider({ provider_id, model_id, settings }) → TestConnectionResult
 * 返回 { success, latencyMs?, error? }。
 *
 * AI Settings 的 "Test" 按钮会调这个 IPC,显示成功/失败 + 延迟。
 * 测试时可注入 modelBuilder 返 MockLanguageModelV3 覆盖。
 */

import { generateText, type LanguageModel } from 'ai'

import {
  createLanguageModel,
  type ProviderId,
  type ProviderSettings,
} from './registry.js'

export interface TestConnectionResult {
  success: boolean
  latencyMs?: number
  error?: string
}

export type ModelBuilder = (
  providerId: ProviderId,
  settings: ProviderSettings,
  modelId: string,
) => LanguageModel

export interface TestConnectionOptions {
  /** 注入自定义 model builder(主要给单测用,默认走 registry.createLanguageModel) */
  modelBuilder?: ModelBuilder
  /** 整体超时(ms),默认 20_000 */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 20_000

export async function testProviderConnection(
  providerId: ProviderId,
  modelId: string,
  settings: ProviderSettings,
  options: TestConnectionOptions = {},
): Promise<TestConnectionResult> {
  if (!modelId) {
    return { success: false, error: 'modelId is required' }
  }

  const builder = options.modelBuilder ?? createLanguageModel
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const start = Date.now()
  try {
    const model = builder(providerId, settings, modelId)
    await generateText({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      maxOutputTokens: 1,
      abortSignal: controller.signal,
    })
    return { success: true, latencyMs: Date.now() - start }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}
