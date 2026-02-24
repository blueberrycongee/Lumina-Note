/**
 * 浏览器视图组件
 * 使用 Tauri WebView 显示网页内容
 * 
 * 技术方案：
 * - 使用 Tauri 的 add_child WebView 创建独立的浏览器实例
 * - 不受 X-Frame-Options 限制（因为不是 iframe）
 * - 支持访问 Google、GitHub 等所有网站
 * - 在 Windows 上使用 WebView2（基于 Chromium）
 * 
 * 标签页生命周期管理（Chrome 风格）：
 * - Active: 当前激活的标签页，WebView 可见
 * - Background: 后台标签页，WebView 隐藏但保持活跃
 * - Frozen: 冻结的标签页，JS 暂停但 DOM 保留
 * - Discarded: 已丢弃的标签页，WebView 已销毁，只保留 URL
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Globe, Bookmark, Share2, AlertCircle, PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useLocaleStore } from '@/stores/useLocaleStore';
import { AddressBar } from './AddressBar';
import { useFileStore } from '@/stores/useFileStore';
import { useBrowserStore } from '@/stores/useBrowserStore';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';
import { reportOperationError } from '@/lib/reportError';

interface BrowserViewProps {
  tabId: string;
  initialUrl?: string;
  isActive?: boolean;
  onTitleChange?: (title: string) => void;
}

// 默认首页
const DEFAULT_HOME_URL = 'https://www.google.com';

export function BrowserView({
  tabId,
  initialUrl = '',
  isActive = true,
  onTitleChange,
}: BrowserViewProps) {
  const { updateWebpageTab } = useFileStore();
  const {
    registerWebView,
    updateUrl,
    updateTitle,
    startLifecycleManager,
    setActiveTab,
    globalHidden,
  } = useBrowserStore();
  const { t } = useLocaleStore();
  
  // 状态 - 使用 tabId 作为 key 来跟踪当前标签页的状态
  const [currentUrl, setCurrentUrl] = useState(initialUrl || '');
  const [isLoading, setIsLoading] = useState(false);
  const [webviewCreated, setWebviewCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 跟踪上一个 tabId，用于在切换时隐藏旧的 WebView
  const prevTabIdRef = useRef<string | null>(null);
  
  // 容器引用
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 启动生命周期管理器（只在首次挂载时）
  useEffect(() => {
    startLifecycleManager();
  }, [startLifecycleManager]);

  // 当标签页激活时，更新 store 中的 activeTabId
  useEffect(() => {
    if (isActive) {
      setActiveTab(tabId);
    }
  }, [tabId, isActive, setActiveTab]);

  // 当 isActive 变化时，显示/隐藏 WebView
  useEffect(() => {
    if (!webviewCreated) return;
    
    const updateVisibility = async () => {
      try {
        await invoke('set_browser_webview_visible', { tabId, visible: isActive });
        console.log('[Browser] WebView visibility updated:', tabId, isActive);
      } catch (err) {
        reportOperationError({
          source: "BrowserView.updateVisibility",
          action: "Update browser webview visibility",
          error: err,
          level: "warning",
          context: { tabId, isActive },
        });
      }
    };
    
    updateVisibility();
  }, [tabId, isActive, webviewCreated]);

  // 组件卸载时隐藏 WebView
  useEffect(() => {
    return () => {
      // 组件卸载时隐藏当前 WebView
      void invoke('set_browser_webview_visible', { tabId, visible: false }).catch((err) => {
        reportOperationError({
          source: "BrowserView.unmount",
          action: "Hide browser webview on unmount",
          error: err,
          level: "warning",
          context: { tabId },
        });
      });
    };
  }, [tabId]);

  // 当 tabId 变化时，处理标签页切换
  useEffect(() => {
    const handleTabSwitch = async () => {
      const prevTabId = prevTabIdRef.current;
      
      // 如果 tabId 变化了，需要切换 WebView
      if (prevTabId && prevTabId !== tabId) {
        console.log('[Browser] 标签页切换:', prevTabId, '->', tabId);
        
        // 隐藏旧的 WebView
        try {
          await invoke('set_browser_webview_visible', { tabId: prevTabId, visible: false });
          console.log('[Browser] Hiding old WebView:', prevTabId);
        } catch (err) {
          reportOperationError({
            source: "BrowserView.handleTabSwitch",
            action: "Hide previous browser webview",
            error: err,
            level: "warning",
            context: { previousTabId: prevTabId },
          });
        }
        
        // 重置组件状态，准备显示新标签页
        setCurrentUrl(initialUrl || '');
        setError(null);
        setIsLoading(false);
        
        // 检查新标签页的 WebView 是否存在
        try {
          const exists = await invoke<boolean>('browser_webview_exists', { tabId });
          setWebviewCreated(exists);
          
          if (exists) {
            // WebView 已存在，显示它
            await invoke('set_browser_webview_visible', { tabId, visible: true });
            // 更新位置
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              await invoke('update_browser_webview_bounds', {
                tabId,
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
              });
            }
            console.log('[Browser] Showing existing WebView:', tabId);
          }
        } catch (err) {
          reportOperationError({
            source: "BrowserView.handleTabSwitch",
            action: "Check browser webview availability",
            error: err,
            level: "warning",
            context: { tabId },
          });
          setWebviewCreated(false);
        }
      }
      
      prevTabIdRef.current = tabId;
    };
    
    handleTabSwitch();
  }, [tabId, initialUrl]);
  
  // 创建浏览器视图（使用 Tauri WebView，不是 iframe）
  const createWebview = useCallback(async (url: string) => {
    if (!url) return;
    
    // 确保容器已渲染
    if (!containerRef.current) {
      console.warn('[Browser] Container not ready, delaying WebView creation');
      setTimeout(() => createWebview(url), 100);
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      const rect = containerRef.current.getBoundingClientRect();
      
      // 确保容器有有效尺寸
      if (rect.width <= 0 || rect.height <= 0) {
        console.warn('[Browser] Container size invalid, delaying WebView creation');
        setTimeout(() => createWebview(url), 100);
        return;
      }
      
      // 检查 WebView 是否已存在
      const exists = await invoke<boolean>('browser_webview_exists', { tabId });
      
      if (!exists) {
        // 创建新的 WebView
        await invoke('create_browser_webview', {
          tabId,
          url,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
        console.log('[Browser] WebView created successfully:', tabId, url);
      } else {
        // WebView 已存在，显示并更新位置
        await invoke('set_browser_webview_visible', { tabId, visible: true });
        await invoke('update_browser_webview_bounds', {
          tabId,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
        console.log('[Browser] WebView exists, showing and updating position:', tabId);
      }
      
      setWebviewCreated(true);
      setCurrentUrl(url);
      
      // 注册到 store
      registerWebView(tabId, url);
      
      // 创建后立即更新尺寸，确保显示正确
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        await invoke('update_browser_webview_bounds', {
          tabId,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
      }
      
      // 更新标签页信息
      try {
        const urlObj = new URL(url);
        const title = urlObj.hostname;
        updateWebpageTab(tabId, url, title);
        updateTitle(tabId, title);
        onTitleChange?.(title);
      } catch {
        // URL 解析失败
      }
    } catch (err) {
      reportOperationError({
        source: "BrowserView.createWebview",
        action: "Create browser webview",
        error: err,
        context: { tabId, url },
      });
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [tabId, registerWebView, updateWebpageTab, updateTitle, onTitleChange]);
  
  // 更新 WebView 浏览器位置大小
  const updateWebviewBounds = useCallback(async () => {
    if (!webviewCreated || !containerRef.current) return;
    
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    try {
      await invoke('update_browser_webview_bounds', {
        tabId,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    } catch (err) {
      reportOperationError({
        source: "BrowserView.updateWebviewBounds",
        action: "Update browser webview bounds",
        error: err,
        level: "warning",
        context: { tabId, width: rect.width, height: rect.height },
      });
    }
  }, [tabId, webviewCreated]);

  // 当 globalHidden 从 true 变为 false 时，更新 WebView 位置
  // 这是为了解决模态框关闭后 WebView 位置错乱的问题
  const prevGlobalHiddenRef = useRef(globalHidden);
  useEffect(() => {
    if (prevGlobalHiddenRef.current && !globalHidden && isActive && webviewCreated) {
      // globalHidden 从 true 变为 false，需要更新位置
      console.log('[Browser] Modal closed, updating WebView position:', tabId);
      updateWebviewBounds();
    }
    prevGlobalHiddenRef.current = globalHidden;
  }, [globalHidden, isActive, webviewCreated, tabId, updateWebviewBounds]);

  // 导航到新 URL
  const handleNavigate = useCallback(async (url: string) => {
    if (!url) return;
    
    setCurrentUrl(url);
    setIsLoading(true);
    
    try {
      if (webviewCreated) {
        await invoke('navigate_browser_webview', { tabId, url });
        // 导航后更新 WebView 尺寸，确保显示正确
        await updateWebviewBounds();
      } else {
        await createWebview(url);
      }
      
      // 更新 store 和标签页信息
      updateUrl(tabId, url);
      try {
        const urlObj = new URL(url);
        const title = urlObj.hostname;
        updateWebpageTab(tabId, url, title);
        updateTitle(tabId, title);
        onTitleChange?.(title);
      } catch {
        // URL 解析失败
      }
    } catch (err) {
      reportOperationError({
        source: "BrowserView.handleNavigate",
        action: "Navigate browser webview",
        error: err,
        context: { tabId, url },
      });
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [tabId, webviewCreated, createWebview, updateUrl, updateWebpageTab, updateTitle, onTitleChange, updateWebviewBounds]);
  
  // 后退
  const handleBack = useCallback(async () => {
    if (!webviewCreated) return;
    try {
      await invoke('browser_webview_go_back', { tabId });
    } catch (err) {
      reportOperationError({
        source: "BrowserView.handleBack",
        action: "Navigate back in browser webview",
        error: err,
        level: "warning",
        context: { tabId },
      });
    }
  }, [tabId, webviewCreated]);
  
  // 前进
  const handleForward = useCallback(async () => {
    if (!webviewCreated) return;
    try {
      await invoke('browser_webview_go_forward', { tabId });
    } catch (err) {
      reportOperationError({
        source: "BrowserView.handleForward",
        action: "Navigate forward in browser webview",
        error: err,
        level: "warning",
        context: { tabId },
      });
    }
  }, [tabId, webviewCreated]);
  
  // 刷新
  const handleRefresh = useCallback(async () => {
    try {
      setIsLoading(true);
      await invoke('browser_webview_reload', { tabId });
    } catch (err) {
      reportOperationError({
        source: "BrowserView.handleRefresh",
        action: "Refresh browser webview",
        error: err,
        level: "warning",
        context: { tabId },
      });
    } finally {
      setTimeout(() => setIsLoading(false), 500);
    }
  }, [tabId]);
  
  // 主页
  const handleHome = useCallback(() => {
    handleNavigate(DEFAULT_HOME_URL);
  }, [handleNavigate]);
  
  // 初始化：如果有初始 URL 且 WebView 未创建，创建 WebView
  useEffect(() => {
    if (initialUrl && !webviewCreated && isActive) {
      // 检查是否已经有 WebView 存在
      void invoke<boolean>('browser_webview_exists', { tabId })
        .then((exists) => {
          if (exists) {
            // WebView 已存在，只需要显示
            setWebviewCreated(true);
            setCurrentUrl(initialUrl);
            void invoke('set_browser_webview_visible', { tabId, visible: true }).catch((err) => {
              reportOperationError({
                source: "BrowserView.initialMount",
                action: "Show existing browser webview",
                error: err,
                level: "warning",
                context: { tabId },
              });
            });
            void updateWebviewBounds();
          } else {
            // 创建新 WebView
            void createWebview(initialUrl);
          }
        })
        .catch((error) => {
          reportOperationError({
            source: "BrowserView.initialMount",
            action: "Check browser webview existence",
            error,
            level: "warning",
            context: { tabId },
          });
        });
    }
  }, [tabId, initialUrl, webviewCreated, isActive, createWebview, updateWebviewBounds]);
  
  // 监听窗口大小变化
  useEffect(() => {
    if (!webviewCreated) return;
    
    const handleResize = () => updateWebviewBounds();
    window.addEventListener('resize', handleResize);
    
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [webviewCreated, updateWebviewBounds]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* 地址栏 */}
      <AddressBar
        url={currentUrl}
        onNavigate={handleNavigate}
        onBack={handleBack}
        onForward={handleForward}
        onRefresh={handleRefresh}
        onHome={handleHome}
        canGoBack={webviewCreated}
        canGoForward={webviewCreated}
        isLoading={isLoading}
      />
      
      {/* 工具栏 - 快捷网址 */}
      <div className="flex items-center gap-1 px-2 py-0.5 border-b border-border bg-muted/30 overflow-x-auto scrollbar-none">
        {/* 切换左侧侧边栏按钮 */}
        <button
          onClick={() => useUIStore.getState().toggleLeftSidebar()}
          className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0"
          title={t.browser.toggleLeftPanel}
        >
          <PanelLeftOpen size={12} />
        </button>
        <button
          className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0"
          title={t.browser.addBookmark}
        >
          <Bookmark size={12} />
        </button>
        <button
          className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0"
          title={t.browser.share}
        >
          <Share2 size={12} />
        </button>
        <div className="w-px h-3 bg-border mx-0.5 shrink-0" />
        {/* 快捷网址 */}
        {[
          { name: 'Google', url: 'https://www.google.com', icon: '🔍' },
          { name: 'ChatGPT', url: 'https://chatgpt.com', icon: '💬' },
          { name: 'Gemini', url: 'https://gemini.google.com', icon: '✨' },
          { name: 'Kimi', url: 'https://kimi.moonshot.cn', icon: '🌙' },
          { name: 'DeepSeek', url: 'https://chat.deepseek.com', icon: '🔍' },
          { name: 'arXiv', url: 'https://arxiv.org', icon: '📄' },
          { name: 'Cool Paper', url: 'https://papers.cool/', icon: '📚' },
          { name: 'YouTube', url: 'https://www.youtube.com', icon: '▶️' },
          { name: 'BiliBili', url: 'https://www.bilibili.com', icon: '📺' },
          { name: 'LeetCode', url: 'https://leetcode.com', icon: '💻' },
          { name: 'Wikipedia', url: 'https://www.wikipedia.org', icon: '📖' },
          { name: 'MDN', url: 'https://developer.mozilla.org', icon: '🔧' },
        ].map(site => (
          <button
            key={site.url}
            onClick={() => {
              const { openWebpageTab } = useFileStore.getState();
              openWebpageTab(site.url, site.name);
            }}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-accent text-[11px] text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            title={site.url}
          >
            <span>{site.icon}</span>
            <span>{site.name}</span>
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground shrink-0">
          {isLoading ? t.common.loading : ''}
        </span>
        {/* 切换右侧侧边栏按钮 */}
        <button
          onClick={() => useUIStore.getState().toggleRightSidebar()}
          className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0"
          title={t.browser.toggleRightPanel}
        >
          <PanelRightOpen size={14} />
        </button>
      </div>
      
      {/* WebView 容器 */}
      <div 
        ref={containerRef}
        className="flex-1 relative bg-white overflow-hidden"
      >
        {/* 错误提示 */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center p-8">
              <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
              <h3 className="text-lg font-medium mb-2">{t.browser.loadError}</h3>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <button
                onClick={() => handleNavigate(currentUrl)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
              >
                {t.browser.retry}
              </button>
            </div>
          </div>
        )}
        
        {/* 空状态（未输入 URL） */}
        {!currentUrl && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-background to-muted/20 z-5">
            <div className="text-center p-8 max-w-md">
              <Globe className="w-20 h-20 mx-auto text-muted-foreground/50 mb-6" />
              <h2 className="text-xl font-medium mb-2">{t.browser.startBrowsing}</h2>
              <p className="text-sm text-muted-foreground mb-6">
                {t.browser.enterUrlOrSearch}
              </p>
              
              {/* 快捷入口 */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { name: 'Google', url: 'https://www.google.com', color: 'bg-blue-500', icon: '🔍' },
                  { name: 'ChatGPT', url: 'https://chatgpt.com', color: 'bg-green-600', icon: '💬' },
                  { name: 'Gemini', url: 'https://gemini.google.com', color: 'bg-blue-600', icon: '✨' },
                  { name: 'Kimi', url: 'https://kimi.moonshot.cn', color: 'bg-purple-600', icon: '🌙' },
                  { name: 'DeepSeek', url: 'https://chat.deepseek.com', color: 'bg-orange-600', icon: '🔍' },
                  { name: 'arXiv', url: 'https://arxiv.org', color: 'bg-red-600', icon: '📄' },
                  { name: 'Cool Paper', url: 'https://papers.cool/', color: 'bg-indigo-600', icon: '📚' },
                  { name: 'YouTube', url: 'https://www.youtube.com', color: 'bg-red-500', icon: '▶️' },
                  { name: 'BiliBili', url: 'https://www.bilibili.com', color: 'bg-pink-500', icon: '📺' },
                  { name: 'LeetCode', url: 'https://leetcode.com', color: 'bg-yellow-600', icon: '💻' },
                  { name: 'Wikipedia', url: 'https://www.wikipedia.org', color: 'bg-orange-500', icon: '📖' },
                  { name: 'MDN', url: 'https://developer.mozilla.org', color: 'bg-black', icon: '🔧' },
                ].map(site => (
                  <button
                    key={site.url}
                    onClick={() => handleNavigate(site.url)}
                    className="p-2 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center text-lg",
                      site.color
                    )}>
                      {site.icon}
                    </div>
                    <span className="text-xs">{site.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* 加载指示器 */}
        {isLoading && currentUrl && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20 z-20">
            <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
          </div>
        )}
        
        {/* 状态指示 */}
        {webviewCreated && !error && currentUrl && (
          <div className="absolute bottom-2 right-2 px-2 py-1 bg-green-500/20 text-green-600 text-xs rounded opacity-0 hover:opacity-100 transition-opacity z-10">
            ✓ {t.browser.loaded}
          </div>
        )}
      </div>
    </div>
  );
}
