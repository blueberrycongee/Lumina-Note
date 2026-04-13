import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyThemeMock = vi.hoisted(() => vi.fn());
const getThemeByIdMock = vi.hoisted(() => vi.fn((id: string) => ({ id, name: id })));
const reapplyMock = vi.hoisted(() => vi.fn());

vi.mock('@/config/themePlugin', () => ({
  applyTheme: applyThemeMock,
  getThemeById: getThemeByIdMock,
}));

vi.mock('@/services/plugins/themeRuntime', () => ({
  pluginThemeRuntime: {
    reapply: reapplyMock,
  },
}));

async function loadStore() {
  vi.resetModules();
  return import('./useUIStore');
}

function parsePersistedState(key: string) {
  const raw = localStorage.getItem(key);
  expect(raw).not.toBeNull();
  return JSON.parse(raw as string).state as Record<string, unknown>;
}

describe('useUIStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    vi.clearAllMocks();
    getThemeByIdMock.mockImplementation((id: string) => ({ id, name: id }));
  });

  it('toggles theme and applies the active theme to the document', async () => {
    const { useUIStore } = await loadStore();

    useUIStore.getState().toggleTheme();

    expect(useUIStore.getState().isDarkMode).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(getThemeByIdMock).toHaveBeenCalledWith('default');
    expect(applyThemeMock).toHaveBeenCalledWith({ id: 'default', name: 'default' }, true);
    expect(reapplyMock).toHaveBeenCalled();
  });

  it('applies the selected theme immediately', async () => {
    const { useUIStore } = await loadStore();
    useUIStore.setState({ isDarkMode: true, themeId: 'default' });

    useUIStore.getState().setThemeId('ocean');

    expect(useUIStore.getState().themeId).toBe('ocean');
    expect(getThemeByIdMock).toHaveBeenCalledWith('ocean');
    expect(applyThemeMock).toHaveBeenCalledWith({ id: 'ocean', name: 'ocean' }, true);
    expect(reapplyMock).toHaveBeenCalled();
  });

  it('persists durable state under the lumina-ui key', async () => {
    const { useUIStore } = await loadStore();

    useUIStore.getState().setThemeId('ocean');
    useUIStore.getState().setChatMode('codex');

    expect(localStorage.getItem('neurone-ui')).toBeNull();
    const persisted = parsePersistedState('lumina-ui');
    expect(persisted.themeId).toBe('ocean');
    expect(persisted.chatMode).toBe('codex');
  });

  it('does not persist temporary modal and floating panel state', async () => {
    const { useUIStore } = await loadStore();

    useUIStore.getState().setSettingsOpen(true);
    useUIStore.getState().setFloatingPanelOpen(true);
    useUIStore.getState().setFloatingBallDragging(true);
    useUIStore.getState().setFloatingBallPosition({ x: 120, y: 340 });
    useUIStore.getState().openVideoNote('https://example.com/video');

    const persisted = parsePersistedState('lumina-ui');
    expect(persisted.isSettingsOpen).toBeUndefined();
    expect(persisted.floatingPanelOpen).toBeUndefined();
    expect(persisted.isFloatingBallDragging).toBeUndefined();
    expect(persisted.floatingBallPosition).toBeUndefined();
    expect(persisted.videoNoteOpen).toBeUndefined();
    expect(persisted.videoNoteUrl).toBeUndefined();
  });

  it('migrates legacy neurone-ui storage into lumina-ui', async () => {
    localStorage.setItem(
      'neurone-ui',
      JSON.stringify({
        state: {
          isDarkMode: true,
          themeId: 'legacy-theme',
          chatMode: 'codex',
          isSettingsOpen: true,
          floatingPanelOpen: true,
        },
        version: 0,
      }),
    );

    const { useUIStore } = await loadStore();

    expect(useUIStore.getState().themeId).toBe('legacy-theme');
    expect(useUIStore.getState().chatMode).toBe('codex');
    expect(useUIStore.getState().isSettingsOpen).toBe(false);
    expect(useUIStore.getState().floatingPanelOpen).toBe(false);
    expect(localStorage.getItem('neurone-ui')).toBeNull();
    const persisted = parsePersistedState('lumina-ui');
    expect(persisted.themeId).toBe('legacy-theme');
    expect(persisted.isSettingsOpen).toBeUndefined();
  });
});
