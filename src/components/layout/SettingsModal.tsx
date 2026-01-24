/**
 * 设置面板
 * 在屏幕中央显示的模态框
 * 带有 iOS 18 风格液态玻璃 + 雨滴效果
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getVersion } from "@tauri-apps/api/app";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { useBrowserStore } from "@/stores/useBrowserStore";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { OFFICIAL_THEMES, Theme } from "@/config/themes";
import { loadUserThemes, getUserThemes, deleteUserTheme } from "@/config/themePlugin";
import { X, Check, Plus, Trash2, Palette } from "lucide-react";
import { LiquidGlassEffect } from "../effects/LiquidGlassEffect";
import { ThemeEditor } from "../ai/ThemeEditor";
import { WebDAVSettings } from "../settings/WebDAVSettings";
import { UpdateChecker } from "../settings/UpdateChecker";
import { LanguageSwitcher } from "./LanguageSwitcher";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t } = useLocaleStore();
  const { themeId, setThemeId, editorMode, setEditorMode } = useUIStore();
  const { config } = useAIStore();
  const { hideAllWebViews, showAllWebViews } = useBrowserStore();
  const { vaultPath } = useFileStore();

  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | undefined>();
  const [userThemes, setUserThemes] = useState<Theme[]>([]);
  const [appVersion, setAppVersion] = useState<string>("");

  // 弹窗打开时隐藏 WebView，关闭时恢复
  useEffect(() => {
    if (isOpen) {
      hideAllWebViews();
    } else {
      showAllWebViews();
    }
  }, [isOpen, hideAllWebViews, showAllWebViews]);

  // 加载用户主题
  useEffect(() => {
    if (isOpen && vaultPath) {
      loadUserThemes(vaultPath).then(themes => {
        setUserThemes(themes);
      });
    }
  }, [isOpen, vaultPath]);

  // 加载应用版本号
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion("dev"));
  }, []);

  // 删除用户主题
  const handleDeleteTheme = async (theme: Theme) => {
    if (!vaultPath) return;
    if (confirm(t.settingsModal.confirmDeleteTheme.replace('{name}', theme.name))) {
      await deleteUserTheme(vaultPath, theme.id);
      setUserThemes(getUserThemes());
      // 如果删除的是当前主题，切换到默认
      if (themeId === theme.id) {
        setThemeId('default');
      }
    }
  };

  // 编辑主题
  const handleEditTheme = (theme: Theme) => {
    setEditingTheme(theme);
    setShowThemeEditor(true);
  };

  // 新建主题
  const handleNewTheme = () => {
    setEditingTheme(undefined);
    setShowThemeEditor(true);
  };

  // 主题保存后刷新列表
  const handleThemeSaved = () => {
    setUserThemes(getUserThemes());
  };

  if (!isOpen) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 - 液态玻璃效果 */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-xl"
        onClick={onClose}
        style={{
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        {/* 雨滴效果层 */}
        <LiquidGlassEffect />
      </div>

      {/* 设置面板 - 液态玻璃风格 */}
      <div
        className="relative w-[600px] max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden border border-white/20"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)",
          backdropFilter: "blur(40px) saturate(150%)",
          WebkitBackdropFilter: "blur(40px) saturate(150%)",
          boxShadow: `
            0 8px 32px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            inset 0 -1px 0 rgba(0, 0, 0, 0.1)
          `,
        }}
      >
        {/* 顶部高光 */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
          }}
        />
        {/* 标题栏 - 液态玻璃风格 */}
        <div
          className="relative flex items-center justify-between px-6 py-4"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)",
          }}
        >
          <h2 className="text-lg font-semibold text-foreground/90">{t.settingsModal.title}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-all hover:scale-110"
            style={{
              background: "rgba(255,255,255,0.1)",
              backdropFilter: "blur(10px)",
            }}
          >
            <X size={18} className="text-foreground/70" />
          </button>
        </div>

        {/* 设置内容 - 带内容区域液态效果 */}
        <div
          className="p-6 space-y-8 overflow-y-auto max-h-[calc(80vh-60px)]"
          style={{
            background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.05) 100%)",
          }}
        >
          {/* 主题设置 */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {t.settingsModal.theme}
              </h3>
              <button
                onClick={handleNewTheme}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all hover:scale-105"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                <Plus size={14} />
                {t.settingsModal.createTheme}
              </button>
            </div>
            <p className="text-sm text-muted-foreground">{t.settingsModal.themeDescription}</p>

            {/* 用户主题 */}
            {userThemes.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground mt-4">{t.settingsModal.myThemes}</p>
                <div className="grid grid-cols-3 gap-3">
                  {userThemes.map((theme) => (
                    <div
                      key={theme.id}
                      className={`relative p-3 rounded-xl transition-all text-left group ${themeId === theme.id
                        ? "ring-2 ring-primary"
                        : "hover:scale-[1.02]"
                        }`}
                      style={{
                        background: themeId === theme.id
                          ? "rgba(var(--primary-rgb), 0.15)"
                          : "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        backdropFilter: "blur(10px)",
                        boxShadow: themeId === theme.id
                          ? "0 4px 20px rgba(var(--primary-rgb), 0.2)"
                          : "0 2px 10px rgba(0,0,0,0.1)",
                      }}
                    >
                      <button
                        onClick={() => setThemeId(theme.id)}
                        className="w-full text-left"
                      >
                        {/* 颜色预览 */}
                        <div className="flex gap-1 mb-2">
                          <div
                            className="w-4 h-4 rounded-full border border-border"
                            style={{ backgroundColor: `hsl(${theme.light.primary})` }}
                          />
                          <div
                            className="w-4 h-4 rounded-full border border-border"
                            style={{ backgroundColor: `hsl(${theme.dark.primary})` }}
                          />
                        </div>

                        {/* 主题名称 */}
                        <p className="font-medium text-sm">{theme.name}</p>
                        <p className="text-xs text-muted-foreground">{theme.description}</p>
                      </button>

                      {/* 操作按钮 */}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEditTheme(theme)}
                          className="p-1 rounded hover:bg-white/20"
                          title={t.common.edit}
                        >
                          <Palette size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteTheme(theme)}
                          className="p-1 rounded hover:bg-red-500/20 text-red-400"
                          title={t.common.delete}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* 选中标记 */}
                      {themeId === theme.id && (
                        <div className="absolute bottom-2 right-2">
                          <Check size={16} className="text-primary" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 官方主题 */}
            <p className="text-xs text-muted-foreground mt-4">{t.settingsModal.officialThemes}</p>
            <div className="grid grid-cols-3 gap-3">
              {OFFICIAL_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setThemeId(theme.id)}
                  className={`relative p-3 rounded-xl transition-all text-left ${themeId === theme.id
                    ? "ring-2 ring-primary"
                    : "hover:scale-[1.02]"
                    }`}
                  style={{
                    background: themeId === theme.id
                      ? "rgba(var(--primary-rgb), 0.15)"
                      : "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    backdropFilter: "blur(10px)",
                    boxShadow: themeId === theme.id
                      ? "0 4px 20px rgba(var(--primary-rgb), 0.2)"
                      : "0 2px 10px rgba(0,0,0,0.1)",
                  }}
                >
                  {/* 颜色预览 */}
                  <div className="flex gap-1 mb-2">
                    <div
                      className="w-4 h-4 rounded-full border border-border"
                      style={{ backgroundColor: `hsl(${theme.light.primary})` }}
                    />
                    <div
                      className="w-4 h-4 rounded-full border border-border"
                      style={{ backgroundColor: `hsl(${theme.dark.primary})` }}
                    />
                  </div>

                  {/* 主题名称 */}
                  <p className="font-medium text-sm">
                    {(t.settingsModal.themes as any)?.[theme.id]?.name || theme.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(t.settingsModal.themes as any)?.[theme.id]?.description || theme.description}
                  </p>

                  {/* 选中标记 */}
                  {themeId === theme.id && (
                    <div className="absolute top-2 right-2">
                      <Check size={16} className="text-primary" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* 编辑器设置 */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t.settingsModal.editor}
            </h3>

            {/* 语言设置 */}
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">{t.settings?.language || t.welcome?.language || "Language"}</p>
              </div>
              <LanguageSwitcher
                menuAlign="right"
                buttonClassName="bg-white/5 border-white/10 hover:bg-white/10"
              />
            </div>

            {/* 编辑模式 */}
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">{t.settingsModal.defaultEditMode}</p>
                <p className="text-sm text-muted-foreground">{t.settingsModal.defaultEditModeDesc}</p>
              </div>
              <select
                value={editorMode}
                onChange={(e) => setEditorMode(e.target.value as any)}
                className="px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <option value="live">{t.settingsModal.livePreview}</option>
                <option value="source">{t.settingsModal.sourceMode}</option>
                <option value="reading">{t.settingsModal.readingMode}</option>
              </select>
            </div>
          </section>

          {/* AI 设置预览 */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t.settingsModal.aiAssistant}
            </h3>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">{t.settingsModal.currentModel}</p>
                <p className="text-sm text-muted-foreground">{t.settingsModal.configInRightPanel}</p>
              </div>
              <span
                className="text-sm text-foreground/70 px-3 py-1.5 rounded-lg"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {config.model || t.settingsModal.notConfigured}
              </span>
            </div>
          </section>

          {/* WebDAV 同步设置 */}
          <section
            className="rounded-xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <WebDAVSettings compact />
          </section>

          {/* 软件更新 */}
          <section className="space-y-4">
            <UpdateChecker />
          </section>

          {/* 关于 */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t.settingsModal.about}
            </h3>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Lumina Note</p>
                <p className="text-sm text-muted-foreground">{t.settingsModal.appDescription}</p>
              </div>
              <span className="text-sm text-muted-foreground">
                v{appVersion || "..."}
              </span>
            </div>
          </section>
        </div>
      </div>

      {/* 主题编辑器 */}
      <ThemeEditor
        isOpen={showThemeEditor}
        onClose={() => {
          setShowThemeEditor(false);
          setEditingTheme(undefined);
        }}
        editingTheme={editingTheme}
        onSave={handleThemeSaved}
      />
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
