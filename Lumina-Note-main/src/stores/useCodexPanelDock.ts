import { create } from "zustand";

export type CodexPanelSlot = "main" | "side";
export type CodexRenderMode = "native" | "iframe";

type CodexTarget = {
  element: HTMLElement;
  renderMode: CodexRenderMode;
};

interface CodexPanelDockState {
  targets: Partial<Record<CodexPanelSlot, CodexTarget>>;
  setTarget: (
    slot: CodexPanelSlot,
    element: HTMLElement | null,
    renderMode?: CodexRenderMode
  ) => void;
}

export const useCodexPanelDockStore = create<CodexPanelDockState>((set) => ({
  targets: {},
  setTarget: (slot, element, renderMode = "native") =>
    set((state) => {
      const nextTargets = { ...state.targets };
      if (element) {
        nextTargets[slot] = { element, renderMode };
      } else {
        delete nextTargets[slot];
      }
      return { targets: nextTargets };
    }),
}));
