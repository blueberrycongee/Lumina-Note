import { useEffect, useMemo, useState } from "react";
import { usePluginUiStore } from "@/stores/usePluginUiStore";

interface MenuState {
  x: number;
  y: number;
  targetTag: string;
}

export function PluginContextMenuHost() {
  const items = usePluginUiStore((state) => state.contextMenuItems);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (items.length === 0) return;
      const target = event.target as HTMLElement | null;
      setMenu({
        x: event.clientX,
        y: event.clientY,
        targetTag: (target?.tagName || "").toLowerCase(),
      });
      event.preventDefault();
    };

    const onClose = () => setMenu(null);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("click", onClose);
    window.addEventListener("keydown", onClose);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("click", onClose);
      window.removeEventListener("keydown", onClose);
    };
  }, [items.length]);

  const sorted = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);

  if (!menu || sorted.length === 0) return null;

  return (
    <div
      className="fixed z-[240] min-w-[220px] rounded-lg border border-border bg-background shadow-lg p-1"
      style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 220) }}
    >
      {sorted.map((item) => (
        <button
          key={`${item.pluginId}:${item.itemId}`}
          className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted"
          onClick={() => {
            item.run({ x: menu.x, y: menu.y, targetTag: menu.targetTag });
            setMenu(null);
          }}
        >
          <span className="font-medium">{item.title}</span>
          <span className="ml-2 text-[11px] text-muted-foreground">{item.pluginId}</span>
        </button>
      ))}
    </div>
  );
}
