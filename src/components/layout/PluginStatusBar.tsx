import { usePluginUiStore } from "@/stores/usePluginUiStore";

export function PluginStatusBar() {
  const items = usePluginUiStore((state) => state.statusBarItems);

  const left = items
    .filter((item) => item.align === "left")
    .sort((a, b) => a.order - b.order);
  const right = items
    .filter((item) => item.align === "right")
    .sort((a, b) => a.order - b.order);

  if (left.length === 0 && right.length === 0) return null;

  return (
    <footer className="h-7 border-t border-border/60 bg-background/75 backdrop-blur px-2 flex items-center justify-between text-[11px] text-muted-foreground">
      <div className="flex items-center gap-2 min-w-0">
        {left.map((item) => (
          <button
            key={`${item.pluginId}:${item.itemId}`}
            className="px-2 py-0.5 rounded hover:bg-muted/70 transition-colors"
            onClick={() => item.run?.()}
            title={`${item.pluginId}:${item.itemId}`}
          >
            {item.text}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        {right.map((item) => (
          <button
            key={`${item.pluginId}:${item.itemId}`}
            className="px-2 py-0.5 rounded hover:bg-muted/70 transition-colors"
            onClick={() => item.run?.()}
            title={`${item.pluginId}:${item.itemId}`}
          >
            {item.text}
          </button>
        ))}
      </div>
    </footer>
  );
}
