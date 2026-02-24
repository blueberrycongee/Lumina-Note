/**
 * useBrowserStore 测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { useBrowserStore } from './useBrowserStore';

describe('useBrowserStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useBrowserStore.setState({
      instances: new Map(),
      activeTabId: null,
      globalHidden: false,
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have empty instances', () => {
      const state = useBrowserStore.getState();
      expect(state.instances.size).toBe(0);
    });

    it('should have no active tab', () => {
      const state = useBrowserStore.getState();
      expect(state.activeTabId).toBeNull();
    });

    it('should not be globally hidden', () => {
      const state = useBrowserStore.getState();
      expect(state.globalHidden).toBe(false);
    });
  });

  describe('registerWebView', () => {
    it('should register a new webview', () => {
      const store = useBrowserStore.getState();
      store.registerWebView('tab-1', 'https://example.com', 'Example');
      
      const state = useBrowserStore.getState();
      expect(state.instances.size).toBe(1);
      expect(state.instances.has('tab-1')).toBe(true);
    });

    it('should set correct initial properties', () => {
      const store = useBrowserStore.getState();
      store.registerWebView('tab-1', 'https://example.com', 'Example');
      
      const instance = useBrowserStore.getState().instances.get('tab-1');
      expect(instance?.url).toBe('https://example.com');
      expect(instance?.title).toBe('Example');
      expect(instance?.state).toBe('active');
      expect(instance?.webviewExists).toBe(true);
    });

    it('should use URL as title if not provided', () => {
      const store = useBrowserStore.getState();
      store.registerWebView('tab-1', 'https://example.com');
      
      const instance = useBrowserStore.getState().instances.get('tab-1');
      expect(instance?.title).toBe('https://example.com');
    });
  });

  describe('unregisterWebView', () => {
    it('should remove webview from instances', () => {
      const store = useBrowserStore.getState();
      store.registerWebView('tab-1', 'https://example.com');
      store.unregisterWebView('tab-1');
      
      expect(useBrowserStore.getState().instances.size).toBe(0);
    });

    it('should clear activeTabId if it was active', () => {
      const store = useBrowserStore.getState();
      store.registerWebView('tab-1', 'https://example.com');
      useBrowserStore.setState({ activeTabId: 'tab-1' });
      
      store.unregisterWebView('tab-1');
      
      expect(useBrowserStore.getState().activeTabId).toBeNull();
    });

    it('should keep activeTabId if different tab removed', () => {
      const store = useBrowserStore.getState();
      store.registerWebView('tab-1', 'https://example.com');
      store.registerWebView('tab-2', 'https://other.com');
      useBrowserStore.setState({ activeTabId: 'tab-1' });
      
      store.unregisterWebView('tab-2');
      
      expect(useBrowserStore.getState().activeTabId).toBe('tab-1');
    });
  });

  describe('setActiveTab', () => {
    it('should set active tab', () => {
      const store = useBrowserStore.getState();
      store.registerWebView('tab-1', 'https://example.com');
      store.setActiveTab('tab-1');
      
      expect(useBrowserStore.getState().activeTabId).toBe('tab-1');
    });

    it('should update previous tab to background', () => {
      const store = useBrowserStore.getState();
      store.registerWebView('tab-1', 'https://example.com');
      store.registerWebView('tab-2', 'https://other.com');
      
      store.setActiveTab('tab-1');
      store.setActiveTab('tab-2');
      
      const state = useBrowserStore.getState();
      expect(state.instances.get('tab-1')?.state).toBe('background');
      expect(state.instances.get('tab-2')?.state).toBe('active');
    });

    it('should update lastActiveTime for new active tab', () => {
      const store = useBrowserStore.getState();
      const before = Date.now();
      store.registerWebView('tab-1', 'https://example.com');
      store.setActiveTab('tab-1');
      const after = Date.now();
      
      const instance = useBrowserStore.getState().instances.get('tab-1');
      expect(instance?.lastActiveTime).toBeGreaterThanOrEqual(before);
      expect(instance?.lastActiveTime).toBeLessThanOrEqual(after);
    });

    it('should handle null tab id', () => {
      const store = useBrowserStore.getState();
      store.registerWebView('tab-1', 'https://example.com');
      store.setActiveTab('tab-1');
      store.setActiveTab(null);
      
      expect(useBrowserStore.getState().activeTabId).toBeNull();
    });
  });

  describe('updateUrl', () => {
    it('should update URL of existing tab', () => {
      const store = useBrowserStore.getState();
      store.registerWebView('tab-1', 'https://example.com');
      store.updateUrl('tab-1', 'https://new-url.com');
      
      const instance = useBrowserStore.getState().instances.get('tab-1');
      expect(instance?.url).toBe('https://new-url.com');
    });

    it('should ignore non-existent tab', () => {
      const store = useBrowserStore.getState();
      store.updateUrl('non-existent', 'https://example.com');
      
      expect(useBrowserStore.getState().instances.size).toBe(0);
    });
  });

  describe('updateTitle', () => {
    it('should update title of existing tab', () => {
      const store = useBrowserStore.getState();
      store.registerWebView('tab-1', 'https://example.com', 'Old Title');
      store.updateTitle('tab-1', 'New Title');
      
      const instance = useBrowserStore.getState().instances.get('tab-1');
      expect(instance?.title).toBe('New Title');
    });

    it('should ignore non-existent tab', () => {
      const store = useBrowserStore.getState();
      store.updateTitle('non-existent', 'Title');
      
      expect(useBrowserStore.getState().instances.size).toBe(0);
    });
  });

  describe('getTabState', () => {
    it('should return tab state', () => {
      const store = useBrowserStore.getState();
      store.registerWebView('tab-1', 'https://example.com');
      
      expect(store.getTabState('tab-1')).toBe('active');
    });

    it('should return null for non-existent tab', () => {
      const store = useBrowserStore.getState();
      expect(store.getTabState('non-existent')).toBeNull();
    });
  });

  describe('isWebViewExists', () => {
    it('should return true for existing webview', () => {
      const store = useBrowserStore.getState();
      store.registerWebView('tab-1', 'https://example.com');
      
      expect(store.isWebViewExists('tab-1')).toBe(true);
    });

    it('should return false for non-existent webview', () => {
      const store = useBrowserStore.getState();
      expect(store.isWebViewExists('non-existent')).toBe(false);
    });
  });
});
