import { useEffect, useState, type ReactNode } from "react";
import { Puzzle, Sparkles } from "lucide-react";

import { SkillManagerContent } from "@/components/ai/SkillManagerModal";
import { PluginSection } from "@/components/settings/PluginSection";
import {
  Dialog,
  DialogBody,
  DialogHeader,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { usePluginUiStore } from "@/stores/usePluginUiStore";

export type ExtensionsCenterTab = "plugins" | "skills";

interface ExtensionsCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: ExtensionsCenterTab;
}

interface ExtensionsCenterViewProps {
  initialTab?: ExtensionsCenterTab;
}

export function ExtensionsCenterModal({
  isOpen,
  onClose,
  initialTab = "plugins",
}: ExtensionsCenterModalProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => !next && onClose()}
      width={920}
      className="min-h-[min(760px,calc(100vh-4rem))]"
    >
      <ExtensionsCenterView initialTab={initialTab} />
    </Dialog>
  );
}

export function ExtensionsCenterView({
  initialTab = "plugins",
}: ExtensionsCenterViewProps) {
  const { t } = useLocaleStore();
  const [activeTab, setActiveTab] = useState<ExtensionsCenterTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <DialogHeader
        title={
          <span className="flex items-center gap-2">
            <Puzzle size={16} className="text-muted-foreground" />
            {t.plugins.modalTitle}
          </span>
        }
        description={
          (t.plugins as typeof t.plugins & { centerDescription?: string })
            .centerDescription ??
          "Manage Lumina plugins and agent skills from one place."
        }
        className="pb-3"
      />
      <div className="shrink-0 border-b border-border/60 px-6 pt-3">
        <div className="flex items-center gap-1">
          <TabButton
            active={activeTab === "plugins"}
            icon={<Puzzle size={14} />}
            label={t.ribbon.plugins}
            onClick={() => setActiveTab("plugins")}
          />
          <TabButton
            active={activeTab === "skills"}
            icon={<Sparkles size={14} />}
            label={
              (t.ribbon as typeof t.ribbon & { skills?: string }).skills ??
              "Skills"
            }
            onClick={() => setActiveTab("skills")}
          />
        </div>
      </div>
      {activeTab === "plugins" ? (
        <PluginsTab />
      ) : (
        <SkillManagerContent active={activeTab === "skills"} />
      )}
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-t-ui-md px-3 text-sm transition-colors duration-fast ease-out-subtle",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        active
          ? "bg-background text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}

function PluginsTab() {
  const { t } = useLocaleStore();
  const pluginSettingSections = usePluginUiStore(
    (state) => state.settingSections,
  );

  return (
    <DialogBody className="px-0 py-0">
      <PluginSection />

      {pluginSettingSections.length > 0 && (
        <section className="space-y-3 px-10 pb-7">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t.plugins.pluginSettingsTitle}
          </h3>
          {pluginSettingSections.map((section) => (
            <div
              key={`${section.pluginId}:${section.sectionId}`}
              className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-3"
              data-lumina-plugin-scope={`${section.pluginId}:${section.sectionId}`}
            >
              <div className="text-xs font-medium text-foreground">
                {section.title}{" "}
                <span className="text-muted-foreground">
                  ({section.pluginId})
                </span>
              </div>
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: section.html }}
              />
            </div>
          ))}
        </section>
      )}
    </DialogBody>
  );
}
