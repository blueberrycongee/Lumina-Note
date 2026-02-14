/**
 * 浏览器标签页状态管理
 * 实现 Chrome 风格的标签页生命周期管理：
 * - Active: 当前激活的标签页，WebView 可见
 * - Background: 后台标签页，WebView 隐藏但保持活跃
 * - Frozen: 冻结的标签页，JS 暂停但 DOM 保留（通过隐藏实现）
 * - Discarded: 已丢弃的标签页，WebView 已销毁，只保留 URL
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { reportOperationError } from '@/lib/reportError';

// 标签页状态
export type TabState = 'active' | 'background' | 'frozen' | 'discarded';

// WebView 实例信息
export interface WebViewInstance {
  tabId: string;
  url: string;
  title: string;
  state: TabState;
  lastActiveTime: number;  // 最后活跃时间戳
  webviewExists: boolean;  // WebView 是否存在
}

// 配置
const CONFIG = {
  // 后台标签页超过此时间（毫秒）后冻结
  FREEZE_TIMEOUT: 5 * 60 * 1000, // 5 分钟
  // 最大活跃 WebView 数量，超过后丢弃最久未使用的
  MAX_ACTIVE_WEBVIEWS: 10,
  // 检查间隔
  CHECK_INTERVAL: 60 * 1000, // 1 分钟
};

interface BrowserState {
  // WebView 实例映射
  instances: Map<string, WebViewInstance>;
  // 当前激活的标签页 ID
  activeTabId: string | null;
  // 全局隐藏状态（用于模态框打开时）
  globalHidden: boolean;
  
  // Actions
  registerWebView: (tabId: string, url: string, title?: string) => void;
  unregisterWebView: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  updateUrl: (tabId: string, url: string) => void;
  updateTitle: (tabId: string, title: string) => void;
  
  // 状态管理
  freezeTab: (tabId: string) => Promise<void>;
  unfreezeTab: (tabId: string) => Promise<void>;
  discardTab: (tabId: string) => Promise<void>;
  restoreTab: (tabId: string) => Promise<void>;
  
  // 全局隐藏/显示（用于模态框）
  hideAllWebViews: () => Promise<void>;
  showAllWebViews: () => Promise<void>;
  
  // 获取状态
  getTabState: (tabId: string) => TabState | null;
  isWebViewExists: (tabId: string) => boolean;
  
  // 生命周期管理
  checkAndManageTabs: () => Promise<void>;
  startLifecycleManager: () => void;
  stopLifecycleManager: () => void;
}

// 生命周期管理定时器
let lifecycleTimer: ReturnType<typeof setInterval> | null = null;

export const useBrowserStore = create<BrowserState>((set, get) => ({
  instances: new Map(),
  activeTabId: null,
  globalHidden: false,
  
  // 注册新的 WebView
  registerWebView: (tabId: string, url: string, title?: string) => {
    const { instances } = get();
    const newInstances = new Map(instances);
    
    newInstances.set(tabId, {
      tabId,
      url,
      title: title || url,
      state: 'active',
      lastActiveTime: Date.now(),
      webviewExists: true,
    });
    
    set({ instances: newInstances });
    console.log('[BrowserStore] 注册 WebView:', tabId);
  },
  
  // 注销 WebView（标签页关闭时调用）
  unregisterWebView: (tabId: string) => {
    const { instances, activeTabId } = get();
    const newInstances = new Map(instances);
    newInstances.delete(tabId);
    
    set({
      instances: newInstances,
      activeTabId: activeTabId === tabId ? null : activeTabId,
    });
    console.log('[BrowserStore] 注销 WebView:', tabId);
  },
  
  // 设置当前激活的标签页
  setActiveTab: (tabId: string | null) => {
    const { instances, activeTabId: prevActiveTabId } = get();
    const newInstances = new Map(instances);
    
    // 将之前的激活标签页设为后台
    if (prevActiveTabId && newInstances.has(prevActiveTabId)) {
      const prevInstance = newInstances.get(prevActiveTabId)!;
      newInstances.set(prevActiveTabId, {
        ...prevInstance,
        state: 'background',
      });
    }
    
    // 将新标签页设为激活
    if (tabId && newInstances.has(tabId)) {
      const instance = newInstances.get(tabId)!;
      newInstances.set(tabId, {
        ...instance,
        state: 'active',
        lastActiveTime: Date.now(),
      });
    }
    
    set({ instances: newInstances, activeTabId: tabId });
    console.log('[BrowserStore] 切换激活标签页:', prevActiveTabId, '->', tabId);
  },
  
  // 更新 URL
  updateUrl: (tabId: string, url: string) => {
    const { instances } = get();
    if (!instances.has(tabId)) return;
    
    const newInstances = new Map(instances);
    const instance = newInstances.get(tabId)!;
    newInstances.set(tabId, { ...instance, url });
    
    set({ instances: newInstances });
  },
  
  // 更新标题
  updateTitle: (tabId: string, title: string) => {
    const { instances } = get();
    if (!instances.has(tabId)) return;
    
    const newInstances = new Map(instances);
    const instance = newInstances.get(tabId)!;
    newInstances.set(tabId, { ...instance, title });
    
    set({ instances: newInstances });
  },
  
  // 冻结标签页（暂停 JS，但保留 WebView）
  freezeTab: async (tabId: string) => {
    const { instances } = get();
    if (!instances.has(tabId)) return;
    
    const instance = instances.get(tabId)!;
    if (instance.state === 'frozen' || instance.state === 'discarded') return;
    
    try {
      // 通过注入 JS 暂停页面活动
      await invoke('browser_webview_freeze', { tabId });
      
      const newInstances = new Map(instances);
      newInstances.set(tabId, { ...instance, state: 'frozen' });
      set({ instances: newInstances });
      
      console.log('[BrowserStore] 冻结标签页:', tabId);
    } catch (err) {
      reportOperationError({
        source: "BrowserStore.freezeTab",
        action: "Freeze browser tab",
        error: err,
        level: "warning",
        context: { tabId },
      });
    }
  },
  
  // 解冻标签页
  unfreezeTab: async (tabId: string) => {
    const { instances } = get();
    if (!instances.has(tabId)) return;
    
    const instance = instances.get(tabId)!;
    if (instance.state !== 'frozen') return;
    
    try {
      // 恢复页面活动
      await invoke('browser_webview_unfreeze', { tabId });
      
      const newInstances = new Map(instances);
      newInstances.set(tabId, {
        ...instance,
        state: 'background',
        lastActiveTime: Date.now(),
      });
      set({ instances: newInstances });
      
      console.log('[BrowserStore] 解冻标签页:', tabId);
    } catch (err) {
      reportOperationError({
        source: "BrowserStore.unfreezeTab",
        action: "Unfreeze browser tab",
        error: err,
        level: "warning",
        context: { tabId },
      });
    }
  },
  
  // 丢弃标签页（销毁 WebView，只保留 URL）
  discardTab: async (tabId: string) => {
    const { instances, activeTabId } = get();
    if (!instances.has(tabId)) return;
    if (tabId === activeTabId) return; // 不能丢弃当前激活的标签页
    
    const instance = instances.get(tabId)!;
    if (instance.state === 'discarded') return;
    
    try {
      // 关闭 WebView
      await invoke('close_browser_webview', { tabId });
      
      const newInstances = new Map(instances);
      newInstances.set(tabId, {
        ...instance,
        state: 'discarded',
        webviewExists: false,
      });
      set({ instances: newInstances });
      
      console.log('[BrowserStore] 丢弃标签页:', tabId, '保留 URL:', instance.url);
    } catch (err) {
      reportOperationError({
        source: "BrowserStore.discardTab",
        action: "Discard browser tab webview",
        error: err,
        level: "warning",
        context: { tabId, url: instance.url },
      });
    }
  },
  
  // 恢复已丢弃的标签页
  restoreTab: async (tabId: string) => {
    const { instances } = get();
    if (!instances.has(tabId)) return;
    
    const instance = instances.get(tabId)!;
    if (instance.state !== 'discarded') return;
    
    // 标记为需要重新创建 WebView
    const newInstances = new Map(instances);
    newInstances.set(tabId, {
      ...instance,
      state: 'active',
      lastActiveTime: Date.now(),
      webviewExists: false, // 前端会检测到这个状态并重新创建
    });
    set({ instances: newInstances });
    
    console.log('[BrowserStore] 恢复标签页:', tabId);
  },
  
  // 获取标签页状态
  getTabState: (tabId: string) => {
    const { instances } = get();
    return instances.get(tabId)?.state || null;
  },
  
  // 检查 WebView 是否存在
  isWebViewExists: (tabId: string) => {
    const { instances } = get();
    return instances.get(tabId)?.webviewExists || false;
  },
  
  // 检查并管理标签页生命周期
  checkAndManageTabs: async () => {
    const { instances, activeTabId, freezeTab, discardTab } = get();
    const now = Date.now();
    
    // 收集需要处理的标签页
    const backgroundTabs: WebViewInstance[] = [];
    
    for (const [tabId, instance] of instances) {
      if (tabId === activeTabId) continue;
      if (instance.state === 'discarded') continue;
      
      backgroundTabs.push(instance);
    }
    
    // 按最后活跃时间排序（最久未使用的在前）
    backgroundTabs.sort((a, b) => a.lastActiveTime - b.lastActiveTime);
    
    // 冻结超时的后台标签页
    for (const instance of backgroundTabs) {
      if (instance.state === 'background') {
        const idleTime = now - instance.lastActiveTime;
        if (idleTime > CONFIG.FREEZE_TIMEOUT) {
          await freezeTab(instance.tabId);
        }
      }
    }
    
    // 如果活跃 WebView 数量超过限制，丢弃最久未使用的
    const activeWebViews = backgroundTabs.filter(t => t.webviewExists);
    if (activeWebViews.length > CONFIG.MAX_ACTIVE_WEBVIEWS) {
      const toDiscard = activeWebViews.slice(0, activeWebViews.length - CONFIG.MAX_ACTIVE_WEBVIEWS);
      for (const instance of toDiscard) {
        await discardTab(instance.tabId);
      }
    }
  },
  
  // 启动生命周期管理器
  startLifecycleManager: () => {
    if (lifecycleTimer) return;
    
    lifecycleTimer = setInterval(() => {
      void get().checkAndManageTabs().catch((error) => {
        reportOperationError({
          source: "BrowserStore.startLifecycleManager",
          action: "Run browser tab lifecycle check",
          error,
          level: "warning",
        });
      });
    }, CONFIG.CHECK_INTERVAL);
    
    console.log('[BrowserStore] 生命周期管理器已启动');
  },
  
  // 停止生命周期管理器
  stopLifecycleManager: () => {
    if (lifecycleTimer) {
      clearInterval(lifecycleTimer);
      lifecycleTimer = null;
      console.log('[BrowserStore] 生命周期管理器已停止');
    }
  },
  
  // 隐藏所有 WebView（用于模态框打开时）
  hideAllWebViews: async () => {
    const { instances, globalHidden } = get();
    if (globalHidden) return; // 已经隐藏了
    
    set({ globalHidden: true });
    
    for (const [tabId, instance] of instances) {
      if (instance.webviewExists) {
        try {
          await invoke('set_browser_webview_visible', { tabId, visible: false });
        } catch (err) {
          reportOperationError({
            source: "BrowserStore.hideAllWebViews",
            action: "Hide browser webview",
            error: err,
            level: "warning",
            context: { tabId },
          });
        }
      }
    }
    console.log('[BrowserStore] 已隐藏所有 WebView');
  },
  
  // 显示所有 WebView（用于模态框关闭时）
  showAllWebViews: async () => {
    const { instances, activeTabId, globalHidden } = get();
    if (!globalHidden) return; // 没有被隐藏
    
    set({ globalHidden: false });
    
    // 只显示当前激活的 WebView
    if (activeTabId) {
      // 优先从 instances 检查，但即使不在 instances 中也尝试显示
      const instance = instances.get(activeTabId);
      if (!instance || instance.webviewExists) {
        try {
          await invoke('set_browser_webview_visible', { tabId: activeTabId, visible: true });
        } catch (err) {
          reportOperationError({
            source: "BrowserStore.showAllWebViews",
            action: "Restore active browser webview visibility",
            error: err,
            level: "warning",
            context: { tabId: activeTabId },
          });
        }
      }
    }
    console.log('[BrowserStore] 已恢复 WebView 显示');
  },
}));
