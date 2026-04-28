import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  X,
  Zap,
} from "lucide-react";

import { useImageProvidersStore } from "@/stores/useImageProvidersStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { Field, SectionHeader, TextInput } from "@/components/ui";
import type { ImageProviderId, ImageProviderInfo } from "@/services/imageGen/types";

type TestStatus = "idle" | "testing" | "success" | "error";

interface RowState {
  apiKeyDraft: string;
  /** Has the user typed in this field since the row mounted? Determines whether
   *  we replace the masked placeholder vs append. */
  apiKeyDirty: boolean;
  baseUrlDraft: string;
  expanded: boolean;
  test: { status: TestStatus; latency?: number; message?: string };
}

const PLACEHOLDER_MASK = "•••••••••••••••••••••";

/**
 * ImageModelsSettings — the third section of AI Settings.
 *
 * Lists the three image-generation providers Lumina supports. Each row is
 * one always-visible API key field + an expandable "Advanced" panel for the
 * baseURL override and any future per-provider knobs. Test connection lives
 * inline so the user immediately learns whether the key was accepted.
 *
 * Unlike chat providers there is no "active" picker: all configured image
 * providers stay simultaneously available to the agent. The image-gen
 * skill's playbook tells the agent which model to choose for which intent.
 */
export function ImageModelsSettings() {
  const { t } = useLocaleStore();
  const tImg = (t.aiSettings as Record<string, unknown>).imageModels as
    | {
        title: string;
        description: string;
        statusConfigured: string;
        statusNotConfigured: string;
        apiKeyPlaceholder: string;
        baseUrlLabel: string;
        baseUrlHint: string;
        advanced: string;
        clearKey: string;
      }
    | undefined;
  const errorMessages = (t.aiSettings as { errors?: Record<string, string> })
    .errors ?? {};

  const { providers, settings, loaded, refresh, setProviderApiKey, setProviderSettings, testProvider } =
    useImageProvidersStore();

  // Bootstrap on first mount.
  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  const [rows, setRows] = useState<Record<ImageProviderId, RowState>>(
    () => ({}) as Record<ImageProviderId, RowState>,
  );

  // Sync per-row state with the latest server snapshot whenever providers /
  // settings refresh. Untouched rows track upstream; rows the user is
  // actively editing keep their drafts.
  useEffect(() => {
    setRows((prev) => {
      const next = { ...prev };
      for (const p of providers) {
        const existing = next[p.id];
        const baseUrlFromSettings = settings.perProvider[p.id]?.baseUrl ?? "";
        if (!existing) {
          next[p.id] = {
            apiKeyDraft: "",
            apiKeyDirty: false,
            baseUrlDraft: baseUrlFromSettings,
            expanded: false,
            test: { status: "idle" },
          };
        } else if (!existing.apiKeyDirty && existing.baseUrlDraft === "" && baseUrlFromSettings) {
          // Pull baseUrl in if user hasn't started editing.
          next[p.id] = { ...existing, baseUrlDraft: baseUrlFromSettings };
        }
      }
      return next;
    });
  }, [providers, settings]);

  return (
    <div className="space-y-3 pt-4 border-t border-border/60">
      <SectionHeader
        icon={<ImageIcon size={14} />}
        title={tImg?.title ?? "Image Models"}
      />
      {tImg?.description && (
        <p className="text-xs text-muted-foreground -mt-1">{tImg.description}</p>
      )}

      <div className="space-y-2">
        {providers.map((p) => (
          <ProviderRow
            key={p.id}
            provider={p}
            row={
              rows[p.id] ?? {
                apiKeyDraft: "",
                apiKeyDirty: false,
                baseUrlDraft: settings.perProvider[p.id]?.baseUrl ?? "",
                expanded: false,
                test: { status: "idle" },
              }
            }
            tImg={tImg}
            errorMessages={errorMessages}
            onToggleExpanded={() =>
              setRows((prev) => ({
                ...prev,
                [p.id]: {
                  ...(prev[p.id] ?? {
                    apiKeyDraft: "",
                    apiKeyDirty: false,
                    baseUrlDraft: settings.perProvider[p.id]?.baseUrl ?? "",
                    expanded: false,
                    test: { status: "idle" },
                  }),
                  expanded: !prev[p.id]?.expanded,
                },
              }))
            }
            onApiKeyChange={(value) =>
              setRows((prev) => ({
                ...prev,
                [p.id]: {
                  ...(prev[p.id] ?? {
                    apiKeyDraft: "",
                    apiKeyDirty: false,
                    baseUrlDraft: settings.perProvider[p.id]?.baseUrl ?? "",
                    expanded: false,
                    test: { status: "idle" },
                  }),
                  apiKeyDraft: value,
                  apiKeyDirty: true,
                  test: { status: "idle" },
                },
              }))
            }
            onApiKeyCommit={async () => {
              const draft = rows[p.id]?.apiKeyDraft.trim() ?? "";
              if (!draft) return; // empty commit is a no-op (use Clear button)
              await setProviderApiKey(p.id, draft);
              setRows((prev) => ({
                ...prev,
                [p.id]: {
                  ...(prev[p.id] ?? {
                    apiKeyDraft: "",
                    apiKeyDirty: false,
                    baseUrlDraft: settings.perProvider[p.id]?.baseUrl ?? "",
                    expanded: false,
                    test: { status: "idle" },
                  }),
                  apiKeyDraft: "",
                  apiKeyDirty: false,
                },
              }));
            }}
            onClearKey={async () => {
              await setProviderApiKey(p.id, "");
              setRows((prev) => ({
                ...prev,
                [p.id]: {
                  ...(prev[p.id] ?? {
                    apiKeyDraft: "",
                    apiKeyDirty: false,
                    baseUrlDraft: settings.perProvider[p.id]?.baseUrl ?? "",
                    expanded: false,
                    test: { status: "idle" },
                  }),
                  apiKeyDraft: "",
                  apiKeyDirty: false,
                  test: { status: "idle" },
                },
              }));
            }}
            onBaseUrlChange={(value) =>
              setRows((prev) => ({
                ...prev,
                [p.id]: {
                  ...(prev[p.id] ?? {
                    apiKeyDraft: "",
                    apiKeyDirty: false,
                    baseUrlDraft: "",
                    expanded: true,
                    test: { status: "idle" },
                  }),
                  baseUrlDraft: value,
                },
              }))
            }
            onBaseUrlCommit={async () => {
              const draft = rows[p.id]?.baseUrlDraft.trim();
              await setProviderSettings(p.id, { baseUrl: draft || undefined });
            }}
            onTest={async () => {
              const draft = rows[p.id]?.apiKeyDraft.trim();
              // If the user hasn't typed a new key, test the saved one. We
              // don't have read-back so we send an empty string and let the
              // backend resolve from keychain.
              const apiKey = draft && draft.length > 0 ? draft : "";
              if (!apiKey && !p.configured) {
                setRows((prev) => ({
                  ...prev,
                  [p.id]: {
                    ...(prev[p.id] ?? {
                      apiKeyDraft: "",
                      apiKeyDirty: false,
                      baseUrlDraft: "",
                      expanded: false,
                      test: { status: "idle" },
                    }),
                    test: { status: "error", message: errorMessages.no_key },
                  },
                }));
                return;
              }
              setRows((prev) => ({
                ...prev,
                [p.id]: {
                  ...(prev[p.id] ?? {
                    apiKeyDraft: "",
                    apiKeyDirty: false,
                    baseUrlDraft: "",
                    expanded: false,
                    test: { status: "idle" },
                  }),
                  test: { status: "testing" },
                },
              }));
              try {
                const baseUrl = rows[p.id]?.baseUrlDraft.trim() || undefined;
                const result = await testProvider(p.id, apiKey, baseUrl);
                setRows((prev) => ({
                  ...prev,
                  [p.id]: {
                    ...(prev[p.id] ?? {
                      apiKeyDraft: "",
                      apiKeyDirty: false,
                      baseUrlDraft: "",
                      expanded: false,
                      test: { status: "idle" },
                    }),
                    test: result.success
                      ? {
                          status: "success",
                          latency: result.latencyMs,
                        }
                      : {
                          status: "error",
                          message:
                            result.error ?? errorMessages.network ?? "Test failed",
                        },
                  },
                }));
              } catch (err) {
                setRows((prev) => ({
                  ...prev,
                  [p.id]: {
                    ...(prev[p.id] ?? {
                      apiKeyDraft: "",
                      apiKeyDirty: false,
                      baseUrlDraft: "",
                      expanded: false,
                      test: { status: "idle" },
                    }),
                    test: {
                      status: "error",
                      message: err instanceof Error ? err.message : String(err),
                    },
                  },
                }));
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface ProviderRowProps {
  provider: ImageProviderInfo;
  row: RowState;
  tImg:
    | {
        title: string;
        description: string;
        statusConfigured: string;
        statusNotConfigured: string;
        apiKeyPlaceholder: string;
        baseUrlLabel: string;
        baseUrlHint: string;
        advanced: string;
        clearKey: string;
      }
    | undefined;
  errorMessages: Record<string, string>;
  onToggleExpanded: () => void;
  onApiKeyChange: (value: string) => void;
  onApiKeyCommit: () => void | Promise<void>;
  onClearKey: () => void | Promise<void>;
  onBaseUrlChange: (value: string) => void;
  onBaseUrlCommit: () => void | Promise<void>;
  onTest: () => void | Promise<void>;
}

function ProviderRow({
  provider,
  row,
  tImg,
  onToggleExpanded,
  onApiKeyChange,
  onApiKeyCommit,
  onClearKey,
  onBaseUrlChange,
  onBaseUrlCommit,
  onTest,
}: ProviderRowProps) {
  const { t } = useLocaleStore();
  const isConfigured = provider.configured;
  const placeholder = useMemo(
    () => (isConfigured ? PLACEHOLDER_MASK : "sk-..."),
    [isConfigured],
  );

  return (
    <div className="rounded-ui-md border border-border bg-muted/30 transition-colors duration-fast ease-out-subtle hover:border-border hover:bg-muted/40">
      {/* Header row — provider identity + status */}
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">
            {provider.label}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {provider.marketingName}
          </span>
        </div>
        <span
          className={[
            "inline-flex shrink-0 items-center gap-1.5 text-[11px]",
            isConfigured ? "text-success" : "text-muted-foreground/70",
          ].join(" ")}
          title={
            isConfigured
              ? tImg?.statusConfigured ?? "Configured"
              : tImg?.statusNotConfigured ?? "Not configured"
          }
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

      {/* Description */}
      <p className="px-3 -mt-0.5 pb-2 text-xs text-muted-foreground">
        {provider.description}
      </p>

      {/* Body — key + test */}
      <div className="space-y-2 px-3 pb-3">
        <div className="flex gap-2">
          <TextInput
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
            placeholder={placeholder}
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

        {/* Advanced disclosure */}
        <div>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="inline-flex items-center gap-1 rounded-ui-sm text-[11px] text-muted-foreground hover:text-foreground transition-colors duration-fast ease-out-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <ChevronDown
              size={11}
              className={[
                "transition-transform duration-fast ease-out-subtle",
                row.expanded ? "rotate-0" : "-rotate-90",
              ].join(" ")}
            />
            {tImg?.advanced ?? "Advanced"}
          </button>
          {row.expanded && (
            <div className="mt-2 space-y-2 pl-4 border-l border-border/40">
              <Field
                label={tImg?.baseUrlLabel ?? "Base URL"}
                hint={tImg?.baseUrlHint ?? `Default: ${provider.defaultBaseUrl}`}
              >
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
        </div>
      </div>
    </div>
  );
}
