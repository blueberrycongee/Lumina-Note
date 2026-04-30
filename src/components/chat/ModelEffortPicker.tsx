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
  getMimoModelsForBaseUrl,
  type AgentModelMeta as ModelMeta,
  type LLMProviderType,
} from "@/services/llm";
import { cn } from "@/lib/utils";

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
      <span className="block max-w-[88px] truncate font-medium">{label}</span>
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

function getProviderModels(provider: LLMProviderType, baseUrl?: string) {
  return provider === "mimo"
    ? getMimoModelsForBaseUrl(baseUrl)
    : (PROVIDER_MODELS[provider]?.models ?? []);
}

function getCompactModelName(provider: LLMProviderType, name: string) {
  const withoutParenthetical = name.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  const providerScoped = (() => {
    switch (provider) {
      case "anthropic":
        return withoutParenthetical.replace(/^Claude\s+/i, "");
      case "google":
        return withoutParenthetical.replace(/^Gemini\s+/i, "");
      case "deepseek":
        return withoutParenthetical.replace(/^DeepSeek\s+/i, "");
      case "moonshot":
        return withoutParenthetical.replace(/^Kimi\s+/i, "");
      case "mimo":
        return withoutParenthetical.replace(/^MiMo\s+/i, "");
      default:
        return withoutParenthetical;
    }
  })();
  return providerScoped || withoutParenthetical || name;
}

interface ModelRowProps {
  model: ModelMeta;
  provider: LLMProviderType;
  selected: boolean;
  onSelect: () => void;
}

function ModelRow({ model, provider, selected, onSelect }: ModelRowProps) {
  const label = getCompactModelName(provider, model.name);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-selected={selected}
      title={model.name}
      onClick={onSelect}
      className={cn(
        "group flex h-7 w-full items-center gap-2 rounded-ui-md px-2 text-left",
        "text-ui-caption text-foreground transition-colors duration-fast ease-out-subtle",
        "hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        selected && "bg-accent hover:bg-accent",
      )}
    >
      <span className={cn("min-w-0 flex-1 truncate", selected ? "font-medium" : "font-normal")}>
        {label}
      </span>
      {selected ? (
        <Check size={12} className="shrink-0 text-muted-foreground" />
      ) : null}
    </button>
  );
}

export function ModelEffortPicker() {
  const { t } = useLocaleStore();
  const { config, setConfig } = useAIStore(
    useShallow((s) => ({
      config: s.config,
      setConfig: s.setConfig,
    })),
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
  const providerModels = getProviderModels(provider, config.baseUrl);
  const modelDisplayName =
    modelMeta?.name || effectiveModelId || t.aiSettings.model;
  const compactModelDisplayName =
    modelMeta?.name
      ? getCompactModelName(provider, modelMeta.name)
      : modelDisplayName;

  const handleSelectModel = (modelId: string) => {
    if (modelId !== effectiveModelId) {
      void setConfig({ model: modelId });
    }
    setOpen(false);
  };

  const openModelPicker = () => {
    setOpen((prev) => !prev);
  };

  const modelPopoverWidth = Math.max(
    modelTriggerRef.current?.getBoundingClientRect().width ?? 0,
    104,
  ) + 16;

  return (
    <div className="flex items-end gap-1 self-end">
      <ChipButton
        triggerRef={modelTriggerRef}
        label={compactModelDisplayName}
        open={open}
        onClick={openModelPicker}
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
          width={modelPopoverWidth}
          className="rounded-ui-md"
          data-chip-popover="model"
        >
          <PopoverList className="max-h-[11.5rem] p-1">
            {providerModels.length === 0 ? (
              <Row
                density="compact"
                title={
                  <span className="text-ui-caption">
                    {t.aiSettings.modelPicker.configureInSettings}
                  </span>
                }
                disabled
              />
            ) : (
              providerModels.map((m) => (
                <ModelRow
                  key={m.id}
                  model={m}
                  provider={provider}
                  selected={m.id === effectiveModelId}
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
