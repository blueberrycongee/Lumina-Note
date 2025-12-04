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
}

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
}: AddressBarProps) {
  const [inputValue, setInputValue] = useState(url);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 当外部 URL 变化时更新输入框
  useEffect(() => {
    if (!isFocused) {
      setInputValue(url);
    }
  }, [url, isFocused]);

  // 处理导航
  const handleNavigate = useCallback(() => {
    let navigateUrl = inputValue.trim();
    
    if (!navigateUrl) return;
    
    // 如果不是完整 URL，添加协议
    if (!navigateUrl.match(/^https?:\/\//i)) {
      // 检查是否是搜索查询（包含空格或不像域名）
      if (navigateUrl.includes(' ') || !navigateUrl.includes('.')) {
        // 使用搜索引擎
        navigateUrl = `https://www.bing.com/search?q=${encodeURIComponent(navigateUrl)}`;
      } else {
        navigateUrl = `https://${navigateUrl}`;
      }
    }
    
    setInputValue(navigateUrl);
    onNavigate(navigateUrl);
    inputRef.current?.blur();
  }, [inputValue, onNavigate]);

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNavigate();
    } else if (e.key === 'Escape') {
      setInputValue(url);
      inputRef.current?.blur();
    }
  }, [handleNavigate, url]);

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
      "flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border",
      className
    )}>
      {/* 导航按钮 */}
      <div className="flex items-center gap-1">
        <button
          onClick={onBack}
          disabled={!canGoBack}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            canGoBack 
              ? "hover:bg-accent text-foreground" 
              : "text-muted-foreground cursor-not-allowed"
          )}
          title="后退"
        >
          <ArrowLeft size={16} />
        </button>
        
        <button
          onClick={onForward}
          disabled={!canGoForward}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            canGoForward 
              ? "hover:bg-accent text-foreground" 
              : "text-muted-foreground cursor-not-allowed"
          )}
          title="前进"
        >
          <ArrowRight size={16} />
        </button>
        
        <button
          onClick={onRefresh}
          className={cn(
            "p-1.5 rounded-md hover:bg-accent transition-colors",
            isLoading && "animate-spin"
          )}
          title="刷新"
        >
          <RotateCw size={16} />
        </button>
        
        {onHome && (
          <button
            onClick={onHome}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            title="主页"
          >
            <Home size={16} />
          </button>
        )}
      </div>
      
      {/* 地址栏输入框 */}
      <div className={cn(
        "flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors",
        isFocused 
          ? "bg-background border-primary ring-1 ring-primary" 
          : "bg-background/60 border-border hover:bg-background"
      )}>
        {/* 安全指示器 */}
        {url && (
          urlInfo.isSecure ? (
            <Lock size={14} className="text-green-500 shrink-0" />
          ) : (
            <Globe size={14} className="text-muted-foreground shrink-0" />
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
          placeholder="搜索或输入网址"
          className="flex-1 bg-transparent outline-none text-sm"
        />
        
        {/* 搜索按钮 */}
        <button
          onClick={handleNavigate}
          className="p-1 rounded hover:bg-accent transition-colors"
          title="前往"
        >
          <Search size={14} className="text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
