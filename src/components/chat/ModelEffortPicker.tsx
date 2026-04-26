import { useRef, useState } from "react";
import { Check, ChevronRight, ChevronUp } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useAIStore } from "@/stores/useAIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverList,
  Row,
} from "@/components/ui";
import {
  PROVIDER_MODELS,
  findModelInCatalog,
  normalizeThinkingMode,
  supportedReasoningEfforts,
  supportsBinaryThinkingToggle,
  type LLMProviderType,
  type ReasoningEffort,
  type ThinkingMode,
} from "@/services/llm";

// Inline-show all models when the active provider has at most this many.
// More than this and we collapse the tail into a "其他模型 ›" submenu so the
// popover stays scannable.
const INLINE_MODEL_LIMIT = 3;

export function ModelEffortPicker() {
  const { t } = useLocaleStore();
  const { config, setConfig } = useAIStore(
    useShallow((s) => ({ config: s.config, setConfig: s.setConfig })),
  );
  const [open, setOpen] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const provider = config.provider as LLMProviderType;
  const effectiveModelId =
    config.model === "custom"
      ? (config.customModelId?.trim() ?? "")
      : config.model;
  const modelMeta = effectiveModelId
    ? findModelInCatalog(provider, effectiveModelId)
    : undefined;
  const providerModels = PROVIDER_MODELS[provider]?.models ?? [];

  const efforts = supportedReasoningEfforts(provider, effectiveModelId);
  const supportsBinaryToggle = supportsBinaryThinkingToggle(
    provider,
    effectiveModelId,
  );
  const thinkingMode = normalizeThinkingMode(config.thinkingMode);
  // Effort selector is shown whenever the model exposes effort levels. For
  // models that ALSO have a binary toggle, it's gated to "thinking" mode; for
  // pure effort-only models (e.g. GPT-5.5) it's the only thinking control and
  // is always visible alongside the model list.
  const effortVisible =
    !!efforts && (!supportsBinaryToggle || thinkingMode === "thinking");

  const effortLabel: Record<ReasoningEffort, string> = {
    none: t.aiSettings.reasoningEffortNone,
    low: t.aiSettings.reasoningEffortLow,
    medium: t.aiSettings.reasoningEffortMedium,
    high: t.aiSettings.reasoningEffortHigh,
    xhigh: t.aiSettings.reasoningEffortXHigh,
    max: t.aiSettings.reasoningEffortMax,
  };

  const modelDisplayName =
    modelMeta?.name || effectiveModelId || t.aiSettings.model;

  // Chip secondary segment (everything to the right of the model name):
  //  - effort-only models  → effort label (e.g. "medium")
  //  - param-toggle models → "thinking · effort" / "instant" / nothing for auto
  //  - models with no thinking control → no secondary
  let chipSecondary = "";
  if (supportsBinaryToggle) {
    if (thinkingMode === "thinking") {
      chipSecondary =
        efforts && config.reasoningEffort
          ? `${t.aiSettings.thinkingModeThinking} · ${effortLabel[config.reasoningEffort]}`
          : t.aiSettings.thinkingModeThinking;
    } else if (thinkingMode === "instant") {
      chipSecondary = t.aiSettings.thinkingModeInstant;
    }
  } else if (efforts && config.reasoningEffort) {
    chipSecondary = effortLabel[config.reasoningEffort];
  }

  const showMoreSubmenu = providerModels.length > INLINE_MODEL_LIMIT;
  const inlineModels =
    !showMoreSubmenu || showAllModels
      ? providerModels
      : providerModels.slice(0, INLINE_MODEL_LIMIT);

  const handleSelectModel = (modelId: string) => {
    // Pass only `model`. useAIStore.setConfig auto-resets reasoningEffort to
    // the new model's getDefaultReasoningEffort when the model changes and
    // the call did not specify a reasoningEffort. Passing it here explicitly
    // would skip that reset path.
    if (modelId !== effectiveModelId) {
      void setConfig({ model: modelId });
    }
    setShowAllModels(false);
    setOpen(false);
  };

  const handleSelectEffort = (effort: ReasoningEffort) => {
    if (effort !== config.reasoningEffort) {
      void setConfig({ reasoningEffort: effort });
    }
  };

  const handleSelectMode = (mode: ThinkingMode) => {
    if (mode !== thinkingMode) {
      void setConfig({ thinkingMode: mode });
    }
  };

  const modeLabel = (mode: ThinkingMode): string => {
    if (mode === "thinking") return t.aiSettings.thinkingModeThinking;
    if (mode === "instant") return t.aiSettings.thinkingModeInstant;
    return t.aiSettings.thinkingModeAuto;
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((p) => !p)}
        title={t.aiSettings.modelPicker.title}
        data-model-picker-trigger
        className={[
          "flex h-7 shrink-0 items-center gap-1 self-end rounded-full px-2",
          "text-xs transition-colors duration-fast ease-out-subtle",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
          open
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        ].join(" ")}
      >
        <span className="block max-w-[110px] truncate font-medium">
          {modelDisplayName}
        </span>
        {chipSecondary ? (
          <>
            <span className="opacity-60">·</span>
            <span className="block truncate text-muted-foreground">
              {chipSecondary}
            </span>
          </>
        ) : null}
        <ChevronUp size={12} className="shrink-0 opacity-70" />
      </button>

      <Popover open={open} onOpenChange={setOpen} anchor={triggerRef}>
        <PopoverContent
          placement="top-end"
          width={260}
          data-model-picker-content
        >
          <PopoverHeader>{t.aiSettings.modelPicker.title}</PopoverHeader>
          <PopoverList>
            {inlineModels.length === 0 ? (
              <Row
                title={modelDisplayName}
                selected
                trailing={<Check size={14} />}
                onSelect={() => setOpen(false)}
              />
            ) : (
              <>
                {inlineModels.map((m) => (
                  <Row
                    key={m.id}
                    title={m.name}
                    selected={m.id === effectiveModelId}
                    trailing={
                      m.id === effectiveModelId ? <Check size={14} /> : null
                    }
                    onSelect={() => handleSelectModel(m.id)}
                  />
                ))}
                {showMoreSubmenu && !showAllModels && (
                  <Row
                    title={t.aiSettings.modelPicker.moreModels}
                    trailing={<ChevronRight size={14} />}
                    onSelect={() => setShowAllModels(true)}
                  />
                )}
              </>
            )}
          </PopoverList>

          {supportsBinaryToggle && (
            <>
              <div className="border-t border-border/60" />
              <PopoverHeader>{t.aiSettings.thinkingMode}</PopoverHeader>
              <PopoverList>
                {(["auto", "thinking", "instant"] as ThinkingMode[]).map(
                  (m) => (
                    <Row
                      key={m}
                      title={modeLabel(m)}
                      selected={thinkingMode === m}
                      trailing={
                        thinkingMode === m ? <Check size={14} /> : null
                      }
                      onSelect={() => handleSelectMode(m)}
                    />
                  ),
                )}
              </PopoverList>
            </>
          )}

          {efforts && effortVisible && (
            <>
              <div className="border-t border-border/60" />
              <PopoverHeader>{t.aiSettings.reasoningEffort}</PopoverHeader>
              <PopoverList>
                {efforts.map((eff) => (
                  <Row
                    key={eff}
                    title={effortLabel[eff]}
                    selected={config.reasoningEffort === eff}
                    trailing={
                      config.reasoningEffort === eff ? (
                        <Check size={14} />
                      ) : null
                    }
                    onSelect={() => handleSelectEffort(eff)}
                  />
                ))}
              </PopoverList>
            </>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}
