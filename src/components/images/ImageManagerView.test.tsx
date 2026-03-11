import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ImageManagerView } from "./ImageManagerView";
import { useImageManagerStore } from "@/stores/useImageManagerStore";
import en from "@/i18n/locales/en";

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({ t: en }),
  getCurrentTranslations: () => en,
}));

const openFile = vi.hoisted(() => vi.fn());
const refreshFileTree = vi.hoisted(() => vi.fn(async () => {}));
const reloadFileIfOpen = vi.hoisted(() => vi.fn(async () => {}));
const fileStoreState = vi.hoisted(() => ({
  vaultPath: "/vault",
  fileTree: [
    {
      name: "notes",
      path: "/vault/notes",
      is_dir: true,
      children: [
        {
          name: "alpha.md",
          path: "/vault/notes/alpha.md",
          is_dir: false,
          size: 100,
          modified_at: 100,
          created_at: 100,
          children: null,
        },
      ],
    },
    {
      name: "assets",
      path: "/vault/assets",
      is_dir: true,
      children: [
        {
          name: "hero.png",
          path: "/vault/assets/hero.png",
          is_dir: false,
          size: 2048,
          modified_at: Date.now(),
          created_at: Date.now(),
          children: null,
        },
      ],
    },
  ],
  openFile,
  refreshFileTree,
  currentFile: null as string | null,
  currentContent: "",
  tabs: [] as unknown[],
  reloadFileIfOpen,
}));

vi.mock("@/stores/useFileStore", () => ({
  useFileStore: Object.assign(
    (selector: (state: typeof fileStoreState) => unknown) => selector(fileStoreState),
    {
      getState: () => fileStoreState,
    },
  ),
}));

vi.mock("@/lib/tauri", () => ({
  readFile: vi.fn(async () => "![Hero](../assets/hero.png)"),
  readBinaryFileBase64: vi.fn(async () => "AAAA"),
  showInExplorer: vi.fn(async () => {}),
}));

vi.mock("@/lib/reportError", () => ({
  reportOperationError: vi.fn(),
}));

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1280;
  naturalHeight = 720;

  set src(_value: string) {
    queueMicrotask(() => {
      this.onload?.();
    });
  }
}

describe("ImageManagerView", () => {
  beforeEach(() => {
    openFile.mockReset();
    refreshFileTree.mockClear();
    reloadFileIfOpen.mockClear();
    fileStoreState.currentFile = null;
    fileStoreState.currentContent = "";
    fileStoreState.tabs = [];
    localStorage.removeItem("lumina-image-manager");
    useImageManagerStore.setState({
      viewMode: "grid",
      groupMode: "status",
      statusFilter: "all",
      folderFilter: "all",
      searchQuery: "",
      sortBy: "modified",
      sortOrder: "desc",
      selectedPaths: [],
      focusedPath: null,
    });
    vi.stubGlobal("Image", MockImage);
  });

  it("renders indexed images, details, and search filtering", async () => {
    render(<ImageManagerView />);

    expect((await screen.findAllByText("hero.png")).length).toBeGreaterThan(0);
    expect(screen.getByText(en.imageManager.imageDetails)).toBeInTheDocument();
    expect(screen.getByText(en.imageManager.referencedByNotes)).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(en.imageManager.searchPlaceholder), {
      target: { value: "missing" },
    });

    await waitFor(() => {
      expect(screen.getByText(en.imageManager.noMatchTitle)).toBeInTheDocument();
    });
  });
});
