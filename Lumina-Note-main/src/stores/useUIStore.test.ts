/**
 * useUIStore 测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock theme functions
vi.mock('@/lib/themePlugin', () => ({
  applyTheme: vi.fn(),
  getThemeById: vi.fn(() => ({ id: 'default', name: 'Default' })),
}));

import { useUIStore } from './useUIStore';

describe('useUIStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useUIStore.setState({
      isDarkMode: false,
      themeId: 'default',
      leftSidebarOpen: true,
      rightSidebarOpen: true,
      leftSidebarWidth: 256,
      rightSidebarWidth: 320,
      rightPanelTab: 'chat',
      chatMode: 'agent',
      aiPanelMode: 'docked',
      floatingPanelOpen: false,
      isFloatingBallDragging: false,
      mainView: 'editor',
      editorMode: 'live',
      splitView: false,
      splitDirection: 'horizontal',
      videoNoteOpen: false,
      videoNoteUrl: null,
      isSettingsOpen: false,
    });
    vi.clearAllMocks();
  });

  describe('sidebar controls', () => {
    it('should toggle left sidebar', () => {
      const store = useUIStore.getState();
      expect(store.leftSidebarOpen).toBe(true);
      
      store.toggleLeftSidebar();
      expect(useUIStore.getState().leftSidebarOpen).toBe(false);
      
      store.toggleLeftSidebar();
      expect(useUIStore.getState().leftSidebarOpen).toBe(true);
    });

    it('should toggle right sidebar', () => {
      const store = useUIStore.getState();
      store.toggleRightSidebar();
      expect(useUIStore.getState().rightSidebarOpen).toBe(false);
    });

    it('should set sidebar open state', () => {
      const store = useUIStore.getState();
      store.setLeftSidebarOpen(false);
      expect(useUIStore.getState().leftSidebarOpen).toBe(false);
      
      store.setRightSidebarOpen(false);
      expect(useUIStore.getState().rightSidebarOpen).toBe(false);
    });
  });

  describe('sidebar width', () => {
    it('should set left sidebar width within bounds', () => {
      const store = useUIStore.getState();
      
      store.setLeftSidebarWidth(300);
      expect(useUIStore.getState().leftSidebarWidth).toBe(300);
      
      // Test minimum bound (200)
      store.setLeftSidebarWidth(100);
      expect(useUIStore.getState().leftSidebarWidth).toBe(200);
      
      // Test maximum bound (480)
      store.setLeftSidebarWidth(600);
      expect(useUIStore.getState().leftSidebarWidth).toBe(480);
    });

    it('should set right sidebar width within bounds', () => {
      const store = useUIStore.getState();
      
      store.setRightSidebarWidth(400);
      expect(useUIStore.getState().rightSidebarWidth).toBe(400);
      
      // Test minimum bound (280)
      store.setRightSidebarWidth(100);
      expect(useUIStore.getState().rightSidebarWidth).toBe(280);
      
      // Test maximum bound (560)
      store.setRightSidebarWidth(800);
      expect(useUIStore.getState().rightSidebarWidth).toBe(560);
    });
  });

  describe('right panel tab', () => {
    it('should set right panel tab', () => {
      const store = useUIStore.getState();
      
      store.setRightPanelTab('outline');
      expect(useUIStore.getState().rightPanelTab).toBe('outline');
      
      store.setRightPanelTab('backlinks');
      expect(useUIStore.getState().rightPanelTab).toBe('backlinks');
      
      store.setRightPanelTab('tags');
      expect(useUIStore.getState().rightPanelTab).toBe('tags');
    });
  });

  describe('chat mode', () => {
    it('should set chat mode', () => {
      const store = useUIStore.getState();
      
      store.setChatMode('chat');
      expect(useUIStore.getState().chatMode).toBe('chat');
      
      store.setChatMode('research');
      expect(useUIStore.getState().chatMode).toBe('research');
      
      store.setChatMode('agent');
      expect(useUIStore.getState().chatMode).toBe('agent');
    });
  });

  describe('AI panel mode', () => {
    it('should set AI panel mode', () => {
      const store = useUIStore.getState();
      
      store.setAIPanelMode('floating');
      expect(useUIStore.getState().aiPanelMode).toBe('floating');
      
      store.setAIPanelMode('docked');
      expect(useUIStore.getState().aiPanelMode).toBe('docked');
    });

    it('should toggle floating panel', () => {
      const store = useUIStore.getState();
      expect(store.floatingPanelOpen).toBe(false);
      
      store.toggleFloatingPanel();
      expect(useUIStore.getState().floatingPanelOpen).toBe(true);
      
      store.toggleFloatingPanel();
      expect(useUIStore.getState().floatingPanelOpen).toBe(false);
    });

    it('should set floating ball dragging state', () => {
      const store = useUIStore.getState();
      
      store.setFloatingBallDragging(true);
      expect(useUIStore.getState().isFloatingBallDragging).toBe(true);
      
      store.setFloatingBallDragging(false);
      expect(useUIStore.getState().isFloatingBallDragging).toBe(false);
    });
  });

  describe('main view', () => {
    it('should set main view', () => {
      const store = useUIStore.getState();
      
      store.setMainView('graph');
      expect(useUIStore.getState().mainView).toBe('graph');
      
      store.setMainView('editor');
      expect(useUIStore.getState().mainView).toBe('editor');
    });
  });

  describe('editor mode', () => {
    it('should set editor mode', () => {
      const store = useUIStore.getState();
      
      store.setEditorMode('source');
      expect(useUIStore.getState().editorMode).toBe('source');
      
      store.setEditorMode('reading');
      expect(useUIStore.getState().editorMode).toBe('reading');
      
      store.setEditorMode('live');
      expect(useUIStore.getState().editorMode).toBe('live');
    });
  });

  describe('split view', () => {
    it('should toggle split view', () => {
      const store = useUIStore.getState();
      expect(store.splitView).toBe(false);
      
      store.toggleSplitView();
      expect(useUIStore.getState().splitView).toBe(true);
      
      store.toggleSplitView();
      expect(useUIStore.getState().splitView).toBe(false);
    });

    it('should set split view', () => {
      const store = useUIStore.getState();
      
      store.setSplitView(true);
      expect(useUIStore.getState().splitView).toBe(true);
      
      store.setSplitView(false);
      expect(useUIStore.getState().splitView).toBe(false);
    });

    it('should set split direction', () => {
      const store = useUIStore.getState();
      
      store.setSplitDirection('vertical');
      expect(useUIStore.getState().splitDirection).toBe('vertical');
      
      store.setSplitDirection('horizontal');
      expect(useUIStore.getState().splitDirection).toBe('horizontal');
    });
  });

  describe('video note', () => {
    it('should open video note', () => {
      const store = useUIStore.getState();
      
      store.openVideoNote('https://example.com/video');
      
      const state = useUIStore.getState();
      expect(state.videoNoteOpen).toBe(true);
      expect(state.videoNoteUrl).toBe('https://example.com/video');
    });

    it('should toggle video note', () => {
      const store = useUIStore.getState();
      
      store.toggleVideoNote();
      expect(useUIStore.getState().videoNoteOpen).toBe(true);
      
      store.toggleVideoNote();
      expect(useUIStore.getState().videoNoteOpen).toBe(false);
    });

    it('should set video note url', () => {
      const store = useUIStore.getState();
      
      store.setVideoNoteUrl('https://example.com/video');
      expect(useUIStore.getState().videoNoteUrl).toBe('https://example.com/video');
      
      store.setVideoNoteUrl(null);
      expect(useUIStore.getState().videoNoteUrl).toBeNull();
    });
  });

  describe('settings modal', () => {
    it('should set settings open', () => {
      const store = useUIStore.getState();
      
      store.setSettingsOpen(true);
      expect(useUIStore.getState().isSettingsOpen).toBe(true);
      
      store.setSettingsOpen(false);
      expect(useUIStore.getState().isSettingsOpen).toBe(false);
    });
  });
});
