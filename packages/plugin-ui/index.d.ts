export type LuminaThemeMode = "all" | "light" | "dark";

export interface LuminaThemePreset {
  id: string;
  name?: string;
  tokens?: Record<string, string>;
  light?: Record<string, string>;
  dark?: Record<string, string>;
}

export interface LuminaStyleInput {
  css: string;
  scopeId?: string;
  global?: boolean;
  layer?: "base" | "theme" | "component" | "override";
}

export const defaultThemeTokens: {
  color: readonly [
    "--background",
    "--foreground",
    "--muted",
    "--muted-foreground",
    "--accent",
    "--accent-foreground",
    "--primary",
    "--primary-foreground",
    "--border"
  ];
  radius: readonly ["--ui-radius-sm", "--ui-radius-md", "--ui-radius-lg"];
  typography: readonly ["--font-sans", "--font-mono"];
  motion: readonly ["--lumina-motion-fast", "--lumina-motion-base", "--lumina-motion-slow"];
};

export declare function createThemePreset(input: LuminaThemePreset): LuminaThemePreset;

export declare function withCssVars(selector: string, tokens: Record<string, string>): string;
