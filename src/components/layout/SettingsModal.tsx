/**
 * 设置面板
 * 720px 宽模态框，左侧导航 + 右侧内容
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { Settings, Bot, RefreshCw, Globe, Info, X } from "lucide-react";
import { GeneralSection } from "../settings/GeneralSection";
import { SystemSection } from "../settings/SystemSection";
import { AISettingsContent } from "../ai/AISettingsModal";
import { WebDAVSettings } from "../settings/WebDAVSettings";
import { MobileGatewaySection } from "../settings/MobileGatewaySection";
import { MobileOptionsSection } from "../settings/MobileOptionsSection";
import { ProxySection } from "../settings/ProxySection";

type TabId = "general" | "ai" | "sync" | "network" | "system";

const TAB_ICONS: Record<TabId, typeof Settings> = {
  general: Settings,
  ai: Bot,
  sync: RefreshCw,
  network: Globe,
  system: Info,
};

const TAB_ORDER: TabId[] = ["general", "ai", "sync", "network", "system"];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUpdateModal: () => void;
}

export function SettingsModal({ isOpen, onClose, onOpenUpdateModal }: SettingsModalProps) {
  const { t } = useLocaleStore();
  const [activeTab, setActiveTab] = useState<TabId>("general");

  if (!isOpen) return null;

  const tabs = t.settingsModal.tabs as Record<TabId, string>;

  const renderContent = () => {
    switch (activeTab) {
      case "general":
        return <GeneralSection isOpen={isOpen} />;
      case "ai":
        return <AISettingsContent />;
      case "sync":
        return (
          <>
            <WebDAVSettings compact />
            <MobileGatewaySection />
            <MobileOptionsSection />
          </>
        );
      case "network":
        return (
          <>
            <ProxySection />
          </>
        );
      case "system":
        return <SystemSection onOpenUpdateModal={onOpenUpdateModal} />;
    }
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/30 animate-spotlight-overlay"
        onClick={onClose}
      />

      {/* 设置面板 */}
      <div className="relative w-[720px] h-[80vh] rounded-xl shadow-elev-3 overflow-hidden border border-border bg-popover animate-spotlight-in flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-muted/50">
          <h2 className="text-lg font-semibold text-foreground/90">{t.settingsModal.title}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-colors hover:bg-muted"
            title={t.common.close}
          >
            <X size={18} className="text-foreground/70" />
          </button>
        </div>

        {/* 主体：左导航 + 右内容 */}
        <div className="flex flex-1 min-h-0">
          {/* 左侧导航 */}
          <nav className="w-[160px] shrink-0 border-r border-border/60 bg-muted/30 p-2 space-y-1">
            {TAB_ORDER.map((tabId) => {
              const Icon = TAB_ICONS[tabId];
              const isActive = activeTab === tabId;
              return (
                <button
                  key={tabId}
                  onClick={() => setActiveTab(tabId)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground/70 hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon size={16} />
                  <span>{tabs[tabId]}</span>
                </button>
              );
            })}
          </nav>

          {/* 右侧内容 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
