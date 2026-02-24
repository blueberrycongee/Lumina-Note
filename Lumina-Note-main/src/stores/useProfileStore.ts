import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProfileConfig, ProfileLink } from "@/types/profile";

const createProfileId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const defaultConfig: ProfileConfig = {
  id: createProfileId(),
  displayName: "",
  bio: "",
  avatarUrl: "",
  links: [],
  pinnedNotePaths: [],
};

interface ProfileState {
  config: ProfileConfig;
  setProfileConfig: (updates: Partial<ProfileConfig>) => void;
  setLinks: (links: ProfileLink[]) => void;
  addLink: (link: ProfileLink) => void;
  removeLink: (index: number) => void;
  setPinnedNotePaths: (paths: string[]) => void;
  pinNote: (path: string) => void;
  unpinNote: (path: string) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      config: defaultConfig,
      setProfileConfig: (updates) =>
        set((state) => ({
          config: {
            ...state.config,
            ...updates,
            id: updates.id ?? state.config.id,
          },
        })),
      setLinks: (links) =>
        set((state) => ({
          config: {
            ...state.config,
            links: [...links],
          },
        })),
      addLink: (link) =>
        set((state) => ({
          config: {
            ...state.config,
            links: [...state.config.links, link],
          },
        })),
      removeLink: (index) =>
        set((state) => ({
          config: {
            ...state.config,
            links: state.config.links.filter((_, i) => i !== index),
          },
        })),
      setPinnedNotePaths: (paths) =>
        set((state) => ({
          config: {
            ...state.config,
            pinnedNotePaths: Array.from(new Set(paths)),
          },
        })),
      pinNote: (path) => {
        if (!path) return;
        const { pinnedNotePaths } = get().config;
        if (pinnedNotePaths.includes(path)) return;
        set((state) => ({
          config: {
            ...state.config,
            pinnedNotePaths: [...state.config.pinnedNotePaths, path],
          },
        }));
      },
      unpinNote: (path) => {
        if (!path) return;
        set((state) => ({
          config: {
            ...state.config,
            pinnedNotePaths: state.config.pinnedNotePaths.filter((p) => p !== path),
          },
        }));
      },
    }),
    {
      name: "lumina-profile",
      partialize: (state) => ({ config: state.config }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.config?.id) {
          state.config = { ...defaultConfig, ...state.config, id: createProfileId() };
        }
      },
    }
  )
);
