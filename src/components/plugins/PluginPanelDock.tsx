import { usePluginUiStore } from "@/stores/usePluginUiStore";

export function PluginPanelDock() {
  const panels = usePluginUiStore((state) => state.panels);
  if (panels.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[120] flex w-[360px] max-w-[90vw] flex-col gap-2">
      {panels.map((panel) => (
        <section
          key={`${panel.pluginId}:${panel.panelId}`}
          className="rounded-lg border border-border bg-background/95 shadow-lg backdrop-blur"
          data-lumina-plugin-scope={`${panel.pluginId}:${panel.panelId}`}
        >
          <header className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
            {panel.title}
          </header>
          <div className="max-h-[260px] overflow-auto p-3">
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: panel.html }}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
