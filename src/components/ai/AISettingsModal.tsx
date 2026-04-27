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
import {
  Loader2,
  Check,
  X,
  Zap,
  Bot,
  Shield,
  Lock,
  Info,
} from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { ThinkingModelIcon } from "@/components/ai/ThinkingModelIcon";
import {
  Dialog,
  DialogBody,
  DialogHeader,
  Field,
  SectionHeader,
  Select,
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

function formatApiConstraintsValues(
  template: string,
  c: NonNullable<ReturnType<typeof getModelMeta>>["apiConstraints"],
): string {
  if (!c) return "";
  return template
    .replace("{topP}", c.topP ? c.topP.fixed.toString() : "—")
    .replace(
      "{presencePenalty}",
      c.presencePenalty ? c.presencePenalty.fixed.toString() : "—",
    )
    .replace(
      "{frequencyPenalty}",
      c.frequencyPenalty ? c.frequencyPenalty.fixed.toString() : "—",
    )
    .replace("{n}", c.n ? c.n.fixed.toString() : "—");
}

// LabelRow — label on the left, optional right-aligned slot (e.g. "Optional"
// tag, brain icon). Keeps the inline parenthetical out of the label proper
// so the field's primary identifier reads first.
function LabelRow({
  children,
  trailing,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <span className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5">{children}</span>
      {trailing ? (
        <span className="text-xs font-normal text-muted-foreground/80">
          {trailing}
        </span>
      ) : null}
    </span>
  );
}

export function AISettingsContent() {
  const { config, setConfig } = useAIStore();
  const { autoApprove, setAutoApprove, autoCompactEnabled, setAutoCompactEnabled } = useAgentPrefs();
  const { t } = useLocaleStore();
  const errorMessages = t.aiSettings.errors as Record<string, string>;
  const providerMeta = PROVIDER_MODELS[config.provider as LLMProviderType];
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
  const apiKeyOptional =
    config.provider === "ollama" || config.provider === "openai-compatible";
  const baseUrlOptional = config.provider !== "openai-compatible";

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

        <Field
          label={t.aiSettings.provider}
          hint={providerMeta?.description}
        >
          {(id) => (
            <Select
              id={id}
              value={config.provider}
              onValueChange={(next) => {
                const provider = next as LLMProviderType;
                const defaultModel = getDefaultModelForProvider(provider);
                setConfig({
                  provider,
                  model: defaultModel,
                  customModelId: defaultModel === "custom" ? "" : undefined,
                  baseUrl: PROVIDER_MODELS[provider]?.defaultBaseUrl,
                  temperature: getRecommendedTemperature(provider, defaultModel),
                });
              }}
              options={Object.entries(PROVIDER_MODELS).map(([key, meta]) => ({
                value: key,
                label: meta.label,
              }))}
            />
          )}
        </Field>

        <Field
          label={
            <LabelRow
              trailing={apiKeyOptional ? t.aiSettings.apiKeyOptional : undefined}
            >
              {t.aiSettings.apiKey}
            </LabelRow>
          }
        >
          {(id) => (
            <div className="space-y-2">
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
              {testResult.status === "error" && testResult.message ? (
                <div className="flex items-start gap-1.5 rounded-ui-sm bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  <X size={12} className="mt-0.5 shrink-0" />
                  <span>{testResult.message}</span>
                </div>
              ) : testResult.status === "success" ? (
                <div className="flex items-center gap-1.5 rounded-ui-sm bg-success/10 px-2 py-1.5 text-xs text-success">
                  <Check size={12} />
                  <span>
                    {t.aiSettings.testSuccessDetail}
                    {testResult.latency
                      ? ` · ${(testResult.latency / 1000).toFixed(1)}s`
                      : ""}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-end">
                <button
                  onClick={testConnection}
                  disabled={testResult.status === "testing"}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-ui-md border px-2.5 py-1 text-xs",
                    "transition-colors duration-fast ease-out-subtle",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    testResult.status === "success"
                      ? "border-success/40 bg-success/5 text-success"
                      : testResult.status === "error"
                        ? "border-destructive/40 bg-destructive/5 text-destructive"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  ].join(" ")}
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
                      {t.aiSettings.testSuccessShort}
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
            </div>
          )}
        </Field>

        {config.provider !== "openai-compatible" && (
          <Field
            label={
              <LabelRow>
                {t.aiSettings.model}
                {mainModelMeta?.supportsThinking && <ThinkingModelIcon />}
              </LabelRow>
            }
          >
            {(id) => {
              const providerModels =
                PROVIDER_MODELS[config.provider as LLMProviderType]?.models ?? [];
              const currentInList = providerModels.some(
                (m) => m.id === config.model,
              );
              return (
                <Select
                  id={id}
                  value={currentInList ? config.model : "custom"}
                  onValueChange={(newModel) => {
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
                  options={providerModels.map((model) => ({
                    value: model.id,
                    label: formatModelOptionLabel(model),
                  }))}
                />
              );
            }}
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
              <LabelRow
                trailing={baseUrlOptional ? t.aiSettings.apiKeyOptional : undefined}
              >
                {t.aiSettings.baseUrl}
              </LabelRow>
            }
            hint={baseUrlOptional ? t.aiSettings.baseUrlOptional : undefined}
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
              <span>{t.aiSettings.temperature}</span>
              {/* Reserve fixed width for the lock indicator so the row doesn't reflow when the lock toggles. */}
              <span
                aria-hidden={!temperatureLock}
                className="inline-flex h-3 w-3 items-center justify-center"
              >
                {temperatureLock ? (
                  <Lock
                    size={11}
                    aria-label={t.aiSettings.temperatureLock.title}
                    className="text-muted-foreground"
                  />
                ) : null}
              </span>
            </label>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
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
          {(temperatureLock || apiConstraints) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {temperatureLock && (
                <span>
                  {formatTemperatureLockMessage(
                    t.aiSettings.temperatureLock[temperatureLock.reason],
                    temperatureLock,
                  )}
                </span>
              )}
              {apiConstraints && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-ui-sm text-muted-foreground/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  aria-label={formatApiConstraintsValues(
                    t.aiSettings.apiConstraintsHint,
                    apiConstraints,
                  )}
                  data-tooltip={formatApiConstraintsValues(
                    t.aiSettings.apiConstraintsHint,
                    apiConstraints,
                  )}
                >
                  <Info size={11} aria-hidden />
                  <span>{t.aiSettings.apiConstraintsBadge}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Agent 设置 */}
      <div className="space-y-3 pt-4 border-t border-border/60">
        <SectionHeader
          icon={<Shield size={14} />}
          title={t.aiSettings.agentSettings}
        />
        <ToggleRow
          label={t.aiSettings.autoApproveTools}
          hint={t.aiSettings.noManualConfirm}
          checked={autoApprove}
          onChange={setAutoApprove}
        />
        <ToggleRow
          label={t.aiSettings.autoCompactContext}
          hint={t.aiSettings.autoCompactHint}
          checked={autoCompactEnabled}
          onChange={setAutoCompactEnabled}
        />
      </div>
    </div>
  );
}

// ToggleRow — label and toggle on the same row, hint stacked below the
// label. Avoids the cramping caused by `Field inline` when the hint runs
// long: the toggle stays anchored to the row's right edge instead of
// vertical-centering against a wrapping hint.
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <Toggle checked={checked} onChange={onChange} label={label} />
      </div>
      {hint ? (
        <p className="mt-1 pr-12 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const { t } = useLocaleStore();
  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()} width={560}>
      <DialogHeader title={t.aiSettings.title} />
      <DialogBody>
        <AISettingsContent />
      </DialogBody>
    </Dialog>
  );
}
