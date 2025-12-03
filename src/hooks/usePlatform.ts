import { useState, useEffect } from 'react';

export type Platform = 'desktop' | 'mobile';

/**
 * 检测平台
 * - URL 参数 ?mobile=1 强制移动模式（调试用）
 * - userAgent 检测移动设备
 * - 屏幕宽度 < 768 视为移动端
 */
function detectPlatform(): Platform {
  // URL 参数强制移动模式（调试用）
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mobile') === '1') return 'mobile';
    if (urlParams.get('desktop') === '1') return 'desktop';
  }
  
  // userAgent 检测
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
  if (isMobileUA) return 'mobile';
  
  // 屏幕宽度检测
  const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;
  return isSmallScreen ? 'mobile' : 'desktop';
}

export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(detectPlatform);
  
  useEffect(() => {
    // 监听窗口大小变化
    const handleResize = () => {
      setPlatform(detectPlatform());
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return platform;
}

/**
 * 检测是否为移动端
 */
export function useIsMobile(): boolean {
  return usePlatform() === 'mobile';
}
