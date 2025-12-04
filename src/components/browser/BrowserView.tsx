/**
 * 浏览器视图组件
 * 内嵌 WebView 实现网页浏览
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Globe, Bookmark, Share2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { AddressBar } from './AddressBar';
import { useFileStore } from '@/stores/useFileStore';
import { cn } from '@/lib/utils';

interface BrowserViewProps {
  tabId: string;
  initialUrl?: string;
  isActive?: boolean;
  onTitleChange?: (title: string) => void;
}

// 默认首页
const DEFAULT_HOME_URL = 'https://www.bing.com';

export function BrowserView({
  tabId,
  initialUrl = '',
  isActive = true,
  onTitleChange,
}: BrowserViewProps) {
  const { updateWebpageTab } = useFileStore();
  
  // 状态
  const [currentUrl, setCurrentUrl] = useState(initialUrl || '');
  const [isLoading, setIsLoading] = useState(false);
  const [webviewCreated, setWebviewCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 导航历史（本地维护，用于前进后退按钮状态）
  const [navHistory, setNavHistory] = useState<string[]>(initialUrl ? [initialUrl] : []);
  const [navIndex, setNavIndex] = useState(initialUrl ? 0 : -1);
  
  // 容器引用
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 创建 WebView
  const createWebview = useCallback(async (url: string) => {
    if (!containerRef.current || !url) return;
    
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    try {
      setIsLoading(true);
      setError(null);
      
      await invoke('create_browser_webview', {
        tabId,
        url,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
      
      setWebviewCreated(true);
      setCurrentUrl(url);
      console.log('[Browser] WebView 创建成功:', tabId, url);
      
      // 更新标签页信息
      try {
        const urlObj = new URL(url);
        const title = urlObj.hostname;
        updateWebpageTab(tabId, url, title);
        onTitleChange?.(title);
      } catch {
        // URL 解析失败
      }
    } catch (err) {
      console.error('[Browser] WebView 创建失败:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [tabId, updateWebpageTab, onTitleChange]);
  
  // 更新 WebView 位置大小
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
      console.error('[Browser] 更新 WebView 位置失败:', err);
    }
  }, [tabId, webviewCreated]);
  
  // 导航到新 URL
  const handleNavigate = useCallback(async (url: string) => {
    if (!url) return;
    
    setCurrentUrl(url);
    setIsLoading(true);
    
    // 更新导航历史
    setNavHistory(prev => {
      const newHistory = prev.slice(0, navIndex + 1);
      newHistory.push(url);
      return newHistory;
    });
    setNavIndex(prev => prev + 1);
    
    try {
      if (webviewCreated) {
        // WebView 已存在，直接导航
        await invoke('navigate_browser_webview', { tabId, url });
      } else {
        // 创建新 WebView
        await createWebview(url);
      }
      
      // 更新标签页信息
      try {
        const urlObj = new URL(url);
        const title = urlObj.hostname;
        updateWebpageTab(tabId, url, title);
        onTitleChange?.(title);
      } catch {
        // URL 解析失败
      }
    } catch (err) {
      console.error('[Browser] 导航失败:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [tabId, webviewCreated, navIndex, createWebview, updateWebpageTab, onTitleChange]);
  
  // 后退
  const handleBack = useCallback(async () => {
    if (navIndex <= 0) return;
    
    try {
      await invoke('browser_webview_go_back', { tabId });
      setNavIndex(prev => prev - 1);
      setCurrentUrl(navHistory[navIndex - 1]);
    } catch (err) {
      console.error('[Browser] 后退失败:', err);
    }
  }, [tabId, navIndex, navHistory]);
  
  // 前进
  const handleForward = useCallback(async () => {
    if (navIndex >= navHistory.length - 1) return;
    
    try {
      await invoke('browser_webview_go_forward', { tabId });
      setNavIndex(prev => prev + 1);
      setCurrentUrl(navHistory[navIndex + 1]);
    } catch (err) {
      console.error('[Browser] 前进失败:', err);
    }
  }, [tabId, navIndex, navHistory]);
  
  // 刷新
  const handleRefresh = useCallback(async () => {
    try {
      setIsLoading(true);
      await invoke('browser_webview_reload', { tabId });
    } catch (err) {
      console.error('[Browser] 刷新失败:', err);
    } finally {
      setTimeout(() => setIsLoading(false), 500);
    }
  }, [tabId]);
  
  // 主页
  const handleHome = useCallback(() => {
    handleNavigate(DEFAULT_HOME_URL);
  }, [handleNavigate]);
  
  // 初始化：如果有初始 URL，创建 WebView
  useEffect(() => {
    if (initialUrl && !webviewCreated && isActive) {
      createWebview(initialUrl);
    }
  }, [initialUrl, webviewCreated, isActive, createWebview]);
  
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
  
  // 根据 isActive 控制 WebView 可见性
  useEffect(() => {
    if (!webviewCreated) return;
    
    if (isActive) {
      // 激活时更新位置
      updateWebviewBounds();
      invoke('set_browser_webview_visible', { tabId, visible: true }).catch(() => {});
    } else {
      // 非激活时隐藏
      invoke('set_browser_webview_visible', { tabId, visible: false }).catch(() => {});
    }
  }, [isActive, webviewCreated, tabId, updateWebviewBounds]);
  
  // 组件卸载时关闭 WebView
  useEffect(() => {
    return () => {
      invoke('close_browser_webview', { tabId }).catch(() => {});
    };
  }, [tabId]);

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
        canGoBack={navIndex > 0}
        canGoForward={navIndex < navHistory.length - 1}
        isLoading={isLoading}
      />
      
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title="添加书签"
        >
          <Bookmark size={14} />
        </button>
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title="分享"
        >
          <Share2 size={14} />
        </button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {isLoading ? '加载中...' : ''}
        </span>
      </div>
      
      {/* WebView 容器 */}
      <div 
        ref={containerRef}
        className="flex-1 relative bg-white"
      >
        {/* 错误提示 */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <div className="text-center p-8">
              <Globe className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">无法加载页面</h3>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <button
                onClick={() => handleNavigate(currentUrl)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
              >
                重试
              </button>
            </div>
          </div>
        )}
        
        {/* 空状态（未输入 URL） */}
        {!currentUrl && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-8 max-w-md">
              <Globe className="w-20 h-20 mx-auto text-muted-foreground/50 mb-6" />
              <h2 className="text-xl font-medium mb-2">开始浏览</h2>
              <p className="text-sm text-muted-foreground mb-6">
                在地址栏输入网址或搜索关键词
              </p>
              
              {/* 快捷入口 */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: '必应', url: 'https://www.bing.com', color: 'bg-blue-500' },
                  { name: 'Google', url: 'https://www.google.com', color: 'bg-red-500' },
                  { name: 'GitHub', url: 'https://github.com', color: 'bg-gray-800' },
                ].map(site => (
                  <button
                    key={site.url}
                    onClick={() => handleNavigate(site.url)}
                    className="p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white",
                      site.color
                    )}>
                      <Globe size={20} />
                    </div>
                    <span className="text-sm">{site.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* 加载指示器 */}
        {isLoading && currentUrl && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20">
            <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
          </div>
        )}
        
        {/* WebView 加载成功指示 */}
        {webviewCreated && !error && (
          <div className="absolute bottom-2 right-2 px-2 py-1 bg-green-500/20 text-green-600 text-xs rounded opacity-0 hover:opacity-100 transition-opacity">
            ✓ WebView 已加载
          </div>
        )}
      </div>
    </div>
  );
}
