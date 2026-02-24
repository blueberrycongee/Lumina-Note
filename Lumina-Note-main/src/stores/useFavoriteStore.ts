import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FileEntry } from "@/lib/tauri";

export type FavoriteSortMode = "manual" | "recentAdded" | "recentOpened";

export interface FavoriteEntry {
  path: string;
  addedAt: number;
  lastOpenedAt: number | null;
}

interface FavoriteState {
  favorites: Record<string, FavoriteEntry>;
  manualOrder: string[];
  defaultSortMode: FavoriteSortMode;

  addFavorite: (path: string, addedAt?: number) => void;
  removeFavorite: (path: string) => void;
  toggleFavorite: (path: string) => void;
  isFavorite: (path: string) => boolean;
  markOpened: (path: string, openedAt?: number) => void;
  updatePath: (oldPath: string, newPath: string) => void;
  updatePathsForFolderMove: (oldFolder: string, newFolder: string) => void;
  moveFavorite: (fromIndex: number, toIndex: number) => void;
  setManualOrder: (paths: string[]) => void;
  setDefaultSortMode: (mode: FavoriteSortMode) => void;
  getFavorites: (mode?: FavoriteSortMode) => FavoriteEntry[];
  pruneMissing: (fileTree: FileEntry[]) => void;
}

const isMarkdownPath = (path: string) => path.toLowerCase().endsWith(".md");

const flattenMarkdownPaths = (entries: FileEntry[]): Set<string> => {
  const paths = new Set<string>();
  const walk = (nodes: FileEntry[]) => {
    for (const node of nodes) {
      if (node.is_dir && node.children) {
        walk(node.children);
      } else if (!node.is_dir && isMarkdownPath(node.path)) {
        paths.add(node.path);
      }
    }
  };
  walk(entries);
  return paths;
};

const sortByRecentAdded = (entries: FavoriteEntry[]) =>
  [...entries].sort((a, b) => b.addedAt - a.addedAt);

const sortByRecentOpened = (entries: FavoriteEntry[]) =>
  [...entries].sort((a, b) => {
    const aOpened = a.lastOpenedAt ?? 0;
    const bOpened = b.lastOpenedAt ?? 0;
    if (aOpened !== bOpened) return bOpened - aOpened;
    return b.addedAt - a.addedAt;
  });

export const useFavoriteStore = create<FavoriteState>()(
  persist(
    (set, get) => ({
      favorites: {},
      manualOrder: [],
      defaultSortMode: "manual",

      addFavorite: (path, addedAt = Date.now()) => {
        if (!isMarkdownPath(path)) return;
        set((state) => {
          if (state.favorites[path]) return state;
          const entry: FavoriteEntry = {
            path,
            addedAt,
            lastOpenedAt: null,
          };
          return {
            favorites: { ...state.favorites, [path]: entry },
            manualOrder: [...state.manualOrder, path],
          };
        });
      },

      removeFavorite: (path) => {
        set((state) => {
          if (!state.favorites[path]) return state;
          const { [path]: _removed, ...rest } = state.favorites;
          return {
            favorites: rest,
            manualOrder: state.manualOrder.filter((p) => p !== path),
          };
        });
      },

      toggleFavorite: (path) => {
        if (get().favorites[path]) {
          get().removeFavorite(path);
        } else {
          get().addFavorite(path);
        }
      },

      isFavorite: (path) => Boolean(get().favorites[path]),

      markOpened: (path, openedAt = Date.now()) => {
        if (!get().favorites[path]) return;
        set((state) => ({
          favorites: {
            ...state.favorites,
            [path]: {
              ...state.favorites[path],
              lastOpenedAt: openedAt,
            },
          },
        }));
      },

      updatePath: (oldPath, newPath) => {
        if (!get().favorites[oldPath]) return;
        if (!isMarkdownPath(newPath)) {
          get().removeFavorite(oldPath);
          return;
        }
        set((state) => {
          const entry = state.favorites[oldPath];
          const { [oldPath]: _removed, ...rest } = state.favorites;
          return {
            favorites: {
              ...rest,
              [newPath]: { ...entry, path: newPath },
            },
            manualOrder: state.manualOrder.map((p) => (p === oldPath ? newPath : p)),
          };
        });
      },

      updatePathsForFolderMove: (oldFolder, newFolder) => {
        const normalize = (p: string) => p.replace(/\\/g, "/");
        const oldPrefix = normalize(oldFolder);
        const newPrefix = normalize(newFolder);
        set((state) => {
          let changed = false;
          const nextFavorites: Record<string, FavoriteEntry> = {};
          const nextOrder: string[] = [];

          for (const path of state.manualOrder) {
            const normalizedPath = normalize(path);
            if (normalizedPath === oldPrefix || normalizedPath.startsWith(oldPrefix + "/")) {
              const relativePath = normalizedPath.slice(oldPrefix.length);
              const nextPath = newPrefix + relativePath;
              const entry = state.favorites[path];
              if (entry) {
                nextFavorites[nextPath] = { ...entry, path: nextPath };
                nextOrder.push(nextPath);
                changed = true;
              }
            } else if (state.favorites[path]) {
              nextFavorites[path] = state.favorites[path];
              nextOrder.push(path);
            }
          }

          if (!changed) return state;
          return { favorites: nextFavorites, manualOrder: nextOrder };
        });
      },

      moveFavorite: (fromIndex, toIndex) => {
        set((state) => {
          if (fromIndex === toIndex) return state;
          if (fromIndex < 0 || toIndex < 0) return state;
          if (fromIndex >= state.manualOrder.length || toIndex >= state.manualOrder.length) {
            return state;
          }
          const next = [...state.manualOrder];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return { manualOrder: next };
        });
      },

      setManualOrder: (paths) => {
        set((state) => ({
          manualOrder: paths.filter((p) => Boolean(state.favorites[p])),
        }));
      },

      setDefaultSortMode: (mode) => set({ defaultSortMode: mode }),

      getFavorites: (mode) => {
        const { favorites, manualOrder, defaultSortMode } = get();
        const entries = Object.values(favorites);
        const sortMode = mode ?? defaultSortMode;
        if (sortMode === "recentAdded") return sortByRecentAdded(entries);
        if (sortMode === "recentOpened") return sortByRecentOpened(entries);
        const orderIndex = new Map(manualOrder.map((p, i) => [p, i]));
        return [...entries].sort((a, b) => {
          const aIndex = orderIndex.get(a.path);
          const bIndex = orderIndex.get(b.path);
          if (aIndex === undefined && bIndex === undefined) return 0;
          if (aIndex === undefined) return 1;
          if (bIndex === undefined) return -1;
          return aIndex - bIndex;
        });
      },

      pruneMissing: (fileTree) => {
        const validPaths = flattenMarkdownPaths(fileTree);
        set((state) => {
          const nextFavorites: Record<string, FavoriteEntry> = {};
          const nextOrder: string[] = [];
          for (const path of state.manualOrder) {
            if (validPaths.has(path) && state.favorites[path]) {
              nextFavorites[path] = state.favorites[path];
              nextOrder.push(path);
            }
          }
          for (const entry of Object.values(state.favorites)) {
            if (validPaths.has(entry.path) && !nextFavorites[entry.path]) {
              nextFavorites[entry.path] = entry;
              nextOrder.push(entry.path);
            }
          }
          return {
            favorites: nextFavorites,
            manualOrder: nextOrder,
          };
        });
      },
    }),
    {
      name: "lumina-favorites",
      partialize: (state) => ({
        favorites: state.favorites,
        manualOrder: state.manualOrder,
        defaultSortMode: state.defaultSortMode,
      }),
    }
  )
);
