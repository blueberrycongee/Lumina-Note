import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentVault {
  path: string;
  name: string;
  openedAt: number;
}

interface RecentVaultState {
  vaults: RecentVault[];
  addVault: (path: string) => void;
  removeVault: (path: string) => void;
  clearVaults: () => void;
}

const MAX_RECENT_VAULTS = 8;

function getVaultName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

export const useRecentVaultStore = create<RecentVaultState>()(
  persist(
    (set, get) => ({
      vaults: [],
      addVault: (path: string) => {
        const name = getVaultName(path);
        const vaults = get().vaults.filter((v) => v.path !== path);
        vaults.unshift({ path, name, openedAt: Date.now() });
        set({ vaults: vaults.slice(0, MAX_RECENT_VAULTS) });
      },
      removeVault: (path: string) => {
        set({ vaults: get().vaults.filter((v) => v.path !== path) });
      },
      clearVaults: () => set({ vaults: [] }),
    }),
    {
      name: "lumina-recent-vaults",
      partialize: (state) => ({ vaults: state.vaults }),
      skipHydration: true,
    },
  ),
);
