import { beforeEach, describe, expect, it, vi } from "vitest";

const applyThemeMock = vi.hoisted(() => vi.fn());
const getThemeByIdMock = vi.hoisted(() =>
  vi.fn((id: string) => ({ id, name: id })),
);
const reapplyMock = vi.hoisted(() => vi.fn());

vi.mock("@/config/themePlugin", () => ({
  applyTheme: applyThemeMock,
  getThemeById: getThemeByIdMock,
}));

vi.mock("@/services/plugins/themeRuntime", () => ({
  pluginThemeRuntime: {
    reapply: reapplyMock,
  },
}));

async function loadStore() {
  vi.resetModules();
  return import("./useUIStore");
}

function parsePersistedState(key: string) {
  const raw = localStorage.getItem(key);
  expect(raw).not.toBeNull();
  return JSON.parse(raw as string).state as Record<string, unknown>;
}

describe("useUIStore", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.clearAllMocks();
    getThemeByIdMock.mockImplementation((id: string) => ({ id, name: id }));
  });

  it("toggles theme and applies the active theme to the document", async () => {
    const { useUIStore } = await loadStore();

    useUIStore.getState().toggleTheme();

    expect(useUIStore.getState().isDarkMode).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(getThemeByIdMock).toHaveBeenCalledWith("default");
    expect(applyThemeMock).toHaveBeenCalledWith(
      { id: "default", name: "default" },
      true,
    );
    expect(reapplyMock).toHaveBeenCalled();
  });

  it("sets a specific dark mode value without double toggling", async () => {
    const { useUIStore } = await loadStore();
    vi.clearAllMocks();

    useUIStore.getState().setDarkMode(true);
    useUIStore.getState().setDarkMode(true);

    expect(useUIStore.getState().isDarkMode).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(applyThemeMock).toHaveBeenCalledTimes(1);
    expect(applyThemeMock).toHaveBeenCalledWith(
      { id: "default", name: "default" },
      true,
    );
    expect(reapplyMock).toHaveBeenCalledTimes(1);
  });

  it("applies the selected theme immediately", async () => {
    const { useUIStore } = await loadStore();
    useUIStore.setState({ isDarkMode: true, themeId: "default" });

    useUIStore.getState().setThemeId("ocean");

    expect(useUIStore.getState().themeId).toBe("ocean");
    expect(getThemeByIdMock).toHaveBeenCalledWith("ocean");
    expect(applyThemeMock).toHaveBeenCalledWith(
      { id: "ocean", name: "ocean" },
      true,
    );
    expect(reapplyMock).toHaveBeenCalled();
  });

  it("persists durable state under the lumina-ui key", async () => {
    const { useUIStore } = await loadStore();

    useUIStore.getState().setThemeId("ocean");
    useUIStore.getState().setAppBackground({
      kind: "preset",
      preset: "sakura",
      opacity: 0.34,
      blur: 8,
      dim: 0.65,
    });

    expect(localStorage.getItem("neurone-ui")).toBeNull();
    const persisted = parsePersistedState("lumina-ui");
    expect(persisted.themeId).toBe("ocean");
    expect(persisted.appBackground).toEqual({
      kind: "preset",
      preset: "sakura",
      imagePath: null,
      opacity: 0.34,
      blur: 8,
      dim: 0.65,
    });
  });

  it("clamps background skin controls to readable ranges", async () => {
    const { useUIStore } = await loadStore();

    useUIStore.getState().setAppBackground({
      kind: "image",
      imagePath: "/vault/bg.png",
      opacity: 1,
      blur: 99,
      dim: 0,
    });

    expect(useUIStore.getState().appBackground).toEqual({
      kind: "image",
      preset: "paper",
      imagePath: "/vault/bg.png",
      opacity: 0.6,
      blur: 24,
      dim: 0.2,
    });
  });

  it("does not persist temporary modal and floating panel state", async () => {
    const { useUIStore } = await loadStore();

    useUIStore.getState().setSettingsOpen(true);
    useUIStore.getState().setFloatingPanelOpen(true);
    useUIStore.getState().setFloatingBallDragging(true);
    useUIStore.getState().setFloatingBallPosition({ x: 120, y: 340 });

    const persisted = parsePersistedState("lumina-ui");
    expect(persisted.isSettingsOpen).toBeUndefined();
    expect(persisted.floatingPanelOpen).toBeUndefined();
    expect(persisted.isFloatingBallDragging).toBeUndefined();
    expect(persisted.floatingBallPosition).toBeUndefined();
  });

  it("migrates legacy neurone-ui storage into lumina-ui", async () => {
    localStorage.setItem(
      "neurone-ui",
      JSON.stringify({
        state: {
          isDarkMode: true,
          themeId: "legacy-theme",
          isSettingsOpen: true,
          floatingPanelOpen: true,
        },
        version: 0,
      }),
    );

    const { useUIStore } = await loadStore();

    expect(useUIStore.getState().themeId).toBe("legacy-theme");
    expect(useUIStore.getState().appBackground.kind).toBe("none");
    expect(useUIStore.getState().isSettingsOpen).toBe(false);
    expect(useUIStore.getState().floatingPanelOpen).toBe(false);
    expect(localStorage.getItem("neurone-ui")).toBeNull();
    const persisted = parsePersistedState("lumina-ui");
    expect(persisted.themeId).toBe("legacy-theme");
    expect(persisted.isSettingsOpen).toBeUndefined();
  });

  it("upgrades the old barely visible background defaults on rehydrate", async () => {
    localStorage.setItem(
      "lumina-ui",
      JSON.stringify({
        state: {
          appBackground: {
            kind: "preset",
            preset: "sakura",
            imagePath: null,
            opacity: 0.26,
            blur: 0,
            dim: 0.72,
          },
        },
        version: 0,
      }),
    );

    const { useUIStore } = await loadStore();

    expect(useUIStore.getState().appBackground).toEqual({
      kind: "preset",
      preset: "sakura",
      imagePath: null,
      opacity: 0.46,
      blur: 0,
      dim: 0.52,
    });
  });

  it("defaults blockEditorEnabled to false and persists changes", async () => {
    const { useUIStore } = await loadStore();

    expect(useUIStore.getState().blockEditorEnabled).toBe(false);

    useUIStore.getState().setBlockEditorEnabled(true);

    expect(useUIStore.getState().blockEditorEnabled).toBe(true);
    const persisted = parsePersistedState("lumina-ui");
    expect(persisted.blockEditorEnabled).toBe(true);
  });
});
