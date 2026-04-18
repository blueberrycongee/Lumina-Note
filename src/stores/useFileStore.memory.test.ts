import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/host', () => ({
  listDirectory: vi.fn(() => Promise.resolve([])),
  readFile: vi.fn((path: string) => Promise.resolve(`# ${path}\n\nMock content for ${path}`)),
  saveFile: vi.fn((path: string, content: string) => Promise.resolve({ path, content })),
  createFile: vi.fn((path: string) => Promise.resolve(path)),
  createDir: vi.fn((path: string, options?: { recursive?: boolean }) => Promise.resolve({ path, options })),
}));

import { useFileStore } from './useFileStore';

function generateContent(sizeKB: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789 \n';
  let content = '# Test File\n\n';
  while (content.length < sizeKB * 1024) {
    content += chars[Math.floor(Math.random() * chars.length)];
  }
  return content;
}

describe('useFileStore undo history behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    useFileStore.setState({
      vaultPath: '/mock/vault',
      fileTree: [],
      tabs: [],
      activeTabIndex: -1,
      currentFile: null,
      currentContent: '',
      isDirty: false,
      isLoadingTree: false,
      isLoadingFile: false,
      isSaving: false,
      undoStack: [],
      redoStack: [],
      lastSavedContent: '',
      navigationHistory: [],
      navigationIndex: -1,
      recentFiles: [],
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid user edits into a single undo point', () => {
    const store = useFileStore.getState();
    const initialContent = generateContent(2);

    useFileStore.setState({
      currentContent: initialContent,
      lastSavedContent: initialContent,
    });

    store.updateContent(`${initialContent}\nedit-1`, 'user');
    vi.advanceTimersByTime(400);
    store.updateContent(`${initialContent}\nedit-2`, 'user');
    vi.advanceTimersByTime(400);
    store.updateContent(`${initialContent}\nedit-3`, 'user');

    expect(useFileStore.getState().undoStack).toHaveLength(1);
  });

  it('creates new undo points after the debounce window elapses', () => {
    const store = useFileStore.getState();
    const initialContent = generateContent(2);

    useFileStore.setState({
      currentContent: initialContent,
      lastSavedContent: initialContent,
    });

    store.updateContent(`${initialContent}\nedit-1`, 'user');
    vi.advanceTimersByTime(1200);
    store.updateContent(`${initialContent}\nedit-2`, 'user');
    vi.advanceTimersByTime(1200);
    store.updateContent(`${initialContent}\nedit-3`, 'user');

    expect(useFileStore.getState().undoStack).toHaveLength(3);
  });

  it('caps undo history at 50 entries', () => {
    const store = useFileStore.getState();
    const initialContent = generateContent(1);

    useFileStore.setState({
      currentContent: initialContent,
      lastSavedContent: initialContent,
    });

    for (let i = 0; i < 60; i += 1) {
      vi.advanceTimersByTime(1200);
      store.updateContent(`${initialContent}\nedit-${i}`, 'user');
    }

    const undoStack = useFileStore.getState().undoStack;
    expect(undoStack).toHaveLength(50);
    expect(undoStack[0]?.content).toContain('edit-9');
    expect(undoStack.at(-1)?.content).toContain('edit-58');
  });

  it('replaces the tabs array snapshot when switching tabs', () => {
    const content1 = generateContent(1);
    const content2 = generateContent(1);

    useFileStore.setState({
      tabs: [
        {
          id: 'tab-1',
          type: 'file',
          path: '/file1.md',
          name: 'file1',
          content: content1,
          isDirty: false,
          undoStack: [],
          redoStack: [],
        },
        {
          id: 'tab-2',
          type: 'file',
          path: '/file2.md',
          name: 'file2',
          content: content2,
          isDirty: false,
          undoStack: [],
          redoStack: [],
        },
      ],
      activeTabIndex: 0,
      currentFile: '/file1.md',
      currentContent: content1,
    });

    const store = useFileStore.getState();
    const initialTabs = store.tabs;

    store.switchTab(1);

    expect(useFileStore.getState().tabs).not.toBe(initialTabs);
    expect(useFileStore.getState().currentFile).toBe('/file2.md');
    expect(useFileStore.getState().currentContent).toBe(content2);
  });
});
