import { useUIStore } from "@/stores/useUIStore";
import type { AppBackgroundPreset } from "@/stores/useUIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n";
import {
  copyFile,
  createDir,
  getAppDataDir,
  joinPath,
  openDialog,
  readBinaryFileBase64,
} from "@/lib/host";
import { basename, extname } from "@/lib/path";
import { extractPreferredImageSkinModeFromSource } from "@/lib/imageSkinPalette";
import { Check, ImagePlus, RotateCcw, X } from "lucide-react";
import { Select } from "@/components/ui";
import {
  APP_BACKGROUND_PRESETS,
  APP_BACKGROUND_PRESET_STYLES,
} from "@/config/appBackgrounds";
import { getImageMimeType } from "@/services/assets/editorImages";

const BACKGROUND_WALLPAPER_DIR = "background-wallpapers";

const createWallpaperFileName = (sourcePath: string): string => {
  const extension = extname(sourcePath).toLowerCase();
  const safeExtension = /^\.[a-z0-9]+$/.test(extension) ? extension : ".png";
  const randomId =
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2, 12);
  return `wallpaper-${Date.now()}-${randomId}${safeExtension}`;
};

const importBackgroundImage = async (sourcePath: string): Promise<string> => {
  const appDataDir = await getAppDataDir();
  const wallpaperDir = await joinPath(appDataDir, BACKGROUND_WALLPAPER_DIR);
  await createDir(wallpaperDir, { recursive: true });

  const targetPath = await joinPath(
    wallpaperDir,
    createWallpaperFileName(sourcePath),
  );
  await copyFile(sourcePath, targetPath);
  return targetPath;
};

export function GeneralSection() {
  const { t, locale, setLocale } = useLocaleStore();
  const {
    appBackground,
    setAppBackground,
    resetAppBackground,
    setDarkMode,
    editorMode,
    setEditorMode,
    editorFontSize,
    setEditorFontSize,
    blockEditorEnabled,
    setBlockEditorEnabled,
  } = useUIStore();

  const backgroundPresetLabels: Record<AppBackgroundPreset, string> = {
    paper: t.settingsModal.backgroundPresetPaper,
    mist: t.settingsModal.backgroundPresetMist,
    sakura: t.settingsModal.backgroundPresetSakura,
    dusk: t.settingsModal.backgroundPresetDusk,
  };

  const handleChooseBackgroundImage = async () => {
    const selected = await openDialog({
      multiple: false,
      title: t.settingsModal.chooseBackgroundImage,
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"],
        },
      ],
    });

    if (typeof selected === "string") {
      let backgroundPath = selected;
      try {
        backgroundPath = await importBackgroundImage(selected);
      } catch (error) {
        console.warn(
          "[GeneralSection] Failed to import background image:",
          error,
        );
      }

      setAppBackground({ kind: "image", imagePath: backgroundPath });
      try {
        const base64 = await readBinaryFileBase64(backgroundPath);
        const mimeType = getImageMimeType(backgroundPath);
        const preferredMode = await extractPreferredImageSkinModeFromSource(
          `data:${mimeType};base64,${base64}`,
        );
        setDarkMode(preferredMode === "dark");
      } catch (error) {
        console.warn(
          "[GeneralSection] Failed to infer background color mode:",
          error,
        );
      }
    }
  };

  const imageName = appBackground.imagePath
    ? basename(appBackground.imagePath)
    : null;
  const previewBackground =
    appBackground.kind === "preset"
      ? APP_BACKGROUND_PRESET_STYLES[appBackground.preset]
      : "linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%)";

  return (
    <>
      {/* Appearance settings */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {t.settingsModal.appearance}
          </h3>
          <button
            type="button"
            onClick={resetAppBackground}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border/60 bg-background/60 hover:bg-muted transition-colors"
            title={t.settingsModal.resetBackground}
          >
            <RotateCcw size={14} />
            {t.settingsModal.resetBackground}
          </button>
        </div>

        <div className="relative overflow-hidden rounded-lg border border-border/60">
          <div
            className="h-24"
            style={{
              background: previewBackground,
              opacity: appBackground.kind === "none" ? 1 : appBackground.opacity,
              filter:
                appBackground.blur > 0
                  ? `blur(${appBackground.blur / 2}px)`
                  : undefined,
              transform: appBackground.blur > 0 ? "scale(1.03)" : undefined,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundColor:
                appBackground.kind === "none"
                  ? "transparent"
                  : `hsl(var(--background) / ${Math.max(appBackground.dim - 0.18, 0.18)})`,
            }}
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-background/70 px-3 py-2 backdrop-blur">
            <span className="text-sm font-medium">
              {appBackground.kind === "none"
                ? t.settingsModal.backgroundNone
                : appBackground.kind === "image"
                  ? imageName || t.settingsModal.backgroundImage
                  : backgroundPresetLabels[appBackground.preset]}
            </span>
            <span className="text-xs text-muted-foreground">
              {Math.round(appBackground.opacity * 100)}%
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <p className="font-medium">{t.settingsModal.background}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <button
              type="button"
              onClick={() => setAppBackground({ kind: "none" })}
              className={`relative h-20 rounded-lg border border-border/60 bg-background/60 p-2 text-left transition-colors hover:bg-muted/50 ${
                appBackground.kind === "none"
                  ? "ring-2 ring-primary bg-primary/10"
                  : ""
              }`}
              title={t.settingsModal.backgroundNone}
            >
              <div className="mb-2 h-8 rounded-md border border-border/50 bg-background" />
              <p className="truncate text-xs font-medium">
                {t.settingsModal.backgroundNone}
              </p>
              {appBackground.kind === "none" && (
                <div className="absolute right-2 top-2">
                  <Check size={16} className="text-primary" />
                </div>
              )}
            </button>

            {APP_BACKGROUND_PRESETS.map((preset) => {
              const isActive =
                appBackground.kind === "preset" &&
                appBackground.preset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAppBackground({ kind: "preset", preset })}
                  className={`relative h-20 rounded-lg border border-border/60 bg-background/60 p-2 text-left transition-colors hover:bg-muted/50 ${
                    isActive ? "ring-2 ring-primary bg-primary/10" : ""
                  }`}
                  title={backgroundPresetLabels[preset]}
                >
                  <div
                    className="mb-2 h-8 rounded-md border border-border/50"
                    style={{ background: APP_BACKGROUND_PRESET_STYLES[preset] }}
                  />
                  <p className="truncate text-xs font-medium">
                    {backgroundPresetLabels[preset]}
                  </p>
                  {isActive && (
                    <div className="absolute right-2 top-2">
                      <Check size={16} className="text-primary" />
                    </div>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={handleChooseBackgroundImage}
              className={`relative h-20 rounded-lg border border-border/60 bg-background/60 p-2 text-left transition-colors hover:bg-muted/50 ${
                appBackground.kind === "image"
                  ? "ring-2 ring-primary bg-primary/10"
                  : ""
              }`}
              title={t.settingsModal.backgroundImage}
            >
              <div className="mb-2 flex h-8 items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/40">
                <ImagePlus size={16} className="text-muted-foreground" />
              </div>
              <p className="truncate text-xs font-medium">
                {t.settingsModal.backgroundImage}
              </p>
              {appBackground.kind === "image" && (
                <div className="absolute right-2 top-2">
                  <Check size={16} className="text-primary" />
                </div>
              )}
            </button>
          </div>

          {appBackground.kind === "image" && imageName && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2">
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {imageName}
              </span>
              <button
                type="button"
                onClick={() =>
                  setAppBackground({ kind: "none", imagePath: null })
                }
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                title={t.settingsModal.clearBackgroundImage}
              >
                <X size={13} />
                {t.settingsModal.clearBackgroundImage}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <p className="font-medium">{t.settingsModal.backgroundOpacity}</p>
            <span className="w-12 text-right text-sm font-mono text-muted-foreground">
              {Math.round(appBackground.opacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={8}
            max={60}
            value={Math.round(appBackground.opacity * 100)}
            disabled={appBackground.kind === "none"}
            onChange={(e) =>
              setAppBackground({ opacity: Number(e.target.value) / 100 })
            }
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="font-medium">{t.settingsModal.backgroundBlur}</p>
              <span className="w-12 text-right text-sm font-mono text-muted-foreground">
                {appBackground.blur}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              value={appBackground.blur}
              disabled={appBackground.kind === "none"}
              onChange={(e) =>
                setAppBackground({ blur: Number(e.target.value) })
              }
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="font-medium">{t.settingsModal.backgroundDim}</p>
              <span className="w-12 text-right text-sm font-mono text-muted-foreground">
                {Math.round(appBackground.dim * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={20}
              max={95}
              value={Math.round(appBackground.dim * 100)}
              disabled={appBackground.kind === "none"}
              onChange={(e) =>
                setAppBackground({ dim: Number(e.target.value) / 100 })
              }
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
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
          <Select
            value={locale}
            onValueChange={(v) => setLocale(v as Locale)}
            aria-label={t.settings?.language || "Language"}
            options={SUPPORTED_LOCALES.map((l) => ({
              value: l.code,
              label: l.nativeName,
              description: l.name,
            }))}
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
          <Select
            value={editorMode}
            onValueChange={(v) => setEditorMode(v as any)}
            aria-label={t.settingsModal.defaultEditMode}
            options={[
              { value: "live", label: t.settingsModal.livePreview },
              { value: "source", label: t.settingsModal.sourceMode },
              { value: "reading", label: t.settingsModal.readingMode },
            ]}
          />
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
              className={`inline-block h-3.5 w-3.5 rounded-full bg-popover shadow-elev-1 transition-transform ${
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
            style={{
              fontSize: `${editorFontSize}px`,
              lineHeight: "var(--lumina-editor-line-height)",
            }}
          >
            <p>The quick brown fox</p>
            <p>敏捷的棕色狐狸 123</p>
          </div>
        </div>
      </section>

    </>
  );
}
