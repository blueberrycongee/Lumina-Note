import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { readBinaryFileBase64 } from "@/lib/host";
import {
  extractImageSkinTokensFromSource,
  getFallbackImageSkinTokens,
  ImageSkinColorTokens,
} from "@/lib/imageSkinPalette";
import { getImageMimeType } from "@/services/assets/editorImages";
import { useUIStore } from "@/stores/useUIStore";
import {
  APP_BACKGROUND_PRESET_STYLES,
  APP_BACKGROUND_PRESET_TOKENS,
} from "@/config/appBackgrounds";

const SKIN_CUSTOM_PROPERTIES = [
  "--lumina-skin-background",
  "--lumina-skin-foreground",
  "--lumina-skin-muted",
  "--lumina-skin-muted-foreground",
  "--lumina-skin-accent",
  "--lumina-skin-accent-foreground",
  "--lumina-skin-popover",
  "--lumina-skin-popover-foreground",
  "--lumina-skin-primary",
  "--lumina-skin-primary-foreground",
  "--lumina-skin-border",
  "--lumina-skin-ribbon",
  "--lumina-skin-md-heading",
  "--lumina-skin-floating-background",
  "--lumina-skin-floating-foreground",
  "--lumina-skin-floating-muted",
  "--lumina-skin-floating-muted-foreground",
  "--lumina-skin-floating-accent",
  "--lumina-skin-floating-primary",
  "--lumina-skin-floating-primary-foreground",
  "--lumina-skin-floating-border",
  "--lumina-skin-image",
] as const;

const IMAGE_SKIN_TOKEN_PROPERTIES: Array<
  [keyof ImageSkinColorTokens, (typeof SKIN_CUSTOM_PROPERTIES)[number]]
> = [
  ["background", "--lumina-skin-background"],
  ["foreground", "--lumina-skin-foreground"],
  ["muted", "--lumina-skin-muted"],
  ["mutedForeground", "--lumina-skin-muted-foreground"],
  ["accent", "--lumina-skin-accent"],
  ["accentForeground", "--lumina-skin-accent-foreground"],
  ["popover", "--lumina-skin-popover"],
  ["popoverForeground", "--lumina-skin-popover-foreground"],
  ["primary", "--lumina-skin-primary"],
  ["primaryForeground", "--lumina-skin-primary-foreground"],
  ["border", "--lumina-skin-border"],
  ["ribbon", "--lumina-skin-ribbon"],
  ["mdHeading", "--lumina-skin-md-heading"],
  ["floatingBackground", "--lumina-skin-floating-background"],
  ["floatingForeground", "--lumina-skin-floating-foreground"],
  ["floatingMuted", "--lumina-skin-floating-muted"],
  ["floatingMutedForeground", "--lumina-skin-floating-muted-foreground"],
  ["floatingAccent", "--lumina-skin-floating-accent"],
  ["floatingPrimary", "--lumina-skin-floating-primary"],
  ["floatingPrimaryForeground", "--lumina-skin-floating-primary-foreground"],
  ["floatingBorder", "--lumina-skin-floating-border"],
];

const clearSkinCustomProperties = (root: HTMLElement) => {
  SKIN_CUSTOM_PROPERTIES.forEach((property) => root.style.removeProperty(property));
};

export function AppBackground() {
  const { appBackground, isDarkMode } = useUIStore(
    useShallow((state) => ({
      appBackground: state.appBackground,
      isDarkMode: state.isDarkMode,
    })),
  );
  const [imageSourceUrl, setImageSourceUrl] = useState<string | null>(null);
  const [imageSkinTokens, setImageSkinTokens] =
    useState<ImageSkinColorTokens | null>(null);

  useEffect(() => {
    if (appBackground.kind !== "image" || !appBackground.imagePath) {
      setImageSourceUrl(null);
      setImageSkinTokens(null);
      return;
    }

    let cancelled = false;
    const mimeType = getImageMimeType(appBackground.imagePath);
    setImageSourceUrl(null);
    setImageSkinTokens(null);

    readBinaryFileBase64(appBackground.imagePath)
      .then((base64) => {
        if (!cancelled) {
          setImageSourceUrl(`data:${mimeType};base64,${base64}`);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn(
            "[AppBackground] Failed to load background image:",
            error,
          );
          setImageSourceUrl(null);
          setImageSkinTokens(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appBackground.imagePath, appBackground.kind]);

  useEffect(() => {
    if (appBackground.kind !== "image" || !imageSourceUrl) {
      setImageSkinTokens(null);
      return;
    }

    let cancelled = false;
    setImageSkinTokens(null);

    extractImageSkinTokensFromSource(imageSourceUrl, isDarkMode)
      .then((tokens) => {
        if (!cancelled) {
          setImageSkinTokens(tokens);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn(
            "[AppBackground] Failed to extract background image palette:",
            error,
          );
          setImageSkinTokens(getFallbackImageSkinTokens(isDarkMode));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appBackground.kind, imageSourceUrl, isDarkMode]);

  const backgroundImage = useMemo(() => {
    if (appBackground.kind === "preset") {
      return APP_BACKGROUND_PRESET_STYLES[appBackground.preset];
    }
    if (appBackground.kind === "image") {
      return imageSourceUrl ? `url("${imageSourceUrl}")` : null;
    }
    return null;
  }, [appBackground.kind, appBackground.preset, imageSourceUrl]);

  const enabled = Boolean(backgroundImage);

  useEffect(() => {
    if (enabled) {
      const root = document.documentElement;
      root.dataset.luminaSkin = appBackground.kind;

      if (appBackground.kind === "preset") {
        const tokens =
          APP_BACKGROUND_PRESET_TOKENS[appBackground.preset][
            isDarkMode ? "dark" : "light"
          ];
        root.dataset.luminaSkinPreset = appBackground.preset;
        root.style.setProperty("--lumina-skin-background", tokens.background);
        root.style.setProperty("--lumina-skin-popover", tokens.popover);
        root.style.setProperty("--lumina-skin-muted", tokens.muted);
        root.style.setProperty("--lumina-skin-accent", tokens.accent);
        root.style.setProperty("--lumina-skin-ribbon", tokens.ribbon);
        root.style.setProperty("--lumina-skin-border", tokens.border);
      } else if (appBackground.kind === "image" && backgroundImage) {
        delete root.dataset.luminaSkinPreset;
        root.style.setProperty("--lumina-skin-image", backgroundImage);
        const tokens =
          imageSkinTokens ?? getFallbackImageSkinTokens(isDarkMode);
        IMAGE_SKIN_TOKEN_PROPERTIES.forEach(([key, property]) => {
          root.style.setProperty(property, tokens[key]);
        });
      } else {
        delete root.dataset.luminaSkinPreset;
      }

      return () => {
        delete root.dataset.luminaSkin;
        delete root.dataset.luminaSkinPreset;
        clearSkinCustomProperties(root);
      };
    }

    const root = document.documentElement;
    delete root.dataset.luminaSkin;
    delete root.dataset.luminaSkinPreset;
    clearSkinCustomProperties(root);
    return undefined;
  }, [
    appBackground.kind,
    appBackground.preset,
    backgroundImage,
    enabled,
    imageSkinTokens,
    isDarkMode,
  ]);

  if (!backgroundImage) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage,
          opacity: appBackground.opacity,
          filter:
            appBackground.blur > 0
              ? `blur(${appBackground.blur}px)`
              : undefined,
          transform: appBackground.blur > 0 ? "scale(1.04)" : undefined,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: `hsl(var(--background) / ${appBackground.dim})`,
        }}
      />
    </div>
  );
}
