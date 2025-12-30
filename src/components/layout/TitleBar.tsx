/**
 * è‡ªå®šä¹‰æ ‡é¢˜æ 
 * æ›¿ä»£ç³»ç»Ÿæ ‡é¢˜æ ï¼Œæ”¯æŒä¸»é¢˜é¢œè‰²
 * Mac ä¸Šä½¿ç”¨åŽŸç”Ÿé€æ˜Žæ ‡é¢˜æ ï¼Œåªæ˜¾ç¤ºæ‹–æ‹½åŒºåŸ?
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Copy } from "lucide-react";
import { useState, useEffect } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function TitleBar() {
  const { t } = useLocaleStore();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // æ£€æµ‹å¹³å?
    const checkPlatform = async () => {
      try {
        const os = platform();
        setIsMac(os === "macos");
      } catch (e) {
        console.warn("Failed to detect platform:", e);
      }
    };
    checkPlatform();

    // ç›‘å¬çª—å£æœ€å¤§åŒ–çŠ¶æ€?
    const checkMaximized = async () => {
      try {
        const maximized = await getCurrentWindow().isMaximized();
        setIsMaximized(maximized);
      } catch (e) {
        console.warn("Failed to check maximized state:", e);
      }
    };
    checkMaximized();

    // ç›‘å¬çª—å£çŠ¶æ€å˜åŒ?
    let unlistenFn: (() => void) | null = null;
    getCurrentWindow().onResized(() => {
      checkMaximized();
    }).then((fn) => {
      unlistenFn = fn;
    });

    return () => {
      unlistenFn?.();
    };
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (e.detail >= 2) return;
    getCurrentWindow().startDragging();
  };

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error("Failed to minimize:", e);
    }
  };

  const handleMaximize = async () => {
    try {
      await getCurrentWindow().toggleMaximize();
    } catch (e) {
      console.error("Failed to toggle maximize:", e);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    // Only respond to left-button double click on draggable area
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-tauri-drag-region="false"]')) return;
    handleMaximize();
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (e) {
      console.error("Failed to close:", e);
    }
  };

  // Mac ä¸Šä½¿ç”¨åŽŸç”Ÿæ ‡é¢˜æ ï¼Œåªéœ€è¦ä¸€ä¸ªé€æ˜Žçš„æ‹–æ‹½åŒºåŸ?
  if (isMac) {
    return (
      <div
        className="h-8 flex items-center bg-transparent select-none"
        data-tauri-drag-region
      >
        {/* Mac ä¸Šå·¦ä¾§ç•™ç©ºç»™åŽŸç”Ÿçº¢ç»¿ç¯æŒ‰é’?*/}
        <div className="w-20" />
        {/* ä¸­é—´ï¼šåº”ç”¨æ ‡é¢?*/}
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-muted-foreground font-medium pointer-events-none">
            Lumina Note
          </span>
        </div>
        <div
          className="w-20 flex items-center justify-end pr-2"
          data-tauri-drag-region="false"
        >
          <LanguageSwitcher
            compact
            menuAlign="right"
            buttonClassName="bg-muted/70 hover:bg-accent"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-8 flex items-center justify-between bg-muted border-b border-border select-none"
      onMouseDown={handleDragStart}
      onDoubleClick={handleDoubleClick}
      data-tauri-drag-region
    >
      {/* å·¦ä¾§ï¼šåº”ç”¨å›¾æ ‡å’Œæ ‡é¢˜ */}
      <div className="flex items-center gap-2 px-3">
        <img src="/lumina.svg" alt="Logo" className="w-4 h-4 pointer-events-none" />
        <span className="text-xs text-muted-foreground font-medium pointer-events-none">
          Lumina Note
        </span>
      </div>

      {/* ä¸­é—´ï¼šæ‹–æ‹½åŒºåŸ?*/}
      <div className="flex-1 h-full" />

      {/* å³ä¾§ï¼šè¯­è¨€åˆ‡æ¢ + çª—å£æŽ§åˆ¶æŒ‰é’?*/}
      <div
        className="flex items-center h-full gap-2 pr-1"
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        data-tauri-drag-region="false"
      >
        <LanguageSwitcher
          compact
          menuAlign="right"
          stopPropagation
          buttonClassName="h-7 bg-muted/70 hover:bg-accent"
        />
        <div className="flex items-center h-full">
          {/* æœ€å°åŒ– */}
          <button
            onClick={handleMinimize}
            className="h-full px-4 hover:bg-accent transition-colors flex items-center justify-center"
            title={t.titleBar.minimize}
          >
            <Minus size={14} className="text-muted-foreground" />
          </button>

          {/* æœ€å¤§åŒ–/è¿˜åŽŸ */}
          <button
            onClick={handleMaximize}
            className="h-full px-4 hover:bg-accent transition-colors flex items-center justify-center"
            title={isMaximized ? t.titleBar.restore : t.titleBar.maximize}
          >
            {isMaximized ? (
              <Copy size={12} className="text-muted-foreground" />
            ) : (
              <Square size={12} className="text-muted-foreground" />
            )}
          </button>

          {/* å…³é—­ */}
          <button
            onClick={handleClose}
            className="h-full px-4 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center"
            title={t.titleBar.close}
          >
            <X size={14} className="text-muted-foreground hover:text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
