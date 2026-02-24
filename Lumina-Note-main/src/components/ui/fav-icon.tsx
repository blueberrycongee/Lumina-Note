/**
 * FavIcon - 网站图标组件
 * 
 * 自动获取网站 favicon
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Globe } from "lucide-react";

interface FavIconProps {
  className?: string;
  url: string;
  title?: string;
  size?: number;
}

export function FavIcon({ className, url, title, size = 16 }: FavIconProps) {
  const [hasError, setHasError] = useState(false);

  // 获取 favicon URL
  const getFaviconUrl = (pageUrl: string) => {
    try {
      const origin = new URL(pageUrl).origin;
      // 使用 Google 的 favicon 服务作为备选
      return `https://www.google.com/s2/favicons?domain=${origin}&sz=32`;
    } catch {
      return null;
    }
  };

  const faviconUrl = getFaviconUrl(url);

  if (!faviconUrl || hasError) {
    return (
      <Globe 
        className={cn("text-muted-foreground", className)} 
        size={size}
      />
    );
  }

  return (
    <img
      className={cn("rounded-sm bg-accent", className)}
      width={size}
      height={size}
      src={faviconUrl}
      alt={title || "favicon"}
      onError={() => setHasError(true)}
    />
  );
}
