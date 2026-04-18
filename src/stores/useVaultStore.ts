import { create } from "zustand";
import { invoke } from "@/lib/host";

// Types matching Rust vault.rs
export type VaultLayer = "raw" | "wiki" | "schema";
export type RawSourceType = "article" | "paper" | "pdf" | "bookmark" | "transcript" | "note" | "web_clip";
export type WikiPageType = "index" | "concept" | "entity" | "summary" | "collection";

export interface RawSourceMetadata {
  url?: string;
  author?: string;
  date?: string;
  tags: string[];
}

export interface RawSource {
  id: string;
  source_type: RawSourceType;
  title: string;
  file_path: string;
  ingested: boolean;
  ingested_at?: number;
  metadata: RawSourceMetadata;
}

export interface WikiPageEntry {
  path: string;
  title: string;
  page_type: WikiPageType;
  summary: string;
}

export interface WikiIndex {
  pages: WikiPageEntry[];
  last_updated: number;
}

export interface BrokenLink {
  from_page: string;
  link_text: string;
  target: string;
}

export interface LintReport {
  checked_pages: number;
  broken_links: BrokenLink[];
  orphaned_pages: string[];
  stale_pages: string[];
  overall_health: number;
}

interface VaultState {
  // State
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  currentLayer: VaultLayer;
  wikiIndex: WikiIndex | null;
  lintReport: LintReport | null;
  isLinting: boolean;

  // Actions
  initializeVault: (workspacePath: string) => Promise<void>;
  loadWikiIndex: (workspacePath: string) => Promise<void>;
  setCurrentLayer: (layer: VaultLayer) => void;
  runLint: (workspacePath: string) => Promise<void>;
  reset: () => void;
}

export const useVaultStore = create<VaultState>((set) => ({
  // Initial state
  isInitialized: false,
  isLoading: false,
  error: null,
  currentLayer: "wiki",
  wikiIndex: null,
  lintReport: null,
  isLinting: false,

  initializeVault: async (workspacePath: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke("vault_initialize", { workspacePath });
      set({ isInitialized: true, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  loadWikiIndex: async (workspacePath: string) => {
    try {
      const index = await invoke<WikiIndex>("vault_load_index", { workspacePath });
      set({ wikiIndex: index });
    } catch (error) {
      console.warn("Failed to load wiki index:", error);
    }
  },

  setCurrentLayer: (layer: VaultLayer) => {
    set({ currentLayer: layer });
  },

  runLint: async (workspacePath: string) => {
    set({ isLinting: true });
    try {
      const report = await invoke<LintReport>("vault_run_lint", { workspacePath });
      set({ lintReport: report, isLinting: false });
    } catch (error) {
      set({ isLinting: false });
      console.error("Lint failed:", error);
    }
  },

  reset: () => {
    set({
      isInitialized: false,
      isLoading: false,
      error: null,
      currentLayer: "wiki",
      wikiIndex: null,
      lintReport: null,
      isLinting: false,
    });
  },
}));
