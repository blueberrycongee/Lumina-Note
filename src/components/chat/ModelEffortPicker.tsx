import { useRef, useState, type MutableRefObject } from "react";
import { Check, ChevronUp, Settings } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useAIStore } from "@/stores/useAIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import {
  Popover,
  PopoverContent,
  PopoverEmpty,
  PopoverList,
  Row,
} from "@/components/ui";
import {
  PROVIDER_MODELS,
  findModelInCatalog,
  type LLMProviderType,
} from "@/services/llm";
import type { AgentModelMeta, AgentProviderMeta } from "@/services/llm";
import type { ProviderRuntimeSettings } from "@/stores/useAIStore";

const MODEL_POPOVER_WIDTH = 320;

type ModelOption = Pick<AgentModelMeta, "id" | "name">;

type ProviderModelSection = {
  provider: LLMProviderType;
  label: string;
  baseUrl: string | undefined;
  configuredModelId: string | undefined;
  models: ModelOption[];
};

interface ModelEffortPickerProps {
  onOpenSettings?: () => void;
}

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
      <span className="block max-w-[180px] truncate font-medium sm:max-w-[220px]">
        {label}
      </span>
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

function appendMissingModel(
  models: ModelOption[],
  providerId: string,
  modelId: string,
) {
  const normalized = modelId.trim();
  if (!normalized) return models;
  if (models.some((model) => model.id === normalized)) return models;
  const known = findModelInCatalog(providerId, normalized);
  return [{ id: normalized, name: known?.name ?? normalized }, ...models];
}

function buildProviderModels(
  meta: AgentProviderMeta,
  configuredModelId: string | undefined,
) {
  if (meta.id === "openai-compatible") {
    return configuredModelId?.trim()
      ? [{ id: configuredModelId.trim(), name: configuredModelId.trim() }]
      : [];
  }
  return appendMissingModel(
    meta.models.map((model) => ({ id: model.id, name: model.name })),
    meta.id,
    configuredModelId ?? "",
  );
}

function uniqueProviders(providers: LLMProviderType[]): LLMProviderType[] {
  return Array.from(new Set(providers));
}

function isProviderReady(
  provider: LLMProviderType,
  currentProvider: LLMProviderType,
  config: {
    apiKey?: string;
    apiKeyConfigured?: boolean;
  },
  persisted?: ProviderRuntimeSettings,
) {
  if (provider === "ollama") return true;
  if (provider === currentProvider) {
    return !!config.apiKey?.trim() || !!config.apiKeyConfigured;
  }
  return !!persisted?.apiKeyConfigured;
}

export function ModelEffortPicker({ onOpenSettings }: ModelEffortPickerProps) {
  const { t } = useLocaleStore();
  const {
    config,
    providerSettings,
    runtimeModelSelection,
    loadProviderSettings,
    setRuntimeModelSelection,
  } = useAIStore(
    useShallow((s) => ({
      config: s.config,
      providerSettings: s.providerSettings,
      runtimeModelSelection: s.runtimeModelSelection,
      loadProviderSettings: s.loadProviderSettings,
      setRuntimeModelSelection: s.setRuntimeModelSelection,
    })),
  );
  const [open, setOpen] = useState(false);
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);

  const configuredProvider = config.provider as LLMProviderType;
  const provider = runtimeModelSelection?.provider ?? configuredProvider;
  const effectiveModelId =
    runtimeModelSelection
      ? runtimeModelSelection.model === "custom"
        ? (runtimeModelSelection.customModelId?.trim() ?? "")
        : runtimeModelSelection.model
      : config.model === "custom"
        ? (config.customModelId?.trim() ?? "")
        : config.model;
  const modelMeta = effectiveModelId
    ? findModelInCatalog(provider, effectiveModelId)
    : undefined;
  const configuredModelId =
    config.model === "custom"
      ? (config.customModelId?.trim() ?? "")
      : config.model;
  const modelDisplayName =
    modelMeta?.name || effectiveModelId || t.aiSettings.model;
  const activeProviderMeta = PROVIDER_MODELS[provider];
  const activeProviderLabel = activeProviderMeta?.label ?? provider;
  const displayNameIncludesProvider = modelDisplayName
    .toLocaleLowerCase()
    .startsWith(activeProviderLabel.toLocaleLowerCase());
  const chipLabel =
    runtimeModelSelection && provider !== configuredProvider
      ? displayNameIncludesProvider
        ? modelDisplayName
        : `${activeProviderLabel} · ${modelDisplayName}`
      : modelDisplayName;
  const providerSections: ProviderModelSection[] = uniqueProviders([
    configuredProvider,
    ...Object.keys(providerSettings.perProvider).map((id) => id as LLMProviderType),
  ])
    .map((providerId) => {
      const meta = PROVIDER_MODELS[providerId];
      if (!meta) return null;
      const persisted = providerSettings.perProvider[providerId];
      if (!isProviderReady(providerId, configuredProvider, config, persisted)) {
        return null;
      }
      const modelId =
        providerId === configuredProvider
          ? configuredModelId
          : persisted?.modelId?.trim();
      const models = buildProviderModels(meta, modelId);
      if (models.length === 0) return null;
      return {
        provider: providerId,
        label: meta.label,
        baseUrl:
          providerId === configuredProvider
            ? config.baseUrl
            : persisted?.baseUrl,
        configuredModelId: modelId,
        models,
      };
    })
    .filter((section): section is ProviderModelSection => section !== null);

  const handleSelectModel = (section: ProviderModelSection, modelId: string) => {
    if (section.provider === configuredProvider && modelId === configuredModelId) {
      setRuntimeModelSelection(null);
    } else if (section.provider === "openai-compatible") {
      setRuntimeModelSelection({
        provider: section.provider,
        model: "custom",
        customModelId: modelId,
        baseUrl: section.baseUrl,
      });
    } else {
      setRuntimeModelSelection({
        provider: section.provider,
        model: modelId,
        baseUrl: section.baseUrl,
      });
    }
    setOpen(false);
  };

  const handleOpenSettings = () => {
    setOpen(false);
    onOpenSettings?.();
  };

  return (
    <div className="flex items-end gap-1 self-end">
      <ChipButton
        triggerRef={modelTriggerRef}
        label={chipLabel}
        open={open}
        onClick={() => {
          if (!open) void loadProviderSettings();
          setOpen((prev) => !prev);
        }}
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
          <div className="border-b border-border/70 px-3 py-2">
            <div className="text-xs font-semibold text-foreground">
              {activeProviderLabel}
            </div>
          </div>
          <PopoverList className="max-h-72">
            {providerSections.length === 0 ? (
              <PopoverEmpty>
                {t.aiSettings.modelPicker.noConfiguredModels}
              </PopoverEmpty>
            ) : (
              providerSections.map((section) => (
                <div key={section.provider}>
                  {providerSections.length > 1 && (
                    <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold text-muted-foreground">
                      {section.label}
                    </div>
                  )}
                  {section.models.map((m) => {
                    const selected =
                      section.provider === provider && m.id === effectiveModelId;
                    return (
                      <Row
                        key={`${section.provider}:${m.id}`}
                        density="compact"
                        title={m.name}
                        selected={selected}
                        trailing={selected ? <Check size={14} /> : null}
                        onSelect={() => handleSelectModel(section, m.id)}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </PopoverList>
          <div className="border-t border-border/70 p-1.5">
            {onOpenSettings ? (
              <Row
                density="compact"
                icon={<Settings size={14} />}
                title={t.aiSettings.modelPicker.manageModels}
                description={t.aiSettings.modelPicker.manageModelsHint}
                onSelect={handleOpenSettings}
              />
            ) : (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {t.aiSettings.modelPicker.manageModelsHint}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
