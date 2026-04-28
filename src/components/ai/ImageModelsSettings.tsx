import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Image as ImageIcon,
  Loader2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { useImageProvidersStore } from "@/stores/useImageProvidersStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import {
  Field,
  SectionHeader,
  Select,
  TextInput,
} from "@/components/ui";
import type {
  ImageProviderId,
  ImageProviderInfo,
} from "@/services/imageGen/types";

type TestStatus = "idle" | "testing" | "success" | "error";

interface DraftState {
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
  providerLabel: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  modelLabel: string;
  modelHint: string;
  baseUrlLabel: string;
  baseUrlHint: string;
  saveButton: string;
  resetButton: string;
  saved: string;
  saveFailed: string;
  clearKey: string;
}

function makeBlankDraft(provider: ImageProviderInfo): DraftState {
  return {
    apiKeyDraft: "",
    apiKeyDirty: false,
    modelDraft: "",
    baseUrlDraft: "",
    test: { status: "idle" },
  };
  // Note: model + baseUrl drafts get hydrated from persisted settings via
  // the syncing useEffect below. Starting blank avoids stale data when
  // the persisted values change between renders (e.g., after Save).
  void provider; // suppress unused
}

/**
 * Image Models settings — single-provider picker pattern that mirrors the
 * chat provider settings above it. Pick a provider from the dropdown,
 * edit Model / API Key / Base URL, hit Save. Same JSON-on-disk
 * persistence as chat keys (see store.ts → lumina-store.json), just
 * scoped under a different prefix.
 *
 * No "active" concept on the backend: all configured providers stay
 * simultaneously available to the agent. The picker is purely a view
 * selector — saving each provider's keys is independent.
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

  // Picker state — initial selection prefers a configured provider so the
  // user lands on a populated form rather than an empty default.
  const [selectedId, setSelectedId] = useState<ImageProviderId | null>(null);
  const selectedProvider = useMemo<ImageProviderInfo | null>(
    () => providers.find((p) => p.id === selectedId) ?? providers[0] ?? null,
    [providers, selectedId],
  );

  useEffect(() => {
    if (selectedId !== null) return;
    if (providers.length === 0) return;
    const firstConfigured = providers.find((p) => p.configured);
    setSelectedId((firstConfigured ?? providers[0]).id);
  }, [providers, selectedId]);

  // Drafts are per-provider so switching the picker doesn't lose what the
  // user typed in another section. API key drafts reset on switch (we
  // never want to leak one provider's pending key to another).
  const [drafts, setDrafts] = useState<Record<ImageProviderId, DraftState>>(
    () => ({}) as Record<ImageProviderId, DraftState>,
  );

  // Hydrate drafts from persisted settings on first load and after Save.
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const p of providers) {
        const persisted = settings.perProvider[p.id];
        const existing = next[p.id];
        if (!existing) {
          next[p.id] = {
            ...makeBlankDraft(p),
            modelDraft: persisted?.modelId ?? "",
            baseUrlDraft: persisted?.baseUrl ?? "",
          };
        } else if (!existing.apiKeyDirty) {
          // Only sync model/baseUrl when the apiKey isn't being actively
          // edited — otherwise an in-flight refresh races with the user's
          // typing.
          next[p.id] = {
            ...existing,
            modelDraft:
              existing.modelDraft === ""
                ? persisted?.modelId ?? ""
                : existing.modelDraft,
            baseUrlDraft:
              existing.baseUrlDraft === ""
                ? persisted?.baseUrl ?? ""
                : existing.baseUrlDraft,
          };
        }
      }
      return next;
    });
  }, [providers, settings]);

  const draft = selectedProvider ? drafts[selectedProvider.id] : undefined;
  const persistedForSelected = selectedProvider
    ? settings.perProvider[selectedProvider.id] ?? {}
    : {};

  const isDirty = useMemo(() => {
    if (!draft || !selectedProvider) return false;
    if (draft.apiKeyDirty && draft.apiKeyDraft.trim().length > 0) return true;
    const modelChanged =
      (draft.modelDraft || "") !== (persistedForSelected.modelId || "");
    const baseUrlChanged =
      (draft.baseUrlDraft || "") !== (persistedForSelected.baseUrl || "");
    return modelChanged || baseUrlChanged;
  }, [draft, selectedProvider, persistedForSelected]);

  const updateDraft = useCallback(
    (id: ImageProviderId, patch: Partial<DraftState>) => {
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? {
            apiKeyDraft: "",
            apiKeyDirty: false,
            modelDraft: "",
            baseUrlDraft: "",
            test: { status: "idle" } as DraftState["test"],
          }),
          ...patch,
        },
      }));
    },
    [],
  );

  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!selectedProvider || !draft) return;
    setSaving(true);
    try {
      // API key first — it's the secret-store write. Only commit when
      // user actually typed something; an empty draft means "leave the
      // existing key alone."
      if (draft.apiKeyDirty && draft.apiKeyDraft.trim().length > 0) {
        await setProviderApiKey(selectedProvider.id, draft.apiKeyDraft.trim());
      }
      // Then non-secret settings — only when changed, to avoid
      // touching the JSON file unnecessarily.
      const modelId = draft.modelDraft.trim() || undefined;
      const baseUrl = draft.baseUrlDraft.trim() || undefined;
      const before = persistedForSelected;
      if (
        (modelId ?? undefined) !== (before.modelId ?? undefined) ||
        (baseUrl ?? undefined) !== (before.baseUrl ?? undefined)
      ) {
        await setProviderSettings(selectedProvider.id, { modelId, baseUrl });
      }
      // Drop the apiKey draft — it's now in keychain. Keep the
      // model/baseUrl drafts so the form continues to show what the
      // user typed (matching what's now persisted).
      updateDraft(selectedProvider.id, {
        apiKeyDraft: "",
        apiKeyDirty: false,
      });
      toast.success(tImg?.saved ?? "Saved");
    } catch (err) {
      toast.error(tImg?.saveFailed ?? "Failed to save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }, [
    selectedProvider,
    draft,
    persistedForSelected,
    setProviderApiKey,
    setProviderSettings,
    updateDraft,
    tImg,
  ]);

  const handleReset = useCallback(() => {
    if (!selectedProvider) return;
    updateDraft(selectedProvider.id, {
      apiKeyDraft: "",
      apiKeyDirty: false,
      modelDraft: persistedForSelected.modelId ?? "",
      baseUrlDraft: persistedForSelected.baseUrl ?? "",
      test: { status: "idle" },
    });
  }, [selectedProvider, persistedForSelected, updateDraft]);

  const handleClearKey = useCallback(async () => {
    if (!selectedProvider) return;
    await setProviderApiKey(selectedProvider.id, "");
    updateDraft(selectedProvider.id, {
      apiKeyDraft: "",
      apiKeyDirty: false,
      test: { status: "idle" },
    });
  }, [selectedProvider, setProviderApiKey, updateDraft]);

  const handleTest = useCallback(async () => {
    if (!selectedProvider || !draft) return;
    const apiKey = draft.apiKeyDraft.trim();
    if (!apiKey && !selectedProvider.configured) {
      updateDraft(selectedProvider.id, {
        test: { status: "error", message: errorMessages.no_key },
      });
      return;
    }
    updateDraft(selectedProvider.id, { test: { status: "testing" } });
    try {
      const baseUrl = draft.baseUrlDraft.trim() || undefined;
      const result = await testProvider(selectedProvider.id, apiKey, baseUrl);
      updateDraft(selectedProvider.id, {
        test: result.success
          ? { status: "success", latency: result.latencyMs }
          : {
              status: "error",
              message:
                result.error ?? errorMessages.network ?? "Test failed",
            },
      });
    } catch (err) {
      updateDraft(selectedProvider.id, {
        test: {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }, [selectedProvider, draft, testProvider, updateDraft, errorMessages]);

  if (!selectedProvider || !draft) {
    return (
      <div className="space-y-3 pt-4 border-t border-border/60">
        <SectionHeader
          icon={<ImageIcon size={14} />}
          title={tImg?.title ?? "Image Models"}
        />
        {tImg?.description && (
          <p className="text-xs text-muted-foreground -mt-1">{tImg.description}</p>
        )}
      </div>
    );
  }

  const isConfigured = selectedProvider.configured;
  const apiKeyPlaceholder = isConfigured ? PLACEHOLDER_MASK : "sk-...";

  return (
    <div className="space-y-4 pt-4 border-t border-border/60">
      <SectionHeader
        icon={<ImageIcon size={14} />}
        title={tImg?.title ?? "Image Models"}
      />
      {tImg?.description && (
        <p className="text-xs text-muted-foreground -mt-1">{tImg.description}</p>
      )}

      <Field
        label={
          <span className="flex items-center justify-between gap-3">
            <span>{tImg?.providerLabel ?? "Provider"}</span>
            <span
              className={[
                "inline-flex shrink-0 items-center gap-1.5 text-[11px] font-normal",
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
          </span>
        }
      >
        {(id) => (
          <Select
            id={id}
            value={selectedProvider.id}
            onValueChange={(next) => setSelectedId(next as ImageProviderId)}
            options={providers.map((p) => ({
              value: p.id,
              label: `${p.label} · ${p.marketingName}`,
            }))}
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
                value={draft.apiKeyDraft}
                onChange={(e) =>
                  updateDraft(selectedProvider.id, {
                    apiKeyDraft: e.target.value.trim(),
                    apiKeyDirty: true,
                    test: { status: "idle" },
                  })
                }
                onFocus={(e) => e.currentTarget.select()}
                placeholder={apiKeyPlaceholder}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={draft.test.status === "testing"}
                className={[
                  "inline-flex shrink-0 items-center gap-1.5 rounded-ui-md border px-3 py-2 text-xs",
                  "transition-colors duration-fast ease-out-subtle",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  draft.test.status === "success"
                    ? "border-success/40 bg-success/5 text-success"
                    : draft.test.status === "error"
                      ? "border-destructive/40 bg-destructive/5 text-destructive"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                ].join(" ")}
                title={t.aiSettings.testButton}
              >
                {draft.test.status === "testing" ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    {t.aiSettings.testing}
                  </>
                ) : draft.test.status === "success" ? (
                  <>
                    <Check size={12} />
                    {t.aiSettings.testSuccessShort}
                  </>
                ) : draft.test.status === "error" ? (
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
            {draft.test.status === "error" && draft.test.message ? (
              <div className="flex items-start gap-1.5 rounded-ui-sm bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                <X size={12} className="mt-0.5 shrink-0" />
                <span>{draft.test.message}</span>
              </div>
            ) : draft.test.status === "success" ? (
              <div className="flex items-center gap-1.5 rounded-ui-sm bg-success/10 px-2 py-1.5 text-xs text-success">
                <Check size={12} />
                <span>
                  {t.aiSettings.testSuccessDetail}
                  {draft.test.latency
                    ? ` · ${(draft.test.latency / 1000).toFixed(1)}s`
                    : ""}
                </span>
              </div>
            ) : null}
            {isConfigured ? (
              <button
                type="button"
                onClick={() => void handleClearKey()}
                className="text-[11px] text-destructive/80 hover:text-destructive transition-colors duration-fast ease-out-subtle"
              >
                {tImg?.clearKey ?? "Remove API key"}
              </button>
            ) : null}
          </div>
        )}
      </Field>

      <Field label={tImg?.modelLabel ?? "Model"} hint={tImg?.modelHint}>
        {(id) => (
          <TextInput
            id={id}
            type="text"
            value={draft.modelDraft}
            onChange={(e) =>
              updateDraft(selectedProvider.id, {
                modelDraft: e.target.value.trim(),
              })
            }
            onFocus={(e) => e.currentTarget.select()}
            placeholder={selectedProvider.defaultModelId}
          />
        )}
      </Field>

      <Field label={tImg?.baseUrlLabel ?? "Base URL"} hint={tImg?.baseUrlHint}>
        {(id) => (
          <TextInput
            id={id}
            type="text"
            value={draft.baseUrlDraft}
            onChange={(e) =>
              updateDraft(selectedProvider.id, {
                baseUrlDraft: e.target.value.trim(),
              })
            }
            onFocus={(e) => e.currentTarget.select()}
            placeholder={selectedProvider.defaultBaseUrl}
          />
        )}
      </Field>

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
          {tImg?.resetButton ?? t.common.cancel}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!isDirty || saving}
          className={[
            "rounded-ui-md border border-primary bg-primary px-3 py-1.5 text-xs",
            "text-primary-foreground transition-colors duration-fast ease-out-subtle",
            "hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
          ].join(" ")}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : null}
          {tImg?.saveButton ?? t.common.save}
        </button>
      </div>
    </div>
  );
}
