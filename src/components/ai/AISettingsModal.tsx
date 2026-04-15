import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAIStore } from "@/stores/useAIStore";
import { useRustAgentStore } from "@/stores/useRustAgentStore";
import {
  FOLLOW_MAIN_MODEL,
  PROVIDER_REGISTRY,
  getResolvedModelForPurpose,
  hasPurposeModelOverride,
  type LLMProviderType,
  createProvider,
} from "@/services/llm";
import { getRecommendedTemperature } from "@/services/llm/temperature";
import { Settings, Loader2, Check, X, Zap } from "lucide-react";
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

function getRouteSelectValue(
  provider: LLMProviderType,
  modelId: string | undefined,
) {
  if (!modelId || modelId === FOLLOW_MAIN_MODEL) {
    return FOLLOW_MAIN_MODEL;
  }
  if (modelId === "custom") {
    return "custom";
  }
  return PROVIDER_REGISTRY[provider]?.models.some((m) => m.id === modelId)
    ? modelId
    : "custom";
}

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const { config, setConfig } = useAIStore();
  const { autoApprove, setAutoApprove, autoCompactEnabled, setAutoCompactEnabled } = useRustAgentStore();
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
  const provider = config.provider as LLMProviderType;
  const chatModelMeta = getModelMeta(provider, config.chatModel);
  const complexModelMeta = getModelMeta(provider, config.complexTaskModel);
  const chatModelResolved = getResolvedModelForPurpose(config, "chat");
  const complexTaskModelResolved = getResolvedModelForPurpose(config, "complex");
  const chatModelOverridesMain = hasPurposeModelOverride(config, "chat");
  const complexModelOverridesMain = hasPurposeModelOverride(config, "complex");

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
    // 检查 API Key（Ollama / Custom 除外）
    if (config.provider !== "ollama" && config.provider !== "custom" && !config.apiKey) {
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

  if (!isOpen) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-spotlight-overlay"
        onClick={onClose}
      />

      {/* 模态内容 */}
      <div className="relative w-[520px] max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden border border-border/60 bg-background/95 flex flex-col animate-spotlight-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/60">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Settings size={16} />
            <span>{t.aiSettings.title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
            title={t.aiSettings.close}
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
                className="w-full text-xs p-2 rounded border border-border/60 bg-background"
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
                {t.aiSettings.apiKey} {(config.provider === "ollama" || config.provider === "custom") && <span className="text-muted-foreground">({t.aiSettings.apiKeyOptional})</span>}
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
                        : config.provider === "custom"
                          ? t.aiSettings.apiKeyOptional
                          : "sk-..."
                  }
                  className="flex-1 text-xs p-2 rounded border border-border/60 bg-background"
                />
                <button
                  onClick={testConnection}
                  disabled={testResult.status === "testing"}
                  className={`px-3 py-2 text-xs rounded border transition-all flex items-center gap-1.5 min-w-[90px] justify-center ${
                    testResult.status === "success"
                      ? "border-success/50 bg-success/10 text-success"
                      : testResult.status === "error"
                        ? "border-destructive/50 bg-destructive/10 text-destructive"
                        : "border-border/60 hover:bg-muted"
                  }`}
                      title={t.aiSettings.testButton}
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
                <div className="mt-1.5 text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5 flex items-start gap-1.5">
                  <X size={12} className="shrink-0 mt-0.5" />
                  <span>{testResult.message}</span>
                </div>
              )}
              {testResult.status === "success" && (
                <div className="mt-1.5 text-xs text-success bg-success/10 rounded px-2 py-1.5 flex items-center gap-1.5">
                  <Check size={12} />
                  <span>{t.aiSettings.testSuccessDetail}</span>
                </div>
              )}
            </div>

            {config.provider !== "custom" && (
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
                className="w-full text-xs p-2 rounded border border-border/60 bg-background"
              >
                {PROVIDER_REGISTRY[config.provider as LLMProviderType]?.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {formatModelOptionLabel(model)}
                  </option>
                ))}
              </select>
            </div>
            )}

            {(config.model === "custom" || config.provider === "custom") && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t.aiSettings.customModelId}</label>
                <input
                  type="text"
                  value={config.customModelId || ""}
                  onChange={(e) => setConfig({ customModelId: e.target.value })}
                  placeholder={t.aiSettings.customModelHint}
                  className="w-full text-xs p-2 rounded border border-border/60 bg-background"
                />
              </div>
            )}

            {(config.model === "custom" || config.provider === "custom") && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {t.aiSettings.baseUrl} {config.provider !== "custom" && <span className="text-muted-foreground">({t.aiSettings.baseUrlOptional})</span>}
                </label>
                <input
                  type="text"
                  value={config.baseUrl || ""}
                  onChange={(e) => setConfig({ baseUrl: e.target.value || undefined })}
                  placeholder={PROVIDER_REGISTRY[config.provider as LLMProviderType]?.defaultBaseUrl || "https://api.example.com/v1"}
                  className="w-full text-xs p-2 rounded border border-border/60 bg-background"
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

          <div className="space-y-3 pt-3 border-t border-border/60">
            <div className="space-y-1">
              <div className="text-xs font-medium text-foreground">{t.aiSettings.dynamicRouting}</div>
              <p className="text-xs text-muted-foreground">{t.aiSettings.routingDescription}</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-foreground">{t.aiSettings.chatModel}</div>
                  <p className="text-[11px] text-muted-foreground">{t.aiSettings.chatModelDesc}</p>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {chatModelOverridesMain ? chatModelResolved : t.aiSettings.followMainModel}
                </span>
              </div>

              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-xs text-muted-foreground">{t.aiSettings.chatModel}</label>
                  {chatModelMeta?.supportsThinking && <ThinkingModelIcon />}
                </div>
                <select
                  value={getRouteSelectValue(provider, config.chatModel)}
                  onChange={(e) => {
                    const nextModel = e.target.value;
                    if (nextModel === FOLLOW_MAIN_MODEL) {
                      setConfig({
                        chatModel: undefined,
                        chatCustomModelId: undefined,
                      });
                      return;
                    }
                    if (nextModel === "custom") {
                      setConfig({
                        chatModel: "custom",
                        chatCustomModelId: "",
                      });
                      return;
                    }
                    setConfig({
                      chatModel: nextModel,
                      chatCustomModelId: undefined,
                    });
                  }}
                  className="w-full text-xs p-2 rounded border border-border/60 bg-background"
                >
                  <option value={FOLLOW_MAIN_MODEL}>{t.aiSettings.followMainModel}</option>
                  {PROVIDER_REGISTRY[provider]?.models.map((model) => (
                    <option key={`chat-${model.id}`} value={model.id}>
                      {formatModelOptionLabel(model)}
                    </option>
                  ))}
                </select>
              </div>

              {config.chatModel === "custom" && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t.aiSettings.customModelId}</label>
                  <input
                    type="text"
                    value={config.chatCustomModelId || ""}
                    onChange={(e) => setConfig({ chatCustomModelId: e.target.value })}
                    placeholder={t.aiSettings.customModelHint}
                    className="w-full text-xs p-2 rounded border border-border/60 bg-background"
                  />
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-foreground">{t.aiSettings.complexTaskModel}</div>
                  <p className="text-[11px] text-muted-foreground">{t.aiSettings.complexTaskModelDesc}</p>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {complexModelOverridesMain ? complexTaskModelResolved : t.aiSettings.followMainModel}
                </span>
              </div>

              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-xs text-muted-foreground">{t.aiSettings.complexTaskModel}</label>
                  {complexModelMeta?.supportsThinking && <ThinkingModelIcon />}
                </div>
                <select
                  value={getRouteSelectValue(provider, config.complexTaskModel)}
                  onChange={(e) => {
                    const nextModel = e.target.value;
                    if (nextModel === FOLLOW_MAIN_MODEL) {
                      setConfig({
                        complexTaskModel: undefined,
                        complexTaskCustomModelId: undefined,
                      });
                      return;
                    }
                    if (nextModel === "custom") {
                      setConfig({
                        complexTaskModel: "custom",
                        complexTaskCustomModelId: "",
                      });
                      return;
                    }
                    setConfig({
                      complexTaskModel: nextModel,
                      complexTaskCustomModelId: undefined,
                    });
                  }}
                  className="w-full text-xs p-2 rounded border border-border/60 bg-background"
                >
                  <option value={FOLLOW_MAIN_MODEL}>{t.aiSettings.followMainModel}</option>
                  {PROVIDER_REGISTRY[provider]?.models.map((model) => (
                    <option key={`complex-${model.id}`} value={model.id}>
                      {formatModelOptionLabel(model)}
                    </option>
                  ))}
                </select>
              </div>

              {config.complexTaskModel === "custom" && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t.aiSettings.customModelId}</label>
                  <input
                    type="text"
                    value={config.complexTaskCustomModelId || ""}
                    onChange={(e) => setConfig({ complexTaskCustomModelId: e.target.value })}
                    placeholder={t.aiSettings.customModelHint}
                    className="w-full text-xs p-2 rounded border border-border/60 bg-background"
                  />
                </div>
              )}

              <div className="rounded bg-background/70 border border-border/50 px-2.5 py-2 text-[11px] text-muted-foreground space-y-1">
                <p>{t.aiSettings.routingRulesDesc}</p>
                <p>• {t.aiSettings.chatTask}</p>
                <p>• {t.aiSettings.searchTask}</p>
                <p>• {t.aiSettings.complexTaskExamples}</p>
              </div>
            </div>
          </div>

          {/* Agent 设置 */}
          <div className="space-y-2 pt-3 border-t border-border/60">
            <div className="text-xs font-medium text-foreground">🤖 {t.aiSettings.agentSettings}</div>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                className="w-3 h-3 rounded border-border/60"
              />
              {t.aiSettings.autoApproveTools}
              <span className="text-muted-foreground">({t.aiSettings.noManualConfirm})</span>
            </label>
            <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoCompactEnabled}
                onChange={(e) => setAutoCompactEnabled(e.target.checked)}
                className="w-3 h-3 rounded border-border/60 mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <span>{t.aiSettings.autoCompactContext}</span>
                <span className="text-[10px] text-muted-foreground">{t.aiSettings.autoCompactHint}</span>
              </div>
            </label>
          </div>

        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
