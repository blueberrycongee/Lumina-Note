import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@/stores/useLocaleStore', () => ({
  getCurrentTranslations: () => ({
    themeEditor: {
      defaultThemeName: 'New Theme',
      defaultThemeDescription: 'Theme description',
    },
  }),
}));

import {
  createThemeTemplate,
  exportTheme,
  getAllThemes,
  getThemeById,
  getUserThemes,
  importTheme,
  loadUserThemes,
} from './themePlugin';
import { OFFICIAL_THEMES } from './themes';

describe('themePlugin', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    invokeMock.mockResolvedValue(false);
    await loadUserThemes('/missing');
  });

  it('loads valid user themes, prefixes ids, and exposes them through lookups', async () => {
    const baseTheme = OFFICIAL_THEMES[0];
    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'path_exists') return true;
      if (command === 'list_files') return ['ocean.json'];
      if (command === 'read_text_file' && args?.path === '/vault/.lumina/themes/ocean.json') {
        return JSON.stringify({ ...baseTheme, id: 'ocean', name: 'Ocean' });
      }
      throw new Error(`unexpected invoke: ${command}`);
    });

    const loaded = await loadUserThemes('/vault');

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe('user-ocean');
    expect(getUserThemes().map((theme) => theme.id)).toEqual(['user-ocean']);
    expect(getThemeById('user-ocean')?.name).toBe('Ocean');
    expect(getAllThemes().map((theme) => theme.id)).toEqual(
      expect.arrayContaining([...OFFICIAL_THEMES.map((theme) => theme.id), 'user-ocean']),
    );
  });

  it('ignores malformed and structurally invalid user theme files', async () => {
    const baseTheme = OFFICIAL_THEMES[0];
    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'path_exists') return true;
      if (command === 'list_files') return ['broken.json', 'invalid.json', 'valid.json'];
      if (command === 'read_text_file' && args?.path === '/vault/.lumina/themes/broken.json') {
        return 'not json';
      }
      if (command === 'read_text_file' && args?.path === '/vault/.lumina/themes/invalid.json') {
        return JSON.stringify({ id: 'bad', name: 'Bad' });
      }
      if (command === 'read_text_file' && args?.path === '/vault/.lumina/themes/valid.json') {
        return JSON.stringify({ ...baseTheme, id: 'valid', name: 'Valid' });
      }
      throw new Error(`unexpected invoke: ${command}`);
    });

    const loaded = await loadUserThemes('/vault');

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe('user-valid');
  });

  it('exports and imports themes without leaking export metadata', () => {
    const theme = { ...OFFICIAL_THEMES[0], id: 'user-custom' };

    const exported = exportTheme(theme);
    const parsed = JSON.parse(exported);
    expect(parsed.id).toBe('custom');
    expect(parsed._exportedFrom).toBe('Lumina Note');
    expect(parsed._exportedAt).toBeTruthy();

    const imported = importTheme(exported);
    expect(imported?.id).toBe('custom');
    expect((imported as unknown as Record<string, unknown>)._exportedFrom).toBeUndefined();
    expect((imported as unknown as Record<string, unknown>)._exportedAt).toBeUndefined();
  });

  it('creates a localized independent theme template from a base theme', () => {
    const base = OFFICIAL_THEMES[0];

    const template = createThemeTemplate(base);
    template.light.background = 'modified';

    expect(template.id).toContain('custom-');
    expect(template.name).toBe('New Theme');
    expect(template.description).toBe('Theme description');
    expect(template.dark.background).toBe(base.dark.background);
    expect(base.light.background).not.toBe('modified');
  });
});
