import { useRef, useState, type MutableRefObject } from "react";
import { Check, ChevronUp } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useAIStore } from "@/stores/useAIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import {
  Popover,
  PopoverContent,
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

type OpenChip = "model" | "mode" | "effort" | null;

const MODEL_POPOVER_WIDTH = 240;
const AXIS_POPOVER_WIDTH = 200;

interface ChipButtonProps {
  triggerRef: MutableRefObject<HTMLButtonElement | null>;
  label: string;
  open: boolean;
  onClick: () => void;
  title: string;
  testId: string;
}

function ChipButton({
  triggerRef,
  label,
  open,
  onClick,
  title,
  testId,
}: ChipButtonProps) {
  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={onClick}
      title={title}
      data-chip={testId}
      className={[
        "flex h-7 shrink-0 items-center gap-1 self-end rounded-full px-2",
        "text-xs",
        // Spotify-style micro-motion: bg + 1px lift + soft shadow ride together
        // on a single 200ms ease so the chip "rises" smoothly on hover, and
        // stays risen while its popover is open.
        "transition-[background-color,color,transform,box-shadow] duration-content ease-out-subtle",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        open
          ? "bg-accent text-foreground -translate-y-px shadow-elev-1"
          : "text-muted-foreground hover:bg-accent hover:text-foreground hover:-translate-y-px hover:shadow-elev-1",
      ].join(" ")}
    >
      <span className="block max-w-[140px] truncate font-medium">{label}</span>
      <ChevronUp
        size={12}
        className={[
          "shrink-0 transition-opacity duration-content ease-out-subtle",
          open ? "opacity-100" : "opacity-70",
        ].join(" ")}
      />
    </button>
  );
}

export function ModelEffortPicker() {
  const { t } = useLocaleStore();
  const { config, setConfig } = useAIStore(
    useShallow((s) => ({ config: s.config, setConfig: s.setConfig })),
  );
  const [openChip, setOpenChip] = useState<OpenChip>(null);

  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const effortTriggerRef = useRef<HTMLButtonElement | null>(null);

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
  // Effort chip: visible whenever the model declares supported efforts. For
  // param-toggle models the effort axis is gated to "thinking" mode (instant
  // means no reasoning, so the depth selector is irrelevant). Effort-only
  // models always expose efforts as their sole reasoning surface.
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

  const modeOptions: ThinkingMode[] = ["thinking", "instant"];
  const modeLabel = (mode: ThinkingMode): string =>
    mode === "thinking"
      ? t.aiSettings.thinkingModeThinking
      : t.aiSettings.thinkingModeInstant;

  // Effort chip displays the resolved effort: explicit user selection if any,
  // otherwise the model's API default (so the chip is never blank for
  // effort-only models on first render).
  const effortDefault = modelMeta?.reasoning && "defaultEffort" in modelMeta.reasoning
    ? (modelMeta.reasoning.defaultEffort as ReasoningEffort | undefined)
    : undefined;
  const displayedEffort: ReasoningEffort | undefined =
    config.reasoningEffort ?? effortDefault;

  const handleSelectModel = (modelId: string) => {
    // Pass only `model`. useAIStore.setConfig auto-resets reasoningEffort to
    // the new model's getDefaultReasoningEffort when the model changes and
    // the call did not specify a reasoningEffort. Passing it here explicitly
    // would skip that reset path.
    if (modelId !== effectiveModelId) {
      void setConfig({ model: modelId });
    }
    setOpenChip(null);
  };

  const handleSelectEffort = (effort: ReasoningEffort) => {
    if (effort !== config.reasoningEffort) {
      void setConfig({ reasoningEffort: effort });
    }
    setOpenChip(null);
  };

  const handleSelectMode = (mode: ThinkingMode) => {
    if (mode !== thinkingMode) {
      void setConfig({ thinkingMode: mode });
    }
    setOpenChip(null);
  };

  const toggleChip = (next: Exclude<OpenChip, null>) => {
    setOpenChip((prev) => (prev === next ? null : next));
  };

  return (
    <div className="flex items-end gap-1 self-end">
      <ChipButton
        triggerRef={modelTriggerRef}
        label={modelDisplayName}
        open={openChip === "model"}
        onClick={() => toggleChip("model")}
        title={t.aiSettings.modelPicker.title}
        testId="model"
      />
      <Popover
        open={openChip === "model"}
        onOpenChange={(next) => setOpenChip(next ? "model" : null)}
        anchor={modelTriggerRef}
      >
        <PopoverContent
          placement="top-end"
          width={MODEL_POPOVER_WIDTH}
          data-chip-popover="model"
        >
          <PopoverList>
            {providerModels.length === 0 ? (
              <Row
                density="compact"
                title={t.aiSettings.modelPicker.configureInSettings}
                disabled
              />
            ) : (
              providerModels.map((m) => (
                <Row
                  key={m.id}
                  density="compact"
                  title={m.name}
                  selected={m.id === effectiveModelId}
                  trailing={
                    m.id === effectiveModelId ? <Check size={14} /> : null
                  }
                  onSelect={() => handleSelectModel(m.id)}
                />
              ))
            )}
          </PopoverList>
        </PopoverContent>
      </Popover>

      {supportsBinaryToggle && (
        <>
          <ChipButton
            triggerRef={modeTriggerRef}
            label={modeLabel(thinkingMode)}
            open={openChip === "mode"}
            onClick={() => toggleChip("mode")}
            title={t.aiSettings.thinkingMode}
            testId="mode"
          />
          <Popover
            open={openChip === "mode"}
            onOpenChange={(next) => setOpenChip(next ? "mode" : null)}
            anchor={modeTriggerRef}
          >
            <PopoverContent
              placement="top-end"
              width={AXIS_POPOVER_WIDTH}
              data-chip-popover="mode"
            >
              <PopoverList>
                {modeOptions.map((m) => (
                  <Row
                    key={m}
                    density="compact"
                    title={modeLabel(m)}
                    selected={thinkingMode === m}
                    trailing={
                      thinkingMode === m ? <Check size={14} /> : null
                    }
                    onSelect={() => handleSelectMode(m)}
                  />
                ))}
              </PopoverList>
            </PopoverContent>
          </Popover>
        </>
      )}

      {efforts && effortVisible && (
        <>
          <ChipButton
            triggerRef={effortTriggerRef}
            label={
              displayedEffort
                ? effortLabel[displayedEffort]
                : t.aiSettings.reasoningEffort
            }
            open={openChip === "effort"}
            onClick={() => toggleChip("effort")}
            title={t.aiSettings.reasoningEffort}
            testId="effort"
          />
          <Popover
            open={openChip === "effort"}
            onOpenChange={(next) => setOpenChip(next ? "effort" : null)}
            anchor={effortTriggerRef}
          >
            <PopoverContent
              placement="top-end"
              width={AXIS_POPOVER_WIDTH}
              data-chip-popover="effort"
            >
              <PopoverList>
                {efforts.map((eff) => (
                  <Row
                    key={eff}
                    density="compact"
                    title={effortLabel[eff]}
                    selected={displayedEffort === eff}
                    trailing={
                      displayedEffort === eff ? <Check size={14} /> : null
                    }
                    onSelect={() => handleSelectEffort(eff)}
                  />
                ))}
              </PopoverList>
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  );
}
