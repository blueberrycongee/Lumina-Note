import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PublishConfigState {
  outputDir: string;
  basePath: string;
  postsBasePath: string;
  assetsBasePath: string;
}

export type CloudStatus = "idle" | "uploading" | "published" | "error";

export interface UploadProgress {
  current: number;
  total: number;
}

interface PublishState {
  // --- Local publish config ---
  config: PublishConfigState;
  setPublishConfig: (updates: Partial<PublishConfigState>) => void;
  resetOutputDir: () => void;

  // --- Cloud publish state ---
  cloudStatus: CloudStatus;
  uploadProgress: UploadProgress | null;
  publishedUrl: string | null;
  lastPublishedAt: number | null;
  cloudError: string | null;

  setCloudStatus: (status: CloudStatus) => void;
  setUploadProgress: (progress: UploadProgress | null) => void;
  setPublishedUrl: (url: string | null) => void;
  setLastPublishedAt: (timestamp: number | null) => void;
  setCloudError: (error: string | null) => void;
  resetCloudState: () => void;
}

const defaultConfig: PublishConfigState = {
  outputDir: "",
  basePath: "",
  postsBasePath: "",
  assetsBasePath: "",
};

export const usePublishStore = create<PublishState>()(
  persist(
    (set) => ({
      // --- Local publish config ---
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

      // --- Cloud publish state ---
      cloudStatus: "idle",
      uploadProgress: null,
      publishedUrl: null,
      lastPublishedAt: null,
      cloudError: null,

      setCloudStatus: (status) => set({ cloudStatus: status }),
      setUploadProgress: (progress) => set({ uploadProgress: progress }),
      setPublishedUrl: (url) => set({ publishedUrl: url }),
      setLastPublishedAt: (timestamp) => set({ lastPublishedAt: timestamp }),
      setCloudError: (error) => set({ cloudError: error }),
      resetCloudState: () =>
        set({
          cloudStatus: "idle",
          uploadProgress: null,
          cloudError: null,
        }),
    }),
    {
      name: "lumina-publish",
      partialize: (state) => ({
        config: state.config,
        publishedUrl: state.publishedUrl,
        lastPublishedAt: state.lastPublishedAt,
      }),
    }
  )
);
