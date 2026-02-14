/**
 * 自定义标题栏
 * 替代系统标题栏，支持主题颜色
 * Mac 上使用原生透明标题栏，只显示拖拽区域
 */

import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { Minus, Square, X, Copy } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { useLocaleStore } from "@/stores/useLocaleStore";

const isMacByNavigator = (): boolean =>
  typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

export function TitleBar() {
  const { t } = useLocaleStore();
  const tauriRuntime = isTauri();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMac, setIsMac] = useState(() => (tauriRuntime ? false : isMacByNavigator()));

  const getWindowSafe = useCallback((): Window | null => {
    if (!tauriRuntime) return null;
    try {
      return getCurrentWindow();
    } catch (e) {
      console.warn("Failed to access current window:", e);
      return null;
    }
  }, [tauriRuntime]);

  useEffect(() => {
    let disposed = false;
    let unlistenFn: (() => void) | null = null;

    const checkPlatform = () => {
      if (!tauriRuntime) {
        setIsMac(isMacByNavigator());
        return;
      }
      try {
        const os = platform();
        if (!disposed) {
          setIsMac(os === "macos");
        }
      } catch (e) {
        console.warn("Failed to detect platform:", e);
        if (!disposed) {
          setIsMac(isMacByNavigator());
        }
      }
    };

    const checkMaximized = async (appWindow: Window | null) => {
      if (!appWindow) return;
      try {
        const maximized = await appWindow.isMaximized();
        if (!disposed) {
          setIsMaximized(maximized);
        }
      } catch (e) {
        console.warn("Failed to check maximized state:", e);
      }
    };

    const setup = async () => {
      checkPlatform();
      const appWindow = getWindowSafe();
      await checkMaximized(appWindow);

      if (!appWindow) {
        return;
      }
      try {
        unlistenFn = await appWindow.onResized(() => {
          void checkMaximized(appWindow);
        });
      } catch (e) {
        console.warn("Failed to listen window resize:", e);
      }
    };
    void setup();

    return () => {
      disposed = true;
      unlistenFn?.();
    };
  }, [getWindowSafe, tauriRuntime]);

  const withWindow = useCallback(
    async (action: (appWindow: Window) => Promise<void>, errorMessage: string) => {
      const appWindow = getWindowSafe();
      if (!appWindow) return;
      try {
        await action(appWindow);
      } catch (e) {
        console.error(errorMessage, e);
      }
    },
    [getWindowSafe],
  );

  const handleDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (e.detail >= 2) return;
    const appWindow = getWindowSafe();
    if (!appWindow) return;
    appWindow.startDragging().catch((err) => {
      console.warn("Failed to start dragging:", err);
    });
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-tauri-drag-region="false"]')) return;
    handleMaximize();
  };

  const handleMinimize = async () => {
    await withWindow((appWindow) => appWindow.minimize(), "Failed to minimize:");
  };

  const handleMaximize = async () => {
    await withWindow((appWindow) => appWindow.toggleMaximize(), "Failed to toggle maximize:");
  };

  const handleClose = async () => {
    await withWindow((appWindow) => appWindow.close(), "Failed to close:");
  };

  // Mac 上使用原生标题栏，只需要一个透明的拖拽区域
  if (isMac) {
    return (
      <div
        className="h-8 flex items-center bg-transparent select-none"
        data-tauri-drag-region
      >
        {/* Mac 上左侧留空给原生红绿灯按钮 */}
        <div className="w-20" />
        {/* 中间：应用标题 */}
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[11px] text-muted-foreground font-medium tracking-[0.2em] uppercase pointer-events-none">
            Lumina Note
          </span>
        </div>
        <div className="w-20" />
      </div>
    );
  }

  // Windows/Linux 使用自定义标题栏
  return (
    <div
      className="h-8 flex items-center justify-between bg-background/60 backdrop-blur-md border-b border-border/60 shadow-[0_1px_0_hsl(var(--border)/0.5)] select-none"
      onMouseDown={handleDragStart}
      onDoubleClick={handleDoubleClick}
      data-tauri-drag-region
    >
      {/* 左侧：应用图标和标题 */}
      <div className="flex items-center gap-2 px-3">
        <img src="/lumina.svg" alt="Logo" className="w-4 h-4 pointer-events-none" />
        <span className="text-[11px] text-muted-foreground font-medium tracking-[0.2em] uppercase pointer-events-none">
          Lumina Note
        </span>
      </div>

      {/* 中间：拖拽区域 */}
      <div className="flex-1 h-full" />

      {/* 右侧：窗口控制按钮 */}
      <div
        className="flex items-center h-full gap-2 pr-1"
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        data-tauri-drag-region="false"
      >
        <div className="flex items-center h-full">
          {/* 最小化 */}
          <button
            onClick={handleMinimize}
            className="h-full px-4 hover:bg-accent/60 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_hsl(var(--primary)/0.45),0_0_0_4px_hsl(var(--primary)/0.18)]"
            title={t.titleBar.minimize}
          >
            <Minus size={14} className="text-muted-foreground" />
          </button>

          {/* 最大化/还原 */}
          <button
            onClick={handleMaximize}
            className="h-full px-4 hover:bg-accent/60 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_hsl(var(--primary)/0.45),0_0_0_4px_hsl(var(--primary)/0.18)]"
            title={isMaximized ? t.titleBar.restore : t.titleBar.maximize}
          >
            {isMaximized ? (
              <Copy size={12} className="text-muted-foreground" />
            ) : (
              <Square size={12} className="text-muted-foreground" />
            )}
          </button>

          {/* 关闭 */}
          <button
            onClick={handleClose}
            className="h-full px-4 hover:bg-red-500/20 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_hsl(var(--primary)/0.45),0_0_0_4px_hsl(var(--primary)/0.18)]"
            title={t.titleBar.close}
          >
            <X size={14} className="text-muted-foreground hover:text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
