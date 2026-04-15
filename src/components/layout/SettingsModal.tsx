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
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { OFFICIAL_THEMES, Theme } from "@/config/themes";
import { loadUserThemes, getUserThemes, deleteUserTheme } from "@/config/themePlugin";
import { X, Check, Plus, Trash2, Palette } from "lucide-react";
import { ThemeEditor } from "../ai/ThemeEditor";
import { WebDAVSettings } from "../settings/WebDAVSettings";
import { DocToolsSection } from "../settings/DocToolsSection";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ProfileSettingsSection } from "../settings/ProfileSettingsSection";
import { PublishSettingsSection } from "../settings/PublishSettingsSection";
import { MobileGatewaySection } from "../settings/MobileGatewaySection";
import { CloudRelaySection } from "../settings/CloudRelaySection";
import { MobileOptionsSection } from "../settings/MobileOptionsSection";
import { DiagnosticsSection } from "../settings/DiagnosticsSection";
import { OpenClawWorkspaceSection } from "../settings/OpenClawWorkspaceSection";
import { ProxySection } from "../settings/ProxySection";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUpdateModal: () => void;
}

export function SettingsModal({ isOpen, onClose, onOpenUpdateModal }: SettingsModalProps) {
  const { t } = useLocaleStore();
  const { themeId, setThemeId, editorMode, setEditorMode, editorFontSize, setEditorFontSize } = useUIStore();
  const { config } = useAIStore();
  const { vaultPath, fileTree } = useFileStore();

  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | undefined>();
  const [userThemes, setUserThemes] = useState<Theme[]>([]);
  const [appVersion, setAppVersion] = useState<string>("");

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
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-spotlight-overlay"
        onClick={onClose}
      />

      {/* 设置面板 - 普通卡片风格 */}
      <div className="relative w-[600px] max-h-[80vh] rounded-xl shadow-2xl overflow-hidden border border-border/60 bg-background/95 animate-spotlight-in">
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

        {/* 设置内容 */}
        <div className="p-6 space-y-8 overflow-y-auto max-h-[calc(80vh-60px)]">
          {/* 主题设置 */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {t.settingsModal.theme}
              </h3>
              <button
                onClick={handleNewTheme}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border/60 bg-background/60 hover:bg-muted transition-colors"
                title={t.settingsModal.createTheme}
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
                      className={`relative p-3 rounded-xl transition-colors text-left group border border-border/60 ${
                        themeId === theme.id
                          ? "ring-2 ring-primary bg-primary/10"
                          : "bg-background/60 hover:bg-muted/50"
                      }`}
                    >
                      <button
                        onClick={() => setThemeId(theme.id)}
                        className="w-full text-left"
                        title={`应用主题：${theme.name}`}
                      >
                        {/* 颜色预览 */}
                        <div className="flex gap-1 mb-2">
                          <div
                            className="w-4 h-4 rounded-full border border-border/60"
                            style={{ backgroundColor: `hsl(${theme.light.primary})` }}
                          />
                          <div
                            className="w-4 h-4 rounded-full border border-border/60"
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
                          className="p-1 rounded hover:bg-muted"
                          title={t.common.edit}
                        >
                          <Palette size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteTheme(theme)}
                          className="p-1 rounded hover:bg-destructive/20 text-destructive"
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
                  className={`relative p-3 rounded-xl transition-colors text-left border border-border/60 ${
                    themeId === theme.id
                      ? "ring-2 ring-primary bg-primary/10"
                      : "bg-background/60 hover:bg-muted/50"
                  }`}
                  title={`应用主题：${(t.settingsModal.themes as any)?.[theme.id]?.name || theme.name}`}
                >
                  {/* 颜色预览 */}
                  <div className="flex gap-1 mb-2">
                    <div
                      className="w-4 h-4 rounded-full border border-border/60"
                      style={{ backgroundColor: `hsl(${theme.light.primary})` }}
                    />
                    <div
                      className="w-4 h-4 rounded-full border border-border/60"
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
                buttonClassName="bg-background/60 border-border/60 hover:bg-muted"
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
                className="px-3 py-1.5 rounded-lg text-sm bg-background/60 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="live">{t.settingsModal.livePreview}</option>
                <option value="source">{t.settingsModal.sourceMode}</option>
                <option value="reading">{t.settingsModal.readingMode}</option>
              </select>
            </div>

            {/* 字体大小 */}
            <div className="py-2 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t.settingsModal.editorFontSize}</p>
                  <p className="text-sm text-muted-foreground">{t.settingsModal.editorFontSizeDesc}</p>
                </div>
                <span className="text-sm font-mono bg-muted px-2 py-1 rounded">{editorFontSize}px</span>
              </div>

              {/* Slider */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-6">10</span>
                <input
                  type="range"
                  min={10}
                  max={32}
                  value={editorFontSize}
                  onChange={(e) => setEditorFontSize(Number(e.target.value))}
                  className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <span className="text-xs text-muted-foreground w-6">32</span>
              </div>

              {/* Preview */}
              <div
                className="p-3 rounded-lg border border-border/60 bg-background/60"
                style={{ fontSize: `${editorFontSize}px` }}
              >
                <p className="leading-relaxed">The quick brown fox</p>
                <p className="leading-relaxed">敏捷的棕色狐狸 123</p>
              </div>
            </div>
          </section>

          <PublishSettingsSection vaultPath={vaultPath} fileTree={fileTree} />

          {/* 公开主页设置 */}
          <ProfileSettingsSection fileTree={fileTree} />

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
                className="text-sm text-foreground/70 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/60"
              >
                {config.model || t.settingsModal.notConfigured}
              </span>
            </div>
          </section>

          <DocToolsSection />

          <MobileGatewaySection />
          <MobileOptionsSection />
          <OpenClawWorkspaceSection />
          <CloudRelaySection />
          <ProxySection />

          {/* WebDAV 同步设置 */}
          <section className="rounded-xl overflow-hidden border border-border/60 bg-background/60">
            <WebDAVSettings compact />
          </section>

          {/* 软件更新 */}
          <section className="space-y-4" data-testid="settings-section-update">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t.updateChecker.title}
            </h3>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/60 p-4">
              <div className="space-y-1">
                <p className="font-medium">
                  {t.updateChecker.versionLabel.replace("{version}", appVersion || "...")}
                </p>
                <p className="text-sm text-muted-foreground">{t.settingsModal.softwareUpdateDescription}</p>
              </div>
              <button
                type="button"
                onClick={onOpenUpdateModal}
                data-testid="settings-open-update-modal"
                className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                title={t.settingsModal.softwareUpdateOpen}
              >
                {t.settingsModal.softwareUpdateOpen}
              </button>
            </div>
          </section>

          <DiagnosticsSection />

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
