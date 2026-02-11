import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAIStore } from "@/stores/useAIStore";
import { useRustAgentStore } from "@/stores/useRustAgentStore";
import { useRAGStore } from "@/stores/useRAGStore";
import { useBrowserStore } from "@/stores/useBrowserStore";
import {
  PROVIDER_REGISTRY,
  type LLMProviderType,
  createProvider,
} from "@/services/llm";
import { getRecommendedTemperature } from "@/services/llm/temperature";
import { Settings, Tag, Loader2, Check, X, Zap } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { ThinkingModelIcon } from "@/components/ai/ThinkingModelIcon";

// 测试连接状态类型
type TestStatus = "idle" | "testing" | "success" | "error";

interface TestResult {
  status: TestStatus;
  message?: string;
  latency?: number;
}

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatModelOptionLabel(model: { name: string; supportsThinking?: boolean }): string {
  return model.name;
}

function getModelMeta(provider: LLMProviderType, modelId?: string) {
  if (!modelId || modelId === "custom") return undefined;
  return PROVIDER_REGISTRY[provider]?.models.find((m) => m.id === modelId);
}

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const { config, setConfig } = useAIStore();
  const { autoApprove, setAutoApprove, autoCompactEnabled, setAutoCompactEnabled } = useRustAgentStore();
  const {
    config: ragConfig,
    setConfig: setRAGConfig,
    isIndexing: ragIsIndexing,
    indexStatus,
    rebuildIndex,
    cancelIndex,
    lastError: ragError,
  } = useRAGStore();
  const { hideAllWebViews, showAllWebViews } = useBrowserStore();
  const { t } = useLocaleStore();
  const errorMessages = t.aiSettings.errors as Record<string, string>;
  const mainModelMeta = getModelMeta(config.provider as LLMProviderType, config.model);
  const effectiveModelForTemp =
    config.model === "custom" ? (config.customModelId || "custom") : config.model;
  const recommendedTemperature = getRecommendedTemperature(
    config.provider as LLMProviderType,
    effectiveModelForTemp
  );
  const displayTemperature = config.temperature ?? recommendedTemperature;

  // 测试连接状态
  const [testResult, setTestResult] = useState<TestResult>({ status: "idle" });

  // 解析错误信息
  const parseError = useCallback((error: unknown): string => {
    const errorStr = String(error);
    const errorLower = errorStr.toLowerCase();
    
    // 精确匹配 HTTP 状态码（避免误匹配）
    const statusCodePatterns: [RegExp, string][] = [
      [/\b401\b|status[:\s]*401/i, "401"],
      [/\b403\b|status[:\s]*403/i, "403"],
      [/\b404\b|status[:\s]*404/i, "404"],
      [/\b429\b|status[:\s]*429/i, "429"],
      [/\b500\b|status[:\s]*500/i, "500"],
      [/\b502\b|status[:\s]*502/i, "502"],
      [/\b503\b|status[:\s]*503/i, "503"],
    ];
    
    for (const [pattern, code] of statusCodePatterns) {
      if (pattern.test(errorStr) && errorMessages[code]) {
        return errorMessages[code];
      }
    }
    
    // 检查常见错误关键词
    if (errorLower.includes("timeout")) return errorMessages.timeout;
    if (errorLower.includes("econnrefused") || errorLower.includes("connection refused")) return errorMessages.connection_refused;
    if (errorLower.includes("unauthorized") || errorLower.includes("invalid api key") || errorLower.includes("invalid_api_key")) return errorMessages["401"];
    if (errorLower.includes("network error") || errorLower.includes("failed to fetch")) return errorMessages.network;
    
    // 返回原始错误（截断过长的）
    return errorStr.length > 100 ? errorStr.slice(0, 100) + "..." : errorStr;
  }, [errorMessages]);

  // 测试 API 连接
  const testConnection = useCallback(async () => {
    // 检查 API Key（Ollama 除外）
    if (config.provider !== "ollama" && !config.apiKey) {
      setTestResult({ status: "error", message: errorMessages.no_key });
      return;
    }

    setTestResult({ status: "testing" });
    const startTime = Date.now();

    try {
      const provider = createProvider(config);
      
      // 发送简单测试请求
      const response = await provider.call(
        [{ role: "user", content: "Reply with exactly: OK" }],
        { maxTokens: 10, useDefaultTemperature: true }
      );

      const latency = Date.now() - startTime;
      
      if (response.content) {
        setTestResult({
          status: "success",
          message: t.aiSettings.testSuccess,
          latency,
        });
      } else {
        setTestResult({
          status: "error",
          message: t.aiSettings.testResponseEmpty,
        });
      }
    } catch (error) {
      setTestResult({
        status: "error",
        message: parseError(error),
      });
    }
  }, [config, parseError]);

  // 配置变化时重置测试状态
  useEffect(() => {
    setTestResult({ status: "idle" });
  }, [config.provider, config.apiKey, config.model, config.baseUrl]);

  // 弹窗打开时隐藏 WebView，关闭时恢复
  useEffect(() => {
    if (isOpen) {
      hideAllWebViews();
    } else {
      showAllWebViews();
    }
  }, [isOpen, hideAllWebViews, showAllWebViews]);

  if (!isOpen) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 模态内容 */}
      <div className="relative w-[520px] max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden border border-border bg-background/95 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/60">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Settings size={16} />
            <span>{t.aiSettings.title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            {t.aiSettings.close}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* AI Provider Settings */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-foreground flex items-center gap-2">
              <span>🤖 {t.aiSettings.mainModel}</span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t.aiSettings.provider}</label>
              <select
                value={config.provider}
                onChange={(e) => {
                  const provider = e.target.value as LLMProviderType;
                  const providerMeta = PROVIDER_REGISTRY[provider];
                  const defaultModel = providerMeta?.models[0]?.id || "";
                  setConfig({
                    provider,
                    model: defaultModel,
                    temperature: getRecommendedTemperature(provider, defaultModel),
                  });
                }}
                className="w-full text-xs p-2 rounded border border-border bg-background"
              >
                {Object.entries(PROVIDER_REGISTRY).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label} - {meta.description}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t.aiSettings.apiKey} {config.provider === "ollama" && <span className="text-muted-foreground">({t.aiSettings.apiKeyOptional})</span>}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ apiKey: e.target.value })}
                  placeholder={
                    config.provider === "ollama"
                      ? t.aiSettings.localModelNoKey
                      : config.provider === "anthropic"
                        ? "sk-ant-..."
                        : "sk-..."
                  }
                  className="flex-1 text-xs p-2 rounded border border-border bg-background"
                />
                <button
                  onClick={testConnection}
                  disabled={testResult.status === "testing"}
                  className={`px-3 py-2 text-xs rounded border transition-all flex items-center gap-1.5 min-w-[90px] justify-center ${
                    testResult.status === "success"
                      ? "border-green-500/50 bg-green-500/10 text-green-500"
                      : testResult.status === "error"
                        ? "border-red-500/50 bg-red-500/10 text-red-500"
                        : "border-border hover:bg-muted"
                  }`}
                >
                  {testResult.status === "testing" ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      {t.aiSettings.testing}
                    </>
                  ) : testResult.status === "success" ? (
                    <>
                      <Check size={12} />
                      {testResult.latency ? `${(testResult.latency / 1000).toFixed(1)}s` : t.aiSettings.testSuccessShort}
                    </>
                  ) : testResult.status === "error" ? (
                    <>
                      <X size={12} />
                      {t.aiSettings.testFailed}
                    </>
                  ) : (
                    <>
                      <Zap size={12} />
                      {t.aiSettings.testButton}
                    </>
                  )}
                </button>
              </div>
              {/* 测试结果详情 */}
              {testResult.status === "error" && testResult.message && (
                <div className="mt-1.5 text-xs text-red-500 bg-red-500/10 rounded px-2 py-1.5 flex items-start gap-1.5">
                  <X size={12} className="shrink-0 mt-0.5" />
                  <span>{testResult.message}</span>
                </div>
              )}
              {testResult.status === "success" && (
                <div className="mt-1.5 text-xs text-green-500 bg-green-500/10 rounded px-2 py-1.5 flex items-center gap-1.5">
                  <Check size={12} />
                  <span>{t.aiSettings.testSuccessDetail}</span>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="text-xs text-muted-foreground">{t.aiSettings.model}</label>
                {mainModelMeta?.supportsThinking && <ThinkingModelIcon />}
              </div>
              <select
                value={
                  PROVIDER_REGISTRY[config.provider as LLMProviderType]?.models.some(m => m.id === config.model)
                    ? config.model
                    : "custom"
                }
                onChange={(e) => {
                  const newModel = e.target.value;
                  if (newModel === "custom") {
                    setConfig({
                      model: newModel,
                      customModelId: "",
                      temperature: getRecommendedTemperature(config.provider as LLMProviderType, "custom"),
                    });
                  } else {
                    setConfig({
                      model: newModel,
                      temperature: getRecommendedTemperature(config.provider as LLMProviderType, newModel),
                    });
                  }
                }}
                className="w-full text-xs p-2 rounded border border-border bg-background"
              >
                {PROVIDER_REGISTRY[config.provider as LLMProviderType]?.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {formatModelOptionLabel(model)}
                  </option>
                ))}
              </select>
            </div>

            {config.model === "custom" && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t.aiSettings.customModelId}</label>
                <input
                  type="text"
                  value={config.customModelId || ""}
                  onChange={(e) => setConfig({ customModelId: e.target.value })}
                  placeholder={t.aiSettings.customModelHint}
                  className="w-full text-xs p-2 rounded border border-border bg-background"
                />
              </div>
            )}

            {config.model === "custom" && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {t.aiSettings.baseUrl} <span className="text-muted-foreground">({t.aiSettings.baseUrlOptional})</span>
                </label>
                <input
                  type="text"
                  value={config.baseUrl || ""}
                  onChange={(e) => setConfig({ baseUrl: e.target.value || undefined })}
                  placeholder={PROVIDER_REGISTRY[config.provider as LLMProviderType]?.defaultBaseUrl}
                  className="w-full text-xs p-2 rounded border border-border bg-background"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">{t.aiSettings.temperature}</label>
                <span className="text-xs text-muted-foreground">{displayTemperature.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={displayTemperature}
                onChange={(e) => setConfig({ temperature: parseFloat(e.target.value) })}
                className="w-full accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          {/* Agent 设置 */}
          <div className="space-y-2 pt-3 border-t border-border">
            <div className="text-xs font-medium text-foreground">🤖 {t.aiSettings.agentSettings}</div>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                className="w-3 h-3 rounded border-border"
              />
              {t.aiSettings.autoApproveTools}
              <span className="text-muted-foreground">({t.aiSettings.noManualConfirm})</span>
            </label>
            <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoCompactEnabled}
                onChange={(e) => setAutoCompactEnabled(e.target.checked)}
                className="w-3 h-3 rounded border-border mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <span>{t.aiSettings.autoCompactContext}</span>
                <span className="text-[10px] text-muted-foreground">{t.aiSettings.autoCompactHint}</span>
              </div>
            </label>
          </div>

          {/* RAG 设置（完整，与 RightPanel 同步） */}
          <div className="space-y-2 pt-3 border-t border-border">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span className="flex items-center gap-1">
                <Tag size={12} />
                {t.aiSettings.semanticSearch}
              </span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ragConfig.enabled}
                  onChange={(e) => setRAGConfig({ enabled: e.target.checked })}
                  className="w-3 h-3"
                />
                <span className="text-xs text-muted-foreground">{t.aiSettings.enable}</span>
              </label>
            </div>

            {ragConfig.enabled && (
              <>
                {/* RAG 当前状态 + 操作按钮 */}
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">
                    {ragIsIndexing
                      ? `${t.aiSettings.indexing}${
                          typeof indexStatus?.progress === "number"
                            ? `: ${Math.round(indexStatus.progress * 100)}%`
                            : "..."
                        }`
                      : indexStatus
                        ? t.aiSettings.indexed.replace('{count}', String(indexStatus.totalChunks ?? 0))
                        : t.aiSettings.notIndexed}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={rebuildIndex}
                      disabled={ragIsIndexing}
                      className="px-2 py-1 rounded border border-border text-xs hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t.aiSettings.rebuildIndex}
                    </button>
                    {ragIsIndexing && (
                      <button
                        type="button"
                        onClick={cancelIndex}
                        className="px-2 py-1 rounded border border-red-500/60 text-xs text-red-500 hover:bg-red-500/10"
                      >
                        {t.aiSettings.cancelIndex}
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t.aiSettings.embeddingService}</label>
                  <select
                    value={ragConfig.embeddingProvider}
                    onChange={(e) => {
                      const provider = e.target.value as "openai" | "ollama";
                      const defaultModels: Record<string, string> = {
                        openai: "text-embedding-3-small",
                        ollama: "nomic-embed-text",
                      };
                      setRAGConfig({
                        embeddingProvider: provider,
                        embeddingModel: defaultModels[provider],
                      });
                    }}
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="ollama">{t.aiSettings.ollamaLocalLabel}</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    {t.aiSettings.embeddingApiKey}
                    {ragConfig.embeddingProvider === "ollama" && (
                      <span className="text-muted-foreground/60 ml-1">({t.aiSettings.apiKeyOptional})</span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={ragConfig.embeddingApiKey || ""}
                    onChange={(e) => setRAGConfig({ embeddingApiKey: e.target.value })}
                    placeholder={
                      ragConfig.embeddingProvider === "openai" ? "sk-..." : "http://localhost:11434"
                    }
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t.aiSettings.embeddingBaseUrl}</label>
                  <input
                    type="text"
                    value={ragConfig.embeddingBaseUrl || ""}
                    onChange={(e) => setRAGConfig({ embeddingBaseUrl: e.target.value })}
                    placeholder={
                      ragConfig.embeddingProvider === "openai"
                        ? "https://api.openai.com/v1"
                        : "http://localhost:11434"
                    }
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t.aiSettings.embeddingModel}</label>
                  <input
                    type="text"
                    value={ragConfig.embeddingModel}
                    onChange={(e) => setRAGConfig({ embeddingModel: e.target.value })}
                    placeholder="Qwen/Qwen3-Embedding-8B"
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    {t.aiSettings.vectorDimensions}
                    <span className="text-muted-foreground/60 ml-1">({t.aiSettings.apiKeyOptional})</span>
                  </label>
                  <input
                    type="number"
                    value={ragConfig.embeddingDimensions || ""}
                    onChange={(e) =>
                      setRAGConfig({
                        embeddingDimensions: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                    placeholder={t.aiSettings.dimensionsHint}
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>

                {/* Reranker Settings */}
                <div className="border-t border-border pt-3 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium">{t.aiSettings.reranker}</span>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={ragConfig.rerankerEnabled || false}
                        onChange={(e) => setRAGConfig({ rerankerEnabled: e.target.checked })}
                        className="w-3 h-3"
                      />
                      <span className="text-xs text-muted-foreground">{t.aiSettings.enable}</span>
                    </label>
                  </div>

                  {ragConfig.rerankerEnabled && (
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">{t.aiSettings.rerankerBaseUrl}</label>
                        <input
                          type="text"
                          value={ragConfig.rerankerBaseUrl || ""}
                          onChange={(e) => setRAGConfig({ rerankerBaseUrl: e.target.value })}
                          placeholder="https://api.siliconflow.cn/v1"
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">{t.aiSettings.rerankerApiKey}</label>
                        <input
                          type="password"
                          value={ragConfig.rerankerApiKey || ""}
                          onChange={(e) => setRAGConfig({ rerankerApiKey: e.target.value })}
                          placeholder="sk-..."
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">{t.aiSettings.rerankerModel}</label>
                        <input
                          type="text"
                          value={ragConfig.rerankerModel || ""}
                          onChange={(e) => setRAGConfig({ rerankerModel: e.target.value })}
                          placeholder="BAAI/bge-reranker-v2-m3"
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">{t.aiSettings.topN}</label>
                        <input
                          type="number"
                          value={ragConfig.rerankerTopN || 5}
                          onChange={(e) =>
                            setRAGConfig({ rerankerTopN: parseInt(e.target.value) || 5 })
                          }
                          min={1}
                          max={20}
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Index Status */}
                <div className="bg-muted/50 rounded p-2 space-y-2 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t.aiSettings.indexStatus}</span>
                    {ragIsIndexing ? (
                      <span className="text-yellow-500 flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" />
                        {t.aiSettings.indexing}
                      </span>
                    ) : indexStatus?.initialized ? (
                      <span className="text-green-500 flex items-center gap-1"><Check size={12} /> {t.aiSettings.indexReady}</span>
                    ) : (
                      <span className="text-muted-foreground">{t.aiSettings.notInitialized}</span>
                    )}
                  </div>

                  {ragIsIndexing && indexStatus?.progress && typeof indexStatus.progress !== "number" && (
                    <div className="space-y-1">
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{
                            width: `${Math.round(
                              (indexStatus.progress.current /
                                Math.max(indexStatus.progress.total, 1)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground flex justify-between">
                        <span>
                          {t.aiSettings.filesProgress
                            .replace('{current}', String(indexStatus.progress.current))
                            .replace('{total}', String(indexStatus.progress.total))}
                        </span>
                        <span>
                          {Math.round(
                            (indexStatus.progress.current /
                              Math.max(indexStatus.progress.total, 1)) * 100
                          )}%
                        </span>
                      </div>
                      {indexStatus.progress.currentFile && (
                        <div
                          className="text-xs text-muted-foreground truncate"
                          title={indexStatus.progress.currentFile}
                        >
                          {t.aiSettings.processing.replace('{file}', indexStatus.progress.currentFile.split(/[/\\\\]/).pop() || '')}
                        </div>
                      )}
                    </div>
                  )}

                  {!ragIsIndexing && indexStatus && (
                    <div className="text-xs text-muted-foreground">
                      {t.aiSettings.indexSummary
                        .replace('{files}', String(indexStatus.totalFiles))
                        .replace('{chunks}', String(indexStatus.totalChunks))}
                    </div>
                  )}

                  {ragError && (
                    <div className="text-xs text-red-500">
                      {ragError}
                    </div>
                  )}

                  <button
                    onClick={() => rebuildIndex()}
                    disabled={ragIsIndexing || (ragConfig.embeddingProvider === 'openai' && !ragConfig.embeddingApiKey)}
                    className="w-full text-xs py-1 px-2 bg-primary/10 hover:bg-primary/20 text-primary rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {ragIsIndexing ? t.aiSettings.indexing : t.aiSettings.rebuildIndex}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Deep Research 网络搜索设置 */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Zap size={14} className="text-yellow-500" />
              {t.deepResearch.webSearchTitle}
            </div>
            <p className="text-xs text-muted-foreground">
              {t.deepResearch.webSearchDesc}
            </p>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t.deepResearch.webSearchKeyLabel}
                <a
                  href="https://tavily.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary ml-1 hover:underline"
                >
                  ({t.deepResearch.webSearchGetKey})
                </a>
              </label>
              <input
                type="password"
                value={config.tavilyApiKey || ""}
                onChange={(e) => setConfig({ tavilyApiKey: e.target.value })}
                placeholder="tvly-xxxxxxxxxx"
                className="w-full text-xs p-2 rounded border border-border bg-background"
              />
              {config.tavilyApiKey && (
                <p className="text-xs text-green-500 mt-1 flex items-center gap-1"><Check size={12} /> {t.deepResearch.webSearchConfigured}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
