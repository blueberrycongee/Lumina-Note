import { useEffect, useRef } from "react";
import {
  useCodexPanelDockStore,
  type CodexPanelSlot,
  type CodexRenderMode,
} from "@/stores/useCodexPanelDock";

type Props = {
  slot: CodexPanelSlot;
  renderMode: CodexRenderMode;
  className?: string;
};

export function CodexPanelSlot({ slot, renderMode, className }: Props) {
  const setTarget = useCodexPanelDockStore((s) => s.setTarget);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    setTarget(slot, ref.current, renderMode);
    return () => {
      setTarget(slot, null);
    };
  }, [slot, renderMode, setTarget]);

  return <div ref={ref} className={className} data-codex-slot={slot} />;
}
