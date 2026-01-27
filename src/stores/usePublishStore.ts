import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PublishConfigState {
  outputDir: string;
  postsBasePath: string;
  assetsBasePath: string;
}

interface PublishState {
  config: PublishConfigState;
  setPublishConfig: (updates: Partial<PublishConfigState>) => void;
  resetOutputDir: () => void;
}

const defaultConfig: PublishConfigState = {
  outputDir: "",
  postsBasePath: "",
  assetsBasePath: "",
};

export const usePublishStore = create<PublishState>()(
  persist(
    (set) => ({
      config: defaultConfig,
      setPublishConfig: (updates) =>
        set((state) => ({
          config: {
            ...state.config,
            ...updates,
          },
        })),
      resetOutputDir: () =>
        set((state) => ({
          config: {
            ...state.config,
            outputDir: "",
          },
        })),
    }),
    {
      name: "lumina-publish",
      partialize: (state) => ({ config: state.config }),
    }
  )
);
