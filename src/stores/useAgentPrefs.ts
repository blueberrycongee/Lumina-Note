// Persisted agent preferences — autoApprove + autoCompactEnabled.
//
// These used to live on useRustAgentStore. Splitting them out keeps the
// agent runtime store (useOpencodeAgent) free of UI-only toggles and
// means settings panels don't have to import the agent runtime just to
// read a boolean.
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
        // Matches the old zustand persist key inside useRustAgentStore so
        // existing users keep their toggle state across the upgrade.
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
