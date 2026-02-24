import { usePluginUiStore } from "@/stores/usePluginUiStore";

interface PluginShellSlotHostProps {
  slotId: string;
  className?: string;
}

export function PluginShellSlotHost({ slotId, className = "" }: PluginShellSlotHostProps) {
  const slots = usePluginUiStore((state) => state.shellSlots);
  const matched = slots
    .filter((slot) => slot.slotId === slotId)
    .sort((a, b) => a.order - b.order);

  if (matched.length === 0) return null;

  return (
    <div className={className}>
      {matched.map((slot) => (
        <div
          key={`${slot.pluginId}:${slot.slotId}`}
          data-lumina-plugin-scope={`${slot.pluginId}:${slot.slotId}`}
          className="border-b border-border/40 bg-background/60 px-2 py-1 text-xs"
          dangerouslySetInnerHTML={{ __html: slot.html }}
        />
      ))}
    </div>
  );
}
