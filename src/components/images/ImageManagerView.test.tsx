import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ImageManagerView } from "./ImageManagerView";
import { useImageManagerStore } from "@/stores/useImageManagerStore";
import en from "@/i18n/locales/en";

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({ t: en }),
  getCurrentTranslations: () => en,
}));

const openFile = vi.hoisted(() => (() => undefined));
const refreshFileTree = vi.hoisted(() => (async () => undefined));
const reloadFileIfOpen = vi.hoisted(() => (async () => undefined));
const readFile = vi.hoisted(() => vi.fn(async () => "![Hero](../assets/hero.png)"));
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

vi.mock("@/lib/host", () => ({
  readFile,
  readBinaryFileBase64: vi.fn(async () => "AAAA"),
  showInExplorer: async () => undefined,
}));

vi.mock("@/lib/reportError", () => ({
  reportOperationError: () => undefined,
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
    fileStoreState.currentFile = null;
    fileStoreState.currentContent = "";
    fileStoreState.tabs = [];
    readFile.mockReset();
    readFile.mockResolvedValue("![Hero](../assets/hero.png)");
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
      detailPanelOpen: true,
    });
    vi.stubGlobal("Image", MockImage);
  });

  it("renders indexed images, details, and search filtering", async () => {
    render(<ImageManagerView />);

    expect((await screen.findAllByText("hero.png")).length).toBeGreaterThan(0);
    // No image selected by default, detail panel shows empty state
    expect(screen.getByText(en.imageManager.selectImageTitle)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(en.imageManager.searchPlaceholder), {
      target: { value: "missing" },
    });

    await waitFor(() => {
      expect(screen.getByText(en.imageManager.noMatchTitle)).toBeInTheDocument();
    });
  });

  it("keeps the existing image list visible while refreshing", async () => {
    render(<ImageManagerView />);

    expect((await screen.findAllByText("hero.png")).length).toBeGreaterThan(0);

    let resolveRefreshRead: (value: string) => void = () => undefined;
    readFile.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveRefreshRead = resolve;
        }),
    );

    fireEvent.click(screen.getByTitle(en.imageManager.refreshLibrary));

    await waitFor(() => {
      expect(readFile).toHaveBeenCalledTimes(2);
    });

    expect(screen.queryByText(en.imageManager.scanningTitle)).not.toBeInTheDocument();
    expect(screen.getAllByText("hero.png").length).toBeGreaterThan(0);

    resolveRefreshRead("![Hero](../assets/hero.png)");

    await waitFor(() => {
      expect(readFile).toHaveBeenCalledTimes(2);
    });
  });
});
