import { describe, expect, it } from "vitest";
import {
  deriveImageSkinTokens,
  getFallbackImageSkinTokens,
  RgbSample,
} from "./imageSkinPalette";

const hueOf = (token: string) => Number(token.split(" ")[0]);
const lightnessOf = (token: string) =>
  Number(token.match(/(\d+)%$/)?.[1] ?? Number.NaN);
const parseHslToken = (token: string) => {
  const match = token.match(/^(\d+) (\d+)% (\d+)%$/);
  if (!match) throw new Error(`Invalid HSL token: ${token}`);
  return {
    hue: Number(match[1]),
    saturation: Number(match[2]) / 100,
    lightness: Number(match[3]) / 100,
  };
};
const hslToRgb = (token: string) => {
  const { hue, saturation, lightness } = parseHslToken(token);
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const m = lightness - chroma / 2;
  const [r1, g1, b1] =
    segment < 1
      ? [chroma, x, 0]
      : segment < 2
        ? [x, chroma, 0]
        : segment < 3
          ? [0, chroma, x]
          : segment < 4
            ? [0, x, chroma]
            : segment < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return {
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255,
  };
};
const luminance = (token: string) => {
  const rgb = hslToRgb(token);
  const toLinear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b)
  );
};
const contrastRatio = (first: string, second: string) => {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

describe("image skin palette", () => {
  it("derives coordinated light-mode UI tokens from a blue image", () => {
    const samples: RgbSample[] = Array.from({ length: 20 }, () => ({
      r: 64,
      g: 132,
      b: 220,
      a: 255,
    }));

    const tokens = deriveImageSkinTokens(samples, false);

    expect(hueOf(tokens.primary)).toBeGreaterThan(200);
    expect(hueOf(tokens.primary)).toBeLessThan(230);
    expect(tokens.foreground).toBe("222 18% 8%");
    expect(tokens.mutedForeground).toBe("222 10% 30%");
    expect(contrastRatio(tokens.foreground, tokens.background)).toBeGreaterThan(14);
    expect(contrastRatio(tokens.mutedForeground, tokens.muted)).toBeGreaterThan(6);
    expect(tokens.primaryForeground).toBe("0 0% 100%");
    expect(tokens.floatingForeground).toBe("220 10% 96%");
    expect(contrastRatio(tokens.floatingForeground, tokens.floatingBackground)).toBeGreaterThan(10);
    expect(contrastRatio(tokens.floatingMutedForeground, tokens.floatingMuted)).toBeGreaterThan(5);
  });

  it("keeps dark-mode text readable while tinting controls toward the image", () => {
    const samples: RgbSample[] = Array.from({ length: 20 }, () => ({
      r: 210,
      g: 74,
      b: 154,
      a: 255,
    }));

    const tokens = deriveImageSkinTokens(samples, true);

    expect(hueOf(tokens.primary)).toBeGreaterThan(310);
    expect(hueOf(tokens.primary)).toBeLessThan(340);
    expect(lightnessOf(tokens.background)).toBeLessThan(16);
    expect(tokens.foreground).toBe("220 8% 96%");
    expect(contrastRatio(tokens.foreground, tokens.background)).toBeGreaterThan(14);
    expect(contrastRatio(tokens.mutedForeground, tokens.muted)).toBeGreaterThan(6);
    expect(lightnessOf(tokens.border)).toBeGreaterThan(25);
    expect(tokens.floatingForeground).toBe("220 8% 96%");
    expect(contrastRatio(tokens.floatingForeground, tokens.floatingBackground)).toBeGreaterThan(10);
  });

  it("falls back to stable readable tokens when the image has no visible pixels", () => {
    expect(deriveImageSkinTokens([{ r: 0, g: 0, b: 0, a: 0 }], false)).toEqual(
      getFallbackImageSkinTokens(false),
    );
  });
});
