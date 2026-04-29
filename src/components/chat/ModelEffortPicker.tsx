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
  type LLMProviderType,
} from "@/services/llm";

const MODEL_POPOVER_WIDTH = 240;

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
  const [open, setOpen] = useState(false);
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);

  const provider = config.provider as LLMProviderType;
  const effectiveModelId =
    config.model === "custom"
      ? (config.customModelId?.trim() ?? "")
      : config.model;
  const modelMeta = effectiveModelId
    ? findModelInCatalog(provider, effectiveModelId)
    : undefined;
  const providerModels = PROVIDER_MODELS[provider]?.models ?? [];
  const modelDisplayName =
    modelMeta?.name || effectiveModelId || t.aiSettings.model;

  const handleSelectModel = (modelId: string) => {
    if (modelId !== effectiveModelId) {
      void setConfig({ model: modelId });
    }
    setOpen(false);
  };

  return (
    <div className="flex items-end gap-1 self-end">
      <ChipButton
        triggerRef={modelTriggerRef}
        label={modelDisplayName}
        open={open}
        onClick={() => setOpen((prev) => !prev)}
        title={t.aiSettings.modelPicker.title}
        testId="model"
      />
      <Popover
        open={open}
        onOpenChange={setOpen}
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
    </div>
  );
}
