import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Image as ImageIcon,
  Loader2,
  X,
  Zap,
} from "lucide-react";

import { useImageProvidersStore } from "@/stores/useImageProvidersStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { Field, SectionHeader, TextInput } from "@/components/ui";
import type {
  ImageProviderId,
  ImageProviderInfo,
} from "@/services/imageGen/types";

type TestStatus = "idle" | "testing" | "success" | "error";

interface RowState {
  apiKeyDraft: string;
  apiKeyDirty: boolean;
  modelDraft: string;
  baseUrlDraft: string;
  test: { status: TestStatus; latency?: number; message?: string };
}

const PLACEHOLDER_MASK = "•••••••••••••••••••••";

interface ImageModelsStrings {
  title: string;
  description: string;
  statusConfigured: string;
  statusNotConfigured: string;
  apiKeyPlaceholder: string;
  modelLabel: string;
  modelHint: string;
  baseUrlLabel: string;
  baseUrlHint: string;
  apiKeyLabel: string;
  clearKey: string;
}

/**
 * Image-models section in AI Settings — labeled-field form per provider,
 * matching the chat provider settings pattern (Provider / Model / API Key /
 * Base URL). No marketing cards; the section reads as three small sub-forms
 * stacked vertically with a status dot in each header.
 */
export function ImageModelsSettings() {
  const { t } = useLocaleStore();
  const tImg = (t.aiSettings as Record<string, unknown>).imageModels as
    | ImageModelsStrings
    | undefined;
  const errorMessages = (t.aiSettings as { errors?: Record<string, string> })
    .errors ?? {};

  const {
    providers,
    settings,
    loaded,
    refresh,
    setProviderApiKey,
    setProviderSettings,
    testProvider,
  } = useImageProvidersStore();

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  const [rows, setRows] = useState<Record<ImageProviderId, RowState>>(
    () => ({}) as Record<ImageProviderId, RowState>,
  );

  // Sync local drafts with the latest server snapshot. Untouched rows
  // adopt persisted values; rows the user is actively editing keep theirs.
  useEffect(() => {
    setRows((prev) => {
      const next = { ...prev };
      for (const p of providers) {
        const existing = next[p.id];
        const persisted = settings.perProvider[p.id];
        if (!existing) {
          next[p.id] = {
            apiKeyDraft: "",
            apiKeyDirty: false,
            modelDraft: persisted?.modelId ?? "",
            baseUrlDraft: persisted?.baseUrl ?? "",
            test: { status: "idle" },
          };
        } else {
          // Pull through fresh persisted values for fields the user hasn't
          // touched. Comparing to "" is the heuristic for "untouched."
          let updated = existing;
          if (existing.modelDraft === "" && persisted?.modelId) {
            updated = { ...updated, modelDraft: persisted.modelId };
          }
          if (existing.baseUrlDraft === "" && persisted?.baseUrl) {
            updated = { ...updated, baseUrlDraft: persisted.baseUrl };
          }
          if (updated !== existing) next[p.id] = updated;
        }
      }
      return next;
    });
  }, [providers, settings]);

  const updateRow = useCallback(
    (id: ImageProviderId, patch: Partial<RowState>) => {
      setRows((prev) => {
        const existing =
          prev[id] ??
          ({
            apiKeyDraft: "",
            apiKeyDirty: false,
            modelDraft: "",
            baseUrlDraft: "",
            test: { status: "idle" } as RowState["test"],
          } satisfies RowState);
        return { ...prev, [id]: { ...existing, ...patch } };
      });
    },
    [],
  );

  const persistSettings = useCallback(
    async (provider: ImageProviderInfo, row: RowState) => {
      const modelId = row.modelDraft.trim() || undefined;
      const baseUrl = row.baseUrlDraft.trim() || undefined;
      // Skip when nothing actually changed.
      const persisted = settings.perProvider[provider.id] ?? {};
      if (persisted.modelId === modelId && persisted.baseUrl === baseUrl) {
        return;
      }
      await setProviderSettings(provider.id, { modelId, baseUrl });
    },
    [settings, setProviderSettings],
  );

  const handleTest = useCallback(
    async (provider: ImageProviderInfo, row: RowState) => {
      const draftKey = row.apiKeyDraft.trim();
      const apiKey = draftKey.length > 0 ? draftKey : "";
      if (!apiKey && !provider.configured) {
        updateRow(provider.id, {
          test: { status: "error", message: errorMessages.no_key },
        });
        return;
      }
      updateRow(provider.id, { test: { status: "testing" } });
      try {
        const baseUrl = row.baseUrlDraft.trim() || undefined;
        const result = await testProvider(provider.id, apiKey, baseUrl);
        updateRow(provider.id, {
          test: result.success
            ? { status: "success", latency: result.latencyMs }
            : {
                status: "error",
                message:
                  result.error ?? errorMessages.network ?? "Test failed",
              },
        });
      } catch (err) {
        updateRow(provider.id, {
          test: {
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    },
    [testProvider, updateRow, errorMessages],
  );

  return (
    <div className="space-y-3 pt-4 border-t border-border/60">
      <SectionHeader
        icon={<ImageIcon size={14} />}
        title={tImg?.title ?? "Image Models"}
      />
      {tImg?.description && (
        <p className="text-xs text-muted-foreground -mt-1">{tImg.description}</p>
      )}

      <div className="space-y-5">
        {providers.map((p) => {
          const row =
            rows[p.id] ??
            ({
              apiKeyDraft: "",
              apiKeyDirty: false,
              modelDraft: settings.perProvider[p.id]?.modelId ?? "",
              baseUrlDraft: settings.perProvider[p.id]?.baseUrl ?? "",
              test: { status: "idle" } as RowState["test"],
            } satisfies RowState);
          return (
            <ProviderForm
              key={p.id}
              provider={p}
              row={row}
              tImg={tImg}
              onApiKeyChange={(value) =>
                updateRow(p.id, {
                  apiKeyDraft: value,
                  apiKeyDirty: true,
                  test: { status: "idle" },
                })
              }
              onApiKeyCommit={async () => {
                const draft = row.apiKeyDraft.trim();
                if (!draft) return;
                await setProviderApiKey(p.id, draft);
                updateRow(p.id, { apiKeyDraft: "", apiKeyDirty: false });
              }}
              onClearKey={async () => {
                await setProviderApiKey(p.id, "");
                updateRow(p.id, {
                  apiKeyDraft: "",
                  apiKeyDirty: false,
                  test: { status: "idle" },
                });
              }}
              onModelChange={(value) =>
                updateRow(p.id, { modelDraft: value })
              }
              onModelCommit={async () => {
                await persistSettings(p, row);
              }}
              onBaseUrlChange={(value) =>
                updateRow(p.id, { baseUrlDraft: value })
              }
              onBaseUrlCommit={async () => {
                await persistSettings(p, row);
              }}
              onTest={() => handleTest(p, row)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ProviderFormProps {
  provider: ImageProviderInfo;
  row: RowState;
  tImg: ImageModelsStrings | undefined;
  onApiKeyChange: (value: string) => void;
  onApiKeyCommit: () => void | Promise<void>;
  onClearKey: () => void | Promise<void>;
  onModelChange: (value: string) => void;
  onModelCommit: () => void | Promise<void>;
  onBaseUrlChange: (value: string) => void;
  onBaseUrlCommit: () => void | Promise<void>;
  onTest: () => void | Promise<void>;
}

function ProviderForm({
  provider,
  row,
  tImg,
  onApiKeyChange,
  onApiKeyCommit,
  onClearKey,
  onModelChange,
  onModelCommit,
  onBaseUrlChange,
  onBaseUrlCommit,
  onTest,
}: ProviderFormProps) {
  const { t } = useLocaleStore();
  const isConfigured = provider.configured;
  const apiKeyPlaceholder = useMemo(
    () => (isConfigured ? PLACEHOLDER_MASK : "sk-..."),
    [isConfigured],
  );

  return (
    <div className="space-y-3">
      {/* Provider header — label + marketing name + status dot */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground">
            {provider.label}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground/70">
            {provider.marketingName}
          </span>
        </div>
        <span
          className={[
            "inline-flex shrink-0 items-center gap-1.5 text-[11px]",
            isConfigured ? "text-success" : "text-muted-foreground/70",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-1.5 w-1.5 rounded-full",
              isConfigured ? "bg-success" : "bg-muted-foreground/40",
            ].join(" ")}
            aria-hidden
          />
          {isConfigured
            ? tImg?.statusConfigured ?? "Configured"
            : tImg?.statusNotConfigured ?? "Not configured"}
        </span>
      </div>

      {/* Form fields — Provider / Model / API Key / Base URL pattern */}
      <div className="space-y-3">
        <Field label={tImg?.modelLabel ?? "Model"}>
          {(id) => (
            <TextInput
              id={id}
              type="text"
              value={row.modelDraft}
              onChange={(e) => onModelChange(e.target.value.trim())}
              onBlur={() => void onModelCommit()}
              onFocus={(e) => e.currentTarget.select()}
              placeholder={provider.defaultModelId}
            />
          )}
        </Field>

        <Field label={tImg?.apiKeyLabel ?? "API Key"}>
          {(id) => (
            <div className="space-y-2">
              <div className="flex gap-2">
                <TextInput
                  id={id}
                  type="password"
                  value={row.apiKeyDraft}
                  onChange={(e) => onApiKeyChange(e.target.value.trim())}
                  onBlur={() => {
                    if (row.apiKeyDirty && row.apiKeyDraft.trim().length > 0) {
                      void onApiKeyCommit();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void onApiKeyCommit();
                    }
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder={apiKeyPlaceholder}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => void onTest()}
                  disabled={row.test.status === "testing"}
                  className={[
                    "inline-flex shrink-0 items-center gap-1.5 rounded-ui-md border px-3 py-2 text-xs",
                    "transition-colors duration-fast ease-out-subtle",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    row.test.status === "success"
                      ? "border-success/40 bg-success/5 text-success"
                      : row.test.status === "error"
                        ? "border-destructive/40 bg-destructive/5 text-destructive"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  ].join(" ")}
                  title={t.aiSettings.testButton}
                >
                  {row.test.status === "testing" ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      {t.aiSettings.testing}
                    </>
                  ) : row.test.status === "success" ? (
                    <>
                      <Check size={12} />
                      {t.aiSettings.testSuccessShort}
                    </>
                  ) : row.test.status === "error" ? (
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
              {row.test.status === "error" && row.test.message ? (
                <div className="flex items-start gap-1.5 rounded-ui-sm bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  <X size={12} className="mt-0.5 shrink-0" />
                  <span>{row.test.message}</span>
                </div>
              ) : row.test.status === "success" ? (
                <div className="flex items-center gap-1.5 rounded-ui-sm bg-success/10 px-2 py-1.5 text-xs text-success">
                  <Check size={12} />
                  <span>
                    {t.aiSettings.testSuccessDetail}
                    {row.test.latency
                      ? ` · ${(row.test.latency / 1000).toFixed(1)}s`
                      : ""}
                  </span>
                </div>
              ) : null}
              {isConfigured ? (
                <button
                  type="button"
                  onClick={() => void onClearKey()}
                  className="text-[11px] text-destructive/80 hover:text-destructive transition-colors duration-fast ease-out-subtle"
                >
                  {tImg?.clearKey ?? "Remove API key"}
                </button>
              ) : null}
            </div>
          )}
        </Field>

        <Field label={tImg?.baseUrlLabel ?? "Base URL"}>
          {(id) => (
            <TextInput
              id={id}
              type="text"
              value={row.baseUrlDraft}
              onChange={(e) => onBaseUrlChange(e.target.value.trim())}
              onBlur={() => void onBaseUrlCommit()}
              onFocus={(e) => e.currentTarget.select()}
              placeholder={provider.defaultBaseUrl}
            />
          )}
        </Field>
      </div>
    </div>
  );
}
