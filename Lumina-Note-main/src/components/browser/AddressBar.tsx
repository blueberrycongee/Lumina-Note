/**
 * 浏览器地址栏组件
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  RotateCw, 
  Home,
  Search,
  Globe,
  Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocaleStore } from '@/stores/useLocaleStore';

interface AddressBarProps {
  url: string;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  onHome?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  isLoading?: boolean;
  className?: string;
  searchEngine?: 'bing' | 'google' | 'duckduckgo';
}

// 搜索引擎配置
const SEARCH_ENGINES = {
  bing: 'https://www.bing.com/search?q=',
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
};

export function AddressBar({
  url,
  onNavigate,
  onBack,
  onForward,
  onRefresh,
  onHome,
  canGoBack = true,
  canGoForward = true,
  isLoading = false,
  className,
  searchEngine = 'bing',
}: AddressBarProps) {
  const { t } = useLocaleStore();
  const [inputValue, setInputValue] = useState(url);
  const [isFocused, setIsFocused] = useState(false);
  const [originalUrl, setOriginalUrl] = useState(url);
  const inputRef = useRef<HTMLInputElement>(null);

  // 当外部 URL 变化时更新输入框
  useEffect(() => {
    if (!isFocused) {
      setInputValue(url);
      setOriginalUrl(url);
    }
  }, [url, isFocused]);

  // 分类输入内容
  const classifyInput = useCallback((input: string): { type: 'url' | 'search'; url: string } => {
    const trimmed = input.trim();
    
    if (!trimmed) {
      return { type: 'url', url: '' };
    }
    
    // 已有协议的 URL
    if (trimmed.match(/^https?:\/\//i)) {
      return { type: 'url', url: trimmed };
    }
    
    // 检查是否是搜索查询
    // 包含空格 = 搜索查询
    if (trimmed.includes(' ')) {
      const searchUrl = SEARCH_ENGINES[searchEngine] + encodeURIComponent(trimmed);
      return { type: 'search', url: searchUrl };
    }
    
    // 不包含点号 = 搜索查询
    if (!trimmed.includes('.')) {
      const searchUrl = SEARCH_ENGINES[searchEngine] + encodeURIComponent(trimmed);
      return { type: 'search', url: searchUrl };
    }
    
    // 包含点号但无协议 = 域名，添加 https://
    return { type: 'url', url: `https://${trimmed}` };
  }, [searchEngine]);

  // 处理导航
  const handleNavigate = useCallback(() => {
    const classified = classifyInput(inputValue);
    
    if (!classified.url) return;
    
    setInputValue(classified.url);
    setOriginalUrl(classified.url);
    onNavigate(classified.url);
    inputRef.current?.blur();
  }, [inputValue, classifyInput, onNavigate]);

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNavigate();
    } else if (e.key === 'Escape') {
      // 恢复原始 URL
      setInputValue(originalUrl);
      inputRef.current?.blur();
    }
  }, [handleNavigate, originalUrl]);

  // 获取 URL 显示信息
  const getUrlInfo = useCallback(() => {
    try {
      const urlObj = new URL(url);
      const isSecure = urlObj.protocol === 'https:';
      return {
        isSecure,
        hostname: urlObj.hostname,
        displayUrl: url,
      };
    } catch {
      return {
        isSecure: false,
        hostname: '',
        displayUrl: url,
      };
    }
  }, [url]);

  const urlInfo = getUrlInfo();

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 bg-muted/50 border-b border-border",
      className
    )}>
      {/* 导航按钮 */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={onBack}
          disabled={!canGoBack}
          className={cn(
            "p-1 rounded-md transition-colors",
            canGoBack 
              ? "hover:bg-accent text-foreground" 
              : "text-muted-foreground cursor-not-allowed"
          )}
          title={t.browser.back}
        >
          <ArrowLeft size={14} />
        </button>
        
        <button
          onClick={onForward}
          disabled={!canGoForward}
          className={cn(
            "p-1 rounded-md transition-colors",
            canGoForward 
              ? "hover:bg-accent text-foreground" 
              : "text-muted-foreground cursor-not-allowed"
          )}
          title={t.browser.forward}
        >
          <ArrowRight size={14} />
        </button>
        
        <button
          onClick={onRefresh}
          className={cn(
            "p-1 rounded-md hover:bg-accent transition-colors",
            isLoading && "animate-spin"
          )}
          title={t.browser.refresh}
        >
          <RotateCw size={14} />
        </button>
        
        {onHome && (
          <button
            onClick={onHome}
            className="p-1 rounded-md hover:bg-accent transition-colors"
            title={t.browser.home}
          >
            <Home size={14} />
          </button>
        )}
      </div>
      
      {/* 地址栏输入框 */}
      <div className={cn(
        "flex-1 flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors",
        isFocused 
          ? "bg-background border-primary ring-1 ring-primary" 
          : "bg-background/60 border-border hover:bg-background"
      )}>
        {/* 安全指示器 */}
        {url && (
          urlInfo.isSecure ? (
            <Lock size={12} className="text-green-500 shrink-0" />
          ) : (
            <Globe size={12} className="text-muted-foreground shrink-0" />
          )
        )}
        
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            // 选中全部文本
            setTimeout(() => inputRef.current?.select(), 0);
          }}
          onBlur={() => setIsFocused(false)}
          placeholder={t.browser.addressPlaceholder}
          className="flex-1 bg-transparent outline-none text-xs"
        />
        
        {/* 搜索按钮 */}
        <button
          onClick={handleNavigate}
          className="p-0.5 rounded hover:bg-accent transition-colors"
          title={t.browser.go}
        >
          <Search size={12} className="text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
