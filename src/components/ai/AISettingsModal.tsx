import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { useAIStore } from "@/stores/useAIStore";
import { useAgentPrefs } from "@/stores/useAgentPrefs";
import type { AIConfig } from "@/services/ai/ai";
import {
  MIMO_ENDPOINTS,
  PROVIDER_MODELS,
  getMimoEndpointForBaseUrl,
  getMimoModelsForBaseUrl,
  type LLMProviderType,
} from "@/services/llm";
import {
  LUMINA_CLOUD_PROVIDER,
  LUMINA_CLOUD_PROVIDER_ID,
  isLuminaCloudVisible,
} from "@/services/llm/providers/luminaCloud";
import { useLicenseStore } from "@/stores/useLicenseStore";
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
import { ImageModelsSettings } from "@/components/ai/ImageModelsSettings";
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

function getModelsForProvider(provider: LLMProviderType, baseUrl?: string) {
  return provider === "mimo"
    ? getMimoModelsForBaseUrl(baseUrl)
    : (PROVIDER_MODELS[provider]?.models ?? []);
}

function getDefaultModelForProvider(provider: LLMProviderType, baseUrl?: string): string {
  return getModelsForProvider(provider, baseUrl)[0]?.id || "custom";
}

function getModelMeta(provider: LLMProviderType, modelId?: string, baseUrl?: string) {
  if (!modelId || modelId === "custom") return undefined;
  return getModelsForProvider(provider, baseUrl).find((m) => m.id === modelId);
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

function parsePositiveIntegerDraft(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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
  // Saved config = the source of truth in the store. Draft config = what's
  // currently in the form. Edits land in the draft; the explicit Save
  // button below the temperature slider commits the draft to the store
  // (which then triggers the encrypt + IPC + opencode-restart pipeline).
  const { config: savedConfig, setConfig: commitConfig } = useAIStore();
  const { autoApprove, setAutoApprove, autoCompactEnabled, setAutoCompactEnabled } = useAgentPrefs();
  const { t } = useLocaleStore();

  const [draftConfig, setDraftConfig] = useState<AIConfig>(savedConfig);
  const isDirty = useMemo(() => {
    const keys = Object.keys(draftConfig) as (keyof AIConfig)[];
    return keys.some((k) => draftConfig[k] !== savedConfig[k]);
  }, [draftConfig, savedConfig]);
  // Sync draft when the saved config changes externally (e.g. on rehydrate
  // or after Save commits and the store re-emits). We avoid stomping on
  // an in-flight edit by only re-syncing when nothing's dirty — the
  // clobber would feel like the form "snapping back" mid-edit.
  useEffect(() => {
    if (!isDirty) setDraftConfig(savedConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedConfig]);
  const config = draftConfig;
  const setConfig = useCallback((patch: Partial<AIConfig>) => {
    setDraftConfig((prev) => ({ ...prev, ...patch }));
  }, []);
  const [saving, setSaving] = useState(false);
  const handleSave = useCallback(async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      // Compute the diff so we don't re-fire side effects (encrypt, IPC,
      // server restart) for fields that didn't change.
      const diff: Partial<AIConfig> = {};
      const keys = Object.keys(draftConfig) as (keyof AIConfig)[];
      for (const k of keys) {
        if (draftConfig[k] !== savedConfig[k]) {
          (diff as Record<string, unknown>)[k as string] = draftConfig[k];
        }
      }
      if (Object.keys(diff).length === 0) return;
      await commitConfig(diff);
      toast.success(t.aiSettings.saved);
    } catch (err) {
      toast.error(t.aiSettings.saveFailed, {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }, [draftConfig, savedConfig, isDirty, commitConfig, t]);
  const handleReset = useCallback(() => {
    setDraftConfig(savedConfig);
  }, [savedConfig]);

  const errorMessages = t.aiSettings.errors as Record<string, string>;
  const licenseFeatures = useLicenseStore((s) => s.payload?.features);
  const licenseFeaturesForCloud = isLuminaCloudVisible(licenseFeatures);
  const providerMeta = PROVIDER_MODELS[config.provider as LLMProviderType];
  const mainModelMeta = getModelMeta(
    config.provider as LLMProviderType,
    config.model,
    config.baseUrl,
  );
  const isMimoProvider = config.provider === "mimo";
  const mimoEndpoint = getMimoEndpointForBaseUrl(config.baseUrl);
  const effectiveModelForTemp =
    config.model === "custom" ? (config.customModelId || "custom") : config.model;
  const recommendedTemperature = getRecommendedTemperature(
    config.provider as LLMProviderType,
    effectiveModelForTemp
  );
  const temperatureLock = resolveTemperatureLock({
    provider: config.provider as LLMProviderType,
    model: effectiveModelForTemp,
  });
  const displayTemperature = temperatureLock
    ? temperatureLock.value
    : (config.temperature ?? recommendedTemperature);
  const apiConstraints = mainModelMeta?.apiConstraints;
  const apiKeyOptional =
    config.provider === "ollama" || config.provider === "openai-compatible";
  const apiKeyConfigured = !!config.apiKey?.trim() || !!config.apiKeyConfigured;
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
    if (
      config.provider !== "ollama" &&
      config.provider !== "openai-compatible" &&
      !apiKeyConfigured
    ) {
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
  }, [config, apiKeyConfigured, parseError, t.aiSettings.testSuccess, t.aiSettings.testResponseEmpty, errorMessages.no_key]);

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
                const baseUrl = PROVIDER_MODELS[provider]?.defaultBaseUrl;
                const defaultModel = getDefaultModelForProvider(provider, baseUrl);
                setConfig({
                  provider,
                  model: defaultModel,
                  customModelId: defaultModel === "custom" ? "" : undefined,
                  baseUrl,
                  temperature: getRecommendedTemperature(provider, defaultModel),
                });
              }}
              options={[
                ...Object.entries(PROVIDER_MODELS).map(([key, meta]) => ({
                  value: key,
                  label: meta.label,
                })),
                ...(licenseFeaturesForCloud
                  ? [{
                      value: LUMINA_CLOUD_PROVIDER_ID,
                      label: LUMINA_CLOUD_PROVIDER.label,
                    }]
                  : []),
              ]}
              optionLabelClassName="text-ui-caption"
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
                // Trim on every keystroke — paste-from-clipboard frequently
                // brings trailing whitespace / newlines that the upstream
                // rejects with the same 401 we'd get for a wrong key.
                onChange={(e) =>
                  setConfig({ apiKey: e.target.value.trim() })
                }
                // Select-all on focus so a paste into a field that already
                // has a saved key REPLACES it instead of inserting beside.
                // Without this, `<input type=password>` shows the old key as
                // dots, the cursor lands at click position, and a paste
                // merges old+new — produces a bogus concatenated "key" that
                // fails 401 with the OLD key's last-4 in the upstream error.
                onFocus={(e) => e.currentTarget.select()}
                placeholder={
                  config.provider === "ollama"
                    ? t.aiSettings.localModelNoKey
                    : apiKeyConfigured
                      ? t.aiSettings.imageModels?.apiKeyConfiguredPlaceholder ?? "API key saved (hidden)"
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

        {isMimoProvider && (
          <Field
            label={t.aiSettings.mimoEndpoint}
            hint={t.aiSettings.mimoEndpointHint}
          >
            {(id) => (
              <Select
                id={id}
                value={mimoEndpoint.defaultBaseUrl}
                onValueChange={(baseUrl) => {
                  const nextModels = getMimoModelsForBaseUrl(baseUrl);
                  const currentModelAvailable = nextModels.some(
                    (model) => model.id === config.model,
                  );
                  const nextModel = currentModelAvailable
                    ? config.model
                    : (nextModels[0]?.id ?? "custom");
                  setConfig({
                    baseUrl,
                    model: nextModel,
                    customModelId: undefined,
                    temperature: getRecommendedTemperature("mimo", nextModel),
                  });
                }}
                options={MIMO_ENDPOINTS.map((endpoint) => ({
                  value: endpoint.defaultBaseUrl,
                  label: endpoint.label,
                }))}
              />
            )}
          </Field>
        )}

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
              const providerModels = getModelsForProvider(
                config.provider as LLMProviderType,
                config.baseUrl,
              );
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
                  optionLabelClassName="text-ui-caption"
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
                onChange={(e) =>
                  setConfig({ customModelId: e.target.value.trim() })
                }
                onFocus={(e) => e.currentTarget.select()}
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
                onChange={(e) => {
                  const trimmed = e.target.value.trim();
                  setConfig({ baseUrl: trimmed || undefined });
                }}
                onFocus={(e) => e.currentTarget.select()}
                placeholder={
                  PROVIDER_MODELS[config.provider as LLMProviderType]
                    ?.defaultBaseUrl || "https://api.example.com/v1"
                }
              />
            )}
          </Field>
        )}

        {config.provider === "openai-compatible" && (
          <div className="space-y-3 border-t border-border/60 pt-3">
            <SectionHeader
              icon={<Info size={14} />}
              title={t.aiSettings.openAICompatibleAdvanced}
            />
            <Field
              label={t.aiSettings.contextWindow}
              hint={t.aiSettings.contextWindowHint}
            >
              {(id) => (
                <TextInput
                  id={id}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={config.contextWindow?.toString() ?? ""}
                  onChange={(e) =>
                    setConfig({
                      contextWindow: parsePositiveIntegerDraft(e.target.value),
                    })
                  }
                  placeholder="32000"
                />
              )}
            </Field>
            <Field
              label={t.aiSettings.maxOutputTokens}
              hint={t.aiSettings.maxOutputTokensHint}
            >
              {(id) => (
                <TextInput
                  id={id}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={config.maxOutputTokens?.toString() ?? ""}
                  onChange={(e) =>
                    setConfig({
                      maxOutputTokens: parsePositiveIntegerDraft(e.target.value),
                    })
                  }
                  placeholder="4096"
                />
              )}
            </Field>
          </div>
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

        {/* Explicit save controls for the main-model fields. Drafts above
            commit only when the user clicks Save (matches the image
            settings pattern). Reset reverts drafts to the persisted state. */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty || saving}
            className={[
              "rounded-ui-md border border-border bg-background px-3 py-1.5 text-xs",
              "text-muted-foreground transition-colors duration-fast ease-out-subtle",
              "hover:bg-accent hover:text-foreground",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
            ].join(" ")}
          >
            {t.aiSettings.resetButton}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!isDirty || saving}
            className={[
              "inline-flex items-center gap-1.5 rounded-ui-md border border-primary bg-primary px-3 py-1.5 text-xs",
              "text-primary-foreground transition-colors duration-fast ease-out-subtle",
              "hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
            ].join(" ")}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : null}
            {t.aiSettings.saveButton}
          </button>
        </div>
      </div>

      {/* Image Models — gpt-image-2 / Nano Banana / Seedream */}
      <ImageModelsSettings />

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
