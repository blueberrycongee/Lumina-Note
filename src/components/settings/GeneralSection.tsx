import { useEffect, useState } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { OFFICIAL_THEMES, Theme } from "@/config/themes";
import {
  loadUserThemes,
  getUserThemes,
  deleteUserTheme,
} from "@/config/themePlugin";
import { Check, Plus, Trash2, Palette } from "lucide-react";
import { ThemeEditor } from "../ai/ThemeEditor";
import { LanguageSwitcher } from "../layout/LanguageSwitcher";

interface GeneralSectionProps {
  isOpen: boolean;
}

export function GeneralSection({ isOpen }: GeneralSectionProps) {
  const { t } = useLocaleStore();
  const {
    themeId,
    setThemeId,
    editorMode,
    setEditorMode,
    editorFontSize,
    setEditorFontSize,
    blockEditorEnabled,
    setBlockEditorEnabled,
  } = useUIStore();
  const { vaultPath } = useFileStore();

  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | undefined>();
  const [userThemes, setUserThemes] = useState<Theme[]>([]);

  useEffect(() => {
    if (isOpen && vaultPath) {
      loadUserThemes(vaultPath).then((themes) => {
        setUserThemes(themes);
      });
    }
  }, [isOpen, vaultPath]);

  const handleDeleteTheme = async (theme: Theme) => {
    if (!vaultPath) return;
    if (
      confirm(t.settingsModal.confirmDeleteTheme.replace("{name}", theme.name))
    ) {
      await deleteUserTheme(vaultPath, theme.id);
      setUserThemes(getUserThemes());
      if (themeId === theme.id) {
        setThemeId("default");
      }
    }
  };

  const handleEditTheme = (theme: Theme) => {
    setEditingTheme(theme);
    setShowThemeEditor(true);
  };

  const handleNewTheme = () => {
    setEditingTheme(undefined);
    setShowThemeEditor(true);
  };

  const handleThemeSaved = () => {
    setUserThemes(getUserThemes());
  };

  return (
    <>
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

        {/* 用户主题 */}
        {userThemes.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground mt-4">
              {t.settingsModal.myThemes}
            </p>
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
                    title={t.settingsModal.applyTheme.replace(
                      "{name}",
                      theme.name,
                    )}
                  >
                    <div className="flex gap-1 mb-2">
                      <div
                        className="w-4 h-4 rounded-full border border-border/60"
                        style={{
                          backgroundColor: `hsl(${theme.light.primary})`,
                        }}
                      />
                      <div
                        className="w-4 h-4 rounded-full border border-border/60"
                        style={{
                          backgroundColor: `hsl(${theme.dark.primary})`,
                        }}
                      />
                    </div>
                    <p className="font-medium text-sm">{theme.name}</p>
                  </button>

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
        {userThemes.length > 0 && (
          <p className="text-xs text-muted-foreground mt-4">
            {t.settingsModal.officialThemes}
          </p>
        )}
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
              title={t.settingsModal.applyTheme.replace("{name}", theme.name)}
            >
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
              <p className="font-medium text-sm">{theme.name}</p>
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
            <p className="font-medium">
              {t.settings?.language || t.welcome?.language || "Language"}
            </p>
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
            <p className="text-sm text-muted-foreground">
              {t.settingsModal.defaultEditModeDesc}
            </p>
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

        {/* 块编辑器交互 */}
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium">{t.settingsModal.blockEditor}</p>
            <p className="text-sm text-muted-foreground">
              {t.settingsModal.blockEditorDesc}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={blockEditorEnabled}
            aria-label={t.settingsModal.blockEditor}
            onClick={() => setBlockEditorEnabled(!blockEditorEnabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              blockEditorEnabled ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                blockEditorEnabled ? "translate-x-[18px]" : "translate-x-[2px]"
              }`}
            />
          </button>
        </div>

        {/* 字体大小 */}
        <div className="py-2 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t.settingsModal.editorFontSize}</p>
              <p className="text-sm text-muted-foreground">
                {t.settingsModal.editorFontSizeDesc}
              </p>
            </div>
            <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
              {editorFontSize}px
            </span>
          </div>

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

          <div
            className="p-3 rounded-lg border border-border/60 bg-background/60"
            style={{ fontSize: `${editorFontSize}px` }}
          >
            <p className="leading-relaxed">The quick brown fox</p>
            <p className="leading-relaxed">敏捷的棕色狐狸 123</p>
          </div>
        </div>
      </section>

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
    </>
  );
}
