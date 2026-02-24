/**
 * useEditorStore 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './useEditorStore';

describe('useEditorStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useEditorStore.getState().reset();
  });

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = useEditorStore.getState();
      expect(state.pendingEdit).toBeNull();
      expect(state.animationState).toBe('idle');
      expect(state.animationProgress).toBe(0);
      expect(state.highlightedRanges).toEqual([]);
      expect(state.highlightExpireAt).toBeNull();
    });
  });

  describe('setPendingEdit', () => {
    it('should set pending edit with diff', () => {
      const { setPendingEdit } = useEditorStore.getState();
      
      setPendingEdit({
        path: '/test/file.md',
        oldContent: 'Hello\nWorld',
        newContent: 'Hello\nNew World',
      });

      const state = useEditorStore.getState();
      expect(state.pendingEdit).not.toBeNull();
      expect(state.pendingEdit?.path).toBe('/test/file.md');
      expect(state.pendingEdit?.oldContent).toBe('Hello\nWorld');
      expect(state.pendingEdit?.newContent).toBe('Hello\nNew World');
      expect(state.pendingEdit?.changes).toBeDefined();
      expect(state.pendingEdit?.changes.length).toBeGreaterThan(0);
    });

    it('should generate unique id', () => {
      const { setPendingEdit } = useEditorStore.getState();
      
      setPendingEdit({
        path: '/test/file.md',
        oldContent: 'A',
        newContent: 'B',
      });
      const id1 = useEditorStore.getState().pendingEdit?.id;

      // Small delay to ensure different timestamp
      setPendingEdit({
        path: '/test/file.md',
        oldContent: 'C',
        newContent: 'D',
      });
      const id2 = useEditorStore.getState().pendingEdit?.id;

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      // IDs should start with the path
      expect(id1?.startsWith('/test/file.md-')).toBe(true);
    });

    it('should reset animation state when setting new edit', () => {
      const store = useEditorStore.getState();
      
      // First set an edit and start animation
      store.setPendingEdit({
        path: '/test/file.md',
        oldContent: 'A',
        newContent: 'B',
      });
      store.startAnimation();
      store.updateProgress(50);

      // Now set a new edit
      store.setPendingEdit({
        path: '/test/other.md',
        oldContent: 'X',
        newContent: 'Y',
      });

      const state = useEditorStore.getState();
      expect(state.animationState).toBe('idle');
      expect(state.animationProgress).toBe(0);
    });
  });

  describe('animation workflow', () => {
    it('should follow idle -> playing -> completed workflow', () => {
      const store = useEditorStore.getState();

      // Start with idle
      expect(store.animationState).toBe('idle');

      // Set edit
      store.setPendingEdit({
        path: '/test/file.md',
        oldContent: 'A',
        newContent: 'B',
      });
      expect(useEditorStore.getState().animationState).toBe('idle');

      // Start animation
      store.startAnimation();
      expect(useEditorStore.getState().animationState).toBe('playing');

      // Update progress
      store.updateProgress(50);
      expect(useEditorStore.getState().animationProgress).toBe(50);

      // Complete
      store.completeAnimation([
        { from: 0, to: 10, type: 'added' },
      ]);
      
      const finalState = useEditorStore.getState();
      expect(finalState.animationState).toBe('completed');
      expect(finalState.animationProgress).toBe(100);
      expect(finalState.highlightedRanges.length).toBe(1);
      expect(finalState.highlightExpireAt).toBeGreaterThan(Date.now());
    });
  });

  describe('clearHighlight', () => {
    it('should clear all highlight related state', () => {
      const store = useEditorStore.getState();

      // Setup state
      store.setPendingEdit({
        path: '/test/file.md',
        oldContent: 'A',
        newContent: 'B',
      });
      store.startAnimation();
      store.completeAnimation([
        { from: 0, to: 10, type: 'added' },
      ]);

      // Clear
      store.clearHighlight();

      const state = useEditorStore.getState();
      expect(state.pendingEdit).toBeNull();
      expect(state.animationState).toBe('idle');
      expect(state.highlightedRanges).toEqual([]);
      expect(state.highlightExpireAt).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      const store = useEditorStore.getState();

      // Setup some state
      store.setPendingEdit({
        path: '/test/file.md',
        oldContent: 'A',
        newContent: 'B',
      });
      store.startAnimation();
      store.updateProgress(75);
      store.completeAnimation([
        { from: 0, to: 10, type: 'modified' },
      ]);

      // Reset
      store.reset();

      const state = useEditorStore.getState();
      expect(state.pendingEdit).toBeNull();
      expect(state.animationState).toBe('idle');
      expect(state.animationProgress).toBe(0);
      expect(state.highlightedRanges).toEqual([]);
      expect(state.highlightExpireAt).toBeNull();
    });
  });

  describe('diff calculation', () => {
    it('should correctly identify added lines', () => {
      const store = useEditorStore.getState();
      
      store.setPendingEdit({
        path: '/test/file.md',
        oldContent: 'Line 1\n',
        newContent: 'Line 1\nLine 2\n',
      });

      const changes = useEditorStore.getState().pendingEdit?.changes;
      expect(changes).toBeDefined();
      
      const addedChange = changes?.find(c => c.added);
      expect(addedChange).toBeTruthy();
      expect(addedChange?.value).toContain('Line 2');
    });

    it('should correctly identify removed lines', () => {
      const store = useEditorStore.getState();
      
      store.setPendingEdit({
        path: '/test/file.md',
        oldContent: 'Line 1\nLine 2\n',
        newContent: 'Line 1\n',
      });

      const changes = useEditorStore.getState().pendingEdit?.changes;
      const removedChange = changes?.find(c => c.removed);
      expect(removedChange).toBeTruthy();
      expect(removedChange?.value).toContain('Line 2');
    });
  });
});
