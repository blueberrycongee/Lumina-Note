import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useBrowserStore } from "@/stores/useBrowserStore";
import { usePluginUiStore } from "@/stores/usePluginUiStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { PluginSection } from "@/components/settings/PluginSection";
import { PluginStyleDevSection } from "@/components/settings/PluginStyleDevSection";

interface InstalledPluginsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InstalledPluginsModal({ isOpen, onClose }: InstalledPluginsModalProps) {
  const { t } = useLocaleStore();
  const { hideAllWebViews, showAllWebViews } = useBrowserStore();
  const pluginSettingSections = usePluginUiStore((state) => state.settingSections);

  useEffect(() => {
    if (!isOpen) return;
    hideAllWebViews();
    return () => {
      showAllWebViews();
    };
  }, [hideAllWebViews, isOpen, showAllWebViews]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-[860px] max-h-[85vh] rounded-xl shadow-2xl overflow-hidden border border-border bg-background/95">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/50">
          <h2 className="text-lg font-semibold text-foreground/90">{t.plugins.modalTitle}</h2>
          <button onClick={onClose} className="p-2 rounded-full transition-colors hover:bg-muted">
            <X size={18} className="text-foreground/70" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(85vh-60px)]">
          <PluginSection />
          <PluginStyleDevSection />

          {pluginSettingSections.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {t.plugins.pluginSettingsTitle}
              </h3>
              {pluginSettingSections.map((section) => (
                <div
                  key={`${section.pluginId}:${section.sectionId}`}
                  className="rounded-lg border border-border bg-background/60 p-3 space-y-2"
                  data-lumina-plugin-scope={`${section.pluginId}:${section.sectionId}`}
                >
                  <div className="text-xs font-medium text-foreground">
                    {section.title} <span className="text-muted-foreground">({section.pluginId})</span>
                  </div>
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: section.html }}
                  />
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
