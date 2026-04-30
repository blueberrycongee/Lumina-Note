// Persisted agent preferences — autoApprove + autoCompactEnabled.
//
// Split out from the agent runtime store so settings panels don't have to
// import the runtime just to read UI-only toggles.
//
// `autoApprove` drives opencode's permission flow — synced to the main
// process via IPC, which injects `permission: "allow"` into the config.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createLegacyKeyJSONStorage } from "@/lib/persistStorage";
import { invoke } from "@/lib/host";

type State = {
  autoApprove: boolean;
  autoCompactEnabled: boolean;
};

type Actions = {
  setAutoApprove: (value: boolean) => void;
  setAutoCompactEnabled: (value: boolean) => void;
};

export type AgentPrefsStore = State & Actions;

export const useAgentPrefs = create<AgentPrefsStore>()(
  persist(
    (set) => ({
      autoApprove: false,
      autoCompactEnabled: true,
      setAutoApprove: (autoApprove) => {
        set({ autoApprove });
        invoke("agent_set_auto_approve", { value: autoApprove }).catch(() => {});
      },
      setAutoCompactEnabled: (autoCompactEnabled) => set({ autoCompactEnabled }),
    }),
    {
      name: "lumina-agent-prefs",
      storage: createLegacyKeyJSONStorage([
        "lumina-agent-prefs",
        // Keep the previous persist key so existing users retain their
        // toggle state across the runtime upgrade.
        "lumina-rust-agent-store",
      ]),
      partialize: (state) => ({
        autoApprove: state.autoApprove,
        autoCompactEnabled: state.autoCompactEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          invoke("agent_set_auto_approve", { value: state.autoApprove }).catch(() => {});
        }
      },
    },
  ),
);
