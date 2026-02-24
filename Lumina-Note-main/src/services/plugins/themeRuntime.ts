export type ThemeMode = "all" | "light" | "dark";

export type TokenMap = Record<string, string>;

export interface ThemePresetInput {
  id: string;
  name?: string;
  tokens?: TokenMap;
  light?: TokenMap;
  dark?: TokenMap;
}

interface ThemePresetRecord {
  pluginId: string;
  id: string;
  name: string;
  light: TokenMap;
  dark: TokenMap;
}

interface TokenOverride {
  pluginId: string;
  token: string;
  mode: ThemeMode;
  value: string;
}

const normalizeTokenName = (token: string) => (token.startsWith("--") ? token : `--${token}`);

const appendTokenMap = (source: TokenMap | undefined, target: TokenMap) => {
  if (!source) return;
  for (const [rawToken, rawValue] of Object.entries(source)) {
    const token = normalizeTokenName(rawToken.trim());
    const value = String(rawValue ?? "").trim();
    if (!token || !value) continue;
    target[token] = value;
  }
};

class ThemeRuntime {
  private presets = new Map<string, ThemePresetRecord>();
  private overrides: TokenOverride[] = [];
  private lightStyleEl: HTMLStyleElement | null = null;
  private darkStyleEl: HTMLStyleElement | null = null;

  registerPreset(pluginId: string, input: ThemePresetInput): () => void {
    const id = input.id.trim();
    if (!id) {
      throw new Error("Theme preset id cannot be empty");
    }

    const key = `${pluginId}:${id}`;
    const light: TokenMap = {};
    const dark: TokenMap = {};
    appendTokenMap(input.tokens, light);
    appendTokenMap(input.tokens, dark);
    appendTokenMap(input.light, light);
    appendTokenMap(input.dark, dark);

    this.presets.set(key, {
      pluginId,
      id,
      name: (input.name || id).trim() || id,
      light,
      dark,
    });

    return () => {
      this.presets.delete(key);
      this.recompute();
    };
  }

  applyPreset(pluginId: string, id: string): void {
    const key = `${pluginId}:${id.trim()}`;
    const preset = this.presets.get(key);
    if (!preset) {
      throw new Error(`Theme preset not found: ${id}`);
    }
    this.setTokenMap(pluginId, preset.light, "light");
    this.setTokenMap(pluginId, preset.dark, "dark");
  }

  setToken(pluginId: string, token: string, value: string, mode: ThemeMode = "all"): () => void {
    const normalized = normalizeTokenName(token.trim());
    const normalizedValue = String(value ?? "").trim();
    if (!normalized || !normalizedValue) {
      throw new Error("Theme token and value cannot be empty");
    }

    this.overrides = this.overrides.filter(
      (item) => !(item.pluginId === pluginId && item.token === normalized && item.mode === mode),
    );
    this.overrides.push({
      pluginId,
      token: normalized,
      mode,
      value: normalizedValue,
    });
    this.recompute();

    return () => {
      this.overrides = this.overrides.filter(
        (item) => !(item.pluginId === pluginId && item.token === normalized && item.mode === mode),
      );
      this.recompute();
    };
  }

  resetToken(pluginId: string, token: string, mode: ThemeMode = "all") {
    const normalized = normalizeTokenName(token.trim());
    this.overrides = this.overrides.filter(
      (item) => !(item.pluginId === pluginId && item.token === normalized && item.mode === mode),
    );
    this.recompute();
  }

  clearPlugin(pluginId: string) {
    this.overrides = this.overrides.filter((item) => item.pluginId !== pluginId);
    for (const [key, preset] of this.presets.entries()) {
      if (preset.pluginId === pluginId) {
        this.presets.delete(key);
      }
    }
    this.recompute();
  }

  reapply() {
    this.recompute();
  }

  private setTokenMap(pluginId: string, map: TokenMap, mode: ThemeMode) {
    for (const [token, value] of Object.entries(map)) {
      this.overrides = this.overrides.filter(
        (item) => !(item.pluginId === pluginId && item.token === token && item.mode === mode),
      );
      this.overrides.push({ pluginId, token, mode, value });
    }
    this.recompute();
  }

  private recompute() {
    const light = new Map<string, string>();
    const dark = new Map<string, string>();

    for (const item of this.overrides) {
      if (item.mode === "all" || item.mode === "light") {
        light.set(item.token, item.value);
      }
      if (item.mode === "all" || item.mode === "dark") {
        dark.set(item.token, item.value);
      }
    }

    this.lightStyleEl = this.renderModeStyle(
      this.lightStyleEl,
      "data-lumina-plugin-theme-light",
      ":root:not(.dark)",
      light,
    );
    this.darkStyleEl = this.renderModeStyle(
      this.darkStyleEl,
      "data-lumina-plugin-theme-dark",
      ":root.dark",
      dark,
    );
  }

  private renderModeStyle(
    existing: HTMLStyleElement | null,
    attr: string,
    selector: string,
    tokens: Map<string, string>,
  ): HTMLStyleElement | null {
    if (existing) {
      existing.remove();
    }

    if (tokens.size === 0) {
      return null;
    }

    const style = document.createElement("style");
    style.setAttribute(attr, "true");
    const serialized = Array.from(tokens.entries())
      .map(([token, value]) => `${token}: ${value};`)
      .join(" ");
    style.textContent = `${selector} { ${serialized} }`;
    document.head.appendChild(style);
    return style;
  }
}

export const pluginThemeRuntime = new ThemeRuntime();
