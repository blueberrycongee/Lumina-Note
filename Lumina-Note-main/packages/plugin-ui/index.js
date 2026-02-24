export const defaultThemeTokens = {
  color: [
    "--background",
    "--foreground",
    "--muted",
    "--muted-foreground",
    "--accent",
    "--accent-foreground",
    "--primary",
    "--primary-foreground",
    "--border",
  ],
  radius: ["--ui-radius-sm", "--ui-radius-md", "--ui-radius-lg"],
  typography: ["--font-sans", "--font-mono"],
  motion: ["--lumina-motion-fast", "--lumina-motion-base", "--lumina-motion-slow"],
};

export function createThemePreset(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Theme preset input is required");
  }
  if (!input.id || !String(input.id).trim()) {
    throw new Error("Theme preset id is required");
  }
  return {
    id: String(input.id).trim(),
    name: input.name ? String(input.name) : undefined,
    tokens: input.tokens || undefined,
    light: input.light || undefined,
    dark: input.dark || undefined,
  };
}

export function withCssVars(selector, tokens) {
  const body = Object.entries(tokens || {})
    .map(([key, value]) => `${key}: ${value};`)
    .join(" ");
  return `${selector} { ${body} }`;
}
