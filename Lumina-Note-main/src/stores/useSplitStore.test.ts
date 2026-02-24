/**
 * useSplitStore 测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Tauri
vi.mock('@/lib/tauri', () => ({
  readFile: vi.fn(),
  saveFile: vi.fn(),
}));

// Mock frontmatter
vi.mock('@/services/markdown/frontmatter', () => ({
  parseFrontmatter: vi.fn(() => ({ frontmatter: {}, hasFrontmatter: false })),
}));

import { useSplitStore } from './useSplitStore';
import { readFile, saveFile } from '@/lib/tauri';

describe('useSplitStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useSplitStore.setState({
      activePane: 'primary',
      secondaryFile: null,
      secondaryFileType: 'markdown',
      secondaryContent: '',
      secondaryIsDirty: false,
      isLoadingSecondary: false,
      secondaryPdfPage: 1,
      secondaryPdfAnnotationId: null,
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = useSplitStore.getState();
      
      expect(state.activePane).toBe('primary');
      expect(state.secondaryFile).toBeNull();
      expect(state.secondaryFileType).toBe('markdown');
      expect(state.secondaryContent).toBe('');
      expect(state.secondaryIsDirty).toBe(false);
      expect(state.isLoadingSecondary).toBe(false);
    });
  });

  describe('setActivePane', () => {
    it('should set active pane to secondary', () => {
      const store = useSplitStore.getState();
      store.setActivePane('secondary');
      
      expect(useSplitStore.getState().activePane).toBe('secondary');
    });

    it('should set active pane to primary', () => {
      useSplitStore.setState({ activePane: 'secondary' });
      const store = useSplitStore.getState();
      store.setActivePane('primary');
      
      expect(useSplitStore.getState().activePane).toBe('primary');
    });
  });

  describe('openSecondaryPdf', () => {
    it('should open PDF with default page', () => {
      const store = useSplitStore.getState();
      store.openSecondaryPdf('/path/to/doc.pdf');
      
      const state = useSplitStore.getState();
      expect(state.secondaryFile).toBe('/path/to/doc.pdf');
      expect(state.secondaryFileType).toBe('pdf');
      expect(state.secondaryPdfPage).toBe(1);
      expect(state.secondaryPdfAnnotationId).toBeNull();
    });

    it('should open PDF with specific page', () => {
      const store = useSplitStore.getState();
      store.openSecondaryPdf('/path/to/doc.pdf', 5);
      
      const state = useSplitStore.getState();
      expect(state.secondaryPdfPage).toBe(5);
    });

    it('should open PDF with annotation ID', () => {
      const store = useSplitStore.getState();
      store.openSecondaryPdf('/path/to/doc.pdf', 3, 'ann-123');
      
      const state = useSplitStore.getState();
      expect(state.secondaryPdfPage).toBe(3);
      expect(state.secondaryPdfAnnotationId).toBe('ann-123');
    });
  });

  describe('updateSecondaryContent', () => {
    it('should update content and set dirty flag', () => {
      const store = useSplitStore.getState();
      store.updateSecondaryContent('New content');
      
      const state = useSplitStore.getState();
      expect(state.secondaryContent).toBe('New content');
      expect(state.secondaryIsDirty).toBe(true);
    });
  });

  describe('closeSecondary', () => {
    it('should reset all secondary state', () => {
      // Set up some state
      useSplitStore.setState({
        secondaryFile: '/some/file.md',
        secondaryContent: 'Some content',
        secondaryIsDirty: true,
        secondaryPdfPage: 5,
        secondaryPdfAnnotationId: 'ann-123',
        activePane: 'secondary',
      });
      
      const store = useSplitStore.getState();
      store.closeSecondary();
      
      const state = useSplitStore.getState();
      expect(state.secondaryFile).toBeNull();
      expect(state.secondaryContent).toBe('');
      expect(state.secondaryIsDirty).toBe(false);
      expect(state.secondaryPdfPage).toBe(1);
      expect(state.secondaryPdfAnnotationId).toBeNull();
      expect(state.activePane).toBe('primary');
    });
  });

  describe('openSecondaryFile', () => {
    it('should load file content', async () => {
      vi.mocked(readFile).mockResolvedValue('# Test Content');
      
      const store = useSplitStore.getState();
      await store.openSecondaryFile('/path/to/file.md');
      
      const state = useSplitStore.getState();
      expect(state.secondaryFile).toBe('/path/to/file.md');
      expect(state.secondaryContent).toBe('# Test Content');
      expect(state.secondaryFileType).toBe('markdown');
      expect(state.secondaryIsDirty).toBe(false);
      expect(state.isLoadingSecondary).toBe(false);
    });

    it('should handle read error gracefully', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'));
      
      const store = useSplitStore.getState();
      await store.openSecondaryFile('/invalid/path.md');
      
      const state = useSplitStore.getState();
      expect(state.isLoadingSecondary).toBe(false);
    });
  });

  describe('saveSecondary', () => {
    it('should save dirty content', async () => {
      vi.mocked(saveFile).mockResolvedValue(undefined);
      
      useSplitStore.setState({
        secondaryFile: '/path/to/file.md',
        secondaryContent: 'Updated content',
        secondaryIsDirty: true,
      });
      
      const store = useSplitStore.getState();
      await store.saveSecondary();
      
      expect(saveFile).toHaveBeenCalledWith('/path/to/file.md', 'Updated content');
      expect(useSplitStore.getState().secondaryIsDirty).toBe(false);
    });

    it('should not save if not dirty', async () => {
      useSplitStore.setState({
        secondaryFile: '/path/to/file.md',
        secondaryContent: 'Content',
        secondaryIsDirty: false,
      });
      
      const store = useSplitStore.getState();
      await store.saveSecondary();
      
      expect(saveFile).not.toHaveBeenCalled();
    });

    it('should not save if no file open', async () => {
      useSplitStore.setState({
        secondaryFile: null,
        secondaryIsDirty: true,
      });
      
      const store = useSplitStore.getState();
      await store.saveSecondary();
      
      expect(saveFile).not.toHaveBeenCalled();
    });
  });

  describe('reloadSecondaryIfOpen', () => {
    it('should reload if same file is open', async () => {
      vi.mocked(readFile).mockResolvedValue('Reloaded content');
      
      useSplitStore.setState({
        secondaryFile: '/path/to/file.md',
        secondaryContent: 'Old content',
      });
      
      const store = useSplitStore.getState();
      await store.reloadSecondaryIfOpen('/path/to/file.md');
      
      expect(useSplitStore.getState().secondaryContent).toBe('Reloaded content');
      expect(useSplitStore.getState().secondaryIsDirty).toBe(false);
    });

    it('should skip reload when dirty and skipIfDirty is set', async () => {
      vi.mocked(readFile).mockResolvedValue('Reloaded content');

      useSplitStore.setState({
        secondaryFile: '/path/to/file.md',
        secondaryContent: 'Dirty content',
        secondaryIsDirty: true,
      });

      const store = useSplitStore.getState();
      await store.reloadSecondaryIfOpen('/path/to/file.md', { skipIfDirty: true });

      expect(readFile).not.toHaveBeenCalled();
      expect(useSplitStore.getState().secondaryContent).toBe('Dirty content');
      expect(useSplitStore.getState().secondaryIsDirty).toBe(true);
    });

    it('should not reload if different file', async () => {
      useSplitStore.setState({
        secondaryFile: '/path/to/other.md',
        secondaryContent: 'Original content',
      });
      
      const store = useSplitStore.getState();
      await store.reloadSecondaryIfOpen('/path/to/file.md');
      
      expect(readFile).not.toHaveBeenCalled();
      expect(useSplitStore.getState().secondaryContent).toBe('Original content');
    });
  });
});
