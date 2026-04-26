import { useEffect, useState, useCallback } from "react";
import { useAIStore } from "@/stores/useAIStore";
import { useAgentPrefs } from "@/stores/useAgentPrefs";
import {
  PROVIDER_MODELS,
  type LLMProviderType,
} from "@/services/llm";
import { invoke } from "@/lib/host";
import {
  getRecommendedTemperature,
  resolveTemperatureLock,
  type TemperatureLock,
} from "@/services/llm/temperature";
import { Loader2, Check, X, Zap, Bot, Shield, Lock } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { ThinkingModelIcon } from "@/components/ai/ThinkingModelIcon";
import {
  Dialog,
  DialogBody,
  DialogHeader,
  Field,
  SectionHeader,
  TextInput,
  Toggle,
} from "@/components/ui";

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

function getDefaultModelForProvider(provider: LLMProviderType): string {
  return PROVIDER_MODELS[provider]?.models[0]?.id || "custom";
}

function getModelMeta(provider: LLMProviderType, modelId?: string) {
  if (!modelId || modelId === "custom") return undefined;
  return PROVIDER_MODELS[provider]?.models.find((m) => m.id === modelId);
}

function formatTemperatureLockMessage(
  template: string,
  lock: TemperatureLock,
): string {
  return template.replace("{value}", lock.value.toFixed(1));
}

export function AISettingsContent() {
  const { config, setConfig } = useAIStore();
  const { autoApprove, setAutoApprove, autoCompactEnabled, setAutoCompactEnabled } = useAgentPrefs();
  const { t } = useLocaleStore();
  const errorMessages = t.aiSettings.errors as Record<string, string>;
  const mainModelMeta = getModelMeta(config.provider as LLMProviderType, config.model);
  const effectiveModelForTemp =
    config.model === "custom" ? (config.customModelId || "custom") : config.model;
  const recommendedTemperature = getRecommendedTemperature(
    config.provider as LLMProviderType,
    effectiveModelForTemp
  );
  const temperatureLock = resolveTemperatureLock({
    provider: config.provider as LLMProviderType,
    model: effectiveModelForTemp,
    thinkingMode: config.thinkingMode,
    reasoningEffort: config.reasoningEffort,
  });
  const displayTemperature = temperatureLock
    ? temperatureLock.value
    : (config.temperature ?? recommendedTemperature);
  const apiConstraints = mainModelMeta?.apiConstraints;

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
    if (config.provider !== "ollama" && config.provider !== "openai-compatible" && !config.apiKey) {
      setTestResult({ status: "error", message: errorMessages.no_key });
      return;
    }

    setTestResult({ status: "testing" });
    const startTime = Date.now();

    try {
      const modelId = config.model === "custom" ? (config.customModelId || "") : config.model;
      const baseUrl = config.baseUrl || PROVIDER_MODELS[config.provider as LLMProviderType]?.defaultBaseUrl;

      const result = await invoke<{ success: boolean; latencyMs?: number; error?: string }>("agent_test_provider", {
        provider_id: config.provider,
        model_id: modelId,
        settings: {
          apiKey: config.apiKey,
          baseUrl,
        },
      });

      if (result.success) {
        const latency = result.latencyMs ?? (Date.now() - startTime);
        setTestResult({
          status: "success",
          message: t.aiSettings.testSuccess,
          latency,
        });
      } else {
        setTestResult({
          status: "error",
          message: parseError(result.error ?? t.aiSettings.testResponseEmpty),
        });
      }
    } catch (error) {
      setTestResult({
        status: "error",
        message: parseError(error),
      });
    }
  }, [config, parseError, t.aiSettings.testSuccess, t.aiSettings.testResponseEmpty, errorMessages.no_key]);

  // 配置变化时重置测试状态
  useEffect(() => {
    setTestResult({ status: "idle" });
  }, [config.provider, config.apiKey, config.model, config.baseUrl]);

  return (
    <div className="space-y-6">
      {/* AI Provider Settings */}
      <div className="space-y-4">
        <SectionHeader
          icon={<Bot size={14} />}
          title={t.aiSettings.mainModel}
        />

        <Field label={t.aiSettings.provider}>
          {(id) => (
            <select
              id={id}
              value={config.provider}
              onChange={(e) => {
                const provider = e.target.value as LLMProviderType;
                const defaultModel = getDefaultModelForProvider(provider);
                setConfig({
                  provider,
                  model: defaultModel,
                  customModelId: defaultModel === "custom" ? "" : undefined,
                  baseUrl: PROVIDER_MODELS[provider]?.defaultBaseUrl,
                  temperature: getRecommendedTemperature(provider, defaultModel),
                });
              }}
              className="w-full rounded-ui-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              {Object.entries(PROVIDER_MODELS).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label} — {meta.description}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field
          label={
            <span className="flex items-center gap-1.5">
              {t.aiSettings.apiKey}
              {(config.provider === "ollama" ||
                config.provider === "openai-compatible") && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({t.aiSettings.apiKeyOptional})
                </span>
              )}
            </span>
          }
        >
          {(id) => (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <TextInput
                  id={id}
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ apiKey: e.target.value })}
                  placeholder={
                    config.provider === "ollama"
                      ? t.aiSettings.localModelNoKey
                      : config.provider === "anthropic"
                        ? "sk-ant-..."
                        : config.provider === "openai-compatible"
                          ? t.aiSettings.apiKeyOptional
                          : "sk-..."
                  }
                />
                <button
                  onClick={testConnection}
                  disabled={testResult.status === "testing"}
                  className={[
                    "flex min-w-[90px] items-center justify-center gap-1.5 rounded-ui-md border px-3 text-sm",
                    "transition-colors duration-fast ease-out-subtle",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    testResult.status === "success"
                      ? "border-success/50 bg-success/10 text-success"
                      : testResult.status === "error"
                        ? "border-destructive/50 bg-destructive/10 text-destructive"
                        : "border-border text-foreground hover:bg-accent",
                  ].join(" ")}
                  title={t.aiSettings.testButton}
                >
                  {testResult.status === "testing" ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      {t.aiSettings.testing}
                    </>
                  ) : testResult.status === "success" ? (
                    <>
                      <Check size={13} />
                      {testResult.latency
                        ? `${(testResult.latency / 1000).toFixed(1)}s`
                        : t.aiSettings.testSuccessShort}
                    </>
                  ) : testResult.status === "error" ? (
                    <>
                      <X size={13} />
                      {t.aiSettings.testFailed}
                    </>
                  ) : (
                    <>
                      <Zap size={13} />
                      {t.aiSettings.testButton}
                    </>
                  )}
                </button>
              </div>
              {testResult.status === "error" && testResult.message && (
                <div className="flex items-start gap-1.5 rounded-ui-sm bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  <X size={12} className="mt-0.5 shrink-0" />
                  <span>{testResult.message}</span>
                </div>
              )}
              {testResult.status === "success" && (
                <div className="flex items-center gap-1.5 rounded-ui-sm bg-success/10 px-2 py-1.5 text-xs text-success">
                  <Check size={12} />
                  <span>{t.aiSettings.testSuccessDetail}</span>
                </div>
              )}
            </div>
          )}
        </Field>

        {config.provider !== "openai-compatible" && (
          <Field
            label={
              <span className="flex items-center gap-1.5">
                {t.aiSettings.model}
                {mainModelMeta?.supportsThinking && <ThinkingModelIcon />}
              </span>
            }
          >
            {(id) => (
              <select
                id={id}
                value={
                  PROVIDER_MODELS[config.provider as LLMProviderType]?.models.some(
                    (m) => m.id === config.model,
                  )
                    ? config.model
                    : "custom"
                }
                onChange={(e) => {
                  const newModel = e.target.value;
                  if (newModel === "custom") {
                    setConfig({
                      model: newModel,
                      customModelId: "",
                      temperature: getRecommendedTemperature(
                        config.provider as LLMProviderType,
                        "custom",
                      ),
                    });
                  } else {
                    setConfig({
                      model: newModel,
                      temperature: getRecommendedTemperature(
                        config.provider as LLMProviderType,
                        newModel,
                      ),
                    });
                  }
                }}
                className="w-full rounded-ui-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {PROVIDER_MODELS[config.provider as LLMProviderType]?.models.map(
                  (model) => (
                    <option key={model.id} value={model.id}>
                      {formatModelOptionLabel(model)}
                    </option>
                  ),
                )}
              </select>
            )}
          </Field>
        )}

        {(config.model === "custom" ||
          config.provider === "openai-compatible") && (
          <Field label={t.aiSettings.customModelId}>
            {(id) => (
              <TextInput
                id={id}
                type="text"
                value={config.customModelId || ""}
                onChange={(e) => setConfig({ customModelId: e.target.value })}
                placeholder={t.aiSettings.customModelHint}
              />
            )}
          </Field>
        )}

        {(config.model === "custom" ||
          config.provider === "openai-compatible") && (
          <Field
            label={
              <span className="flex items-center gap-1.5">
                {t.aiSettings.baseUrl}
                {config.provider !== "openai-compatible" && (
                  <span className="text-xs font-normal text-muted-foreground">
                    ({t.aiSettings.baseUrlOptional})
                  </span>
                )}
              </span>
            }
          >
            {(id) => (
              <TextInput
                id={id}
                type="text"
                value={config.baseUrl || ""}
                onChange={(e) =>
                  setConfig({ baseUrl: e.target.value || undefined })
                }
                placeholder={
                  PROVIDER_MODELS[config.provider as LLMProviderType]
                    ?.defaultBaseUrl || "https://api.example.com/v1"
                }
              />
            )}
          </Field>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              className="flex items-center gap-1.5 text-sm font-medium text-foreground"
              title={
                temperatureLock
                  ? formatTemperatureLockMessage(
                      t.aiSettings.temperatureLock[temperatureLock.reason],
                      temperatureLock,
                    )
                  : undefined
              }
            >
              {t.aiSettings.temperature}
              {temperatureLock && (
                <Lock
                  size={11}
                  aria-label={t.aiSettings.temperatureLock.title}
                  className="text-muted-foreground"
                />
              )}
            </label>
            <span className="font-mono text-xs text-muted-foreground">
              {displayTemperature.toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={displayTemperature}
            disabled={!!temperatureLock}
            onChange={(e) => setConfig({ temperature: parseFloat(e.target.value) })}
            className="h-1 w-full appearance-none rounded-full bg-muted accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          />
          {temperatureLock && (
            <p className="text-xs text-muted-foreground">
              {formatTemperatureLockMessage(
                t.aiSettings.temperatureLock[temperatureLock.reason],
                temperatureLock,
              )}
            </p>
          )}
          {apiConstraints && (
            <p className="text-xs text-muted-foreground/80">
              {t.aiSettings.apiConstraintsHint
                .replace(
                  "{topP}",
                  apiConstraints.topP
                    ? apiConstraints.topP.fixed.toString()
                    : "—",
                )
                .replace(
                  "{presencePenalty}",
                  apiConstraints.presencePenalty
                    ? apiConstraints.presencePenalty.fixed.toString()
                    : "—",
                )
                .replace(
                  "{frequencyPenalty}",
                  apiConstraints.frequencyPenalty
                    ? apiConstraints.frequencyPenalty.fixed.toString()
                    : "—",
                )
                .replace(
                  "{n}",
                  apiConstraints.n ? apiConstraints.n.fixed.toString() : "—",
                )}
            </p>
          )}
        </div>
      </div>

      {/* Agent 设置 */}
      <div className="space-y-3 pt-4 border-t border-border/60">
        <SectionHeader
          icon={<Shield size={14} />}
          title={t.aiSettings.agentSettings}
        />
        <Field
          label={t.aiSettings.autoApproveTools}
          hint={t.aiSettings.noManualConfirm}
          inline
        >
          {(id) => (
            <Toggle
              id={id}
              checked={autoApprove}
              onChange={setAutoApprove}
              label={t.aiSettings.autoApproveTools}
            />
          )}
        </Field>
        <Field
          label={t.aiSettings.autoCompactContext}
          hint={t.aiSettings.autoCompactHint}
          inline
        >
          {(id) => (
            <Toggle
              id={id}
              checked={autoCompactEnabled}
              onChange={setAutoCompactEnabled}
              label={t.aiSettings.autoCompactContext}
            />
          )}
        </Field>
      </div>
    </div>
  );
}

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const { t } = useLocaleStore();
  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()} width={520}>
      <DialogHeader title={t.aiSettings.title} />
      <DialogBody>
        <AISettingsContent />
      </DialogBody>
    </Dialog>
  );
}
