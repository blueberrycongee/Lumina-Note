import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CodexPanel } from "@/components/codex/CodexPanel";
import {
  useCodexPanelDockStore,
  type CodexRenderMode,
} from "@/stores/useCodexPanelDock";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore } from "@/stores/useUIStore";

const DEFAULT_RENDER_MODE: CodexRenderMode = "native";

export function CodexPanelHost() {
  const chatMode = useUIStore((s) => s.chatMode);
  const vaultPath = useFileStore((s) => s.vaultPath);
  const activeTab = useFileStore((s) => {
    const index = s.activeTabIndex;
    return index >= 0 ? s.tabs[index] : null;
  });
  const targets = useCodexPanelDockStore((s) => s.targets);
  const fallbackRef = useRef<HTMLDivElement | null>(null);
  const preferredSlot = activeTab?.type === "ai-chat" ? "main" : "side";
  const fallbackSlot = preferredSlot === "main" ? "side" : "main";
  const selected = targets[preferredSlot] ?? targets[fallbackSlot];
  const [renderMode, setRenderMode] = useState<CodexRenderMode>(DEFAULT_RENDER_MODE);

  useEffect(() => {
    if (selected?.renderMode) {
      setRenderMode(selected.renderMode);
    }
  }, [selected?.renderMode]);

  const portalTarget = selected?.element ?? fallbackRef.current;

  return (
    <>
      <div ref={fallbackRef} className="hidden" data-codex-fallback />
      {portalTarget &&
        createPortal(
          <CodexPanel
            visible={chatMode === "codex" && Boolean(selected?.element)}
            workspacePath={vaultPath}
            renderMode={renderMode}
          />,
          portalTarget
        )}
    </>
  );
}
