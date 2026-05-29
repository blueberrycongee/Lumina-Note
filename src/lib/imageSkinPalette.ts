export interface RgbSample {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface ImageSkinColorTokens {
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  border: string;
  ribbon: string;
  mdHeading: string;
  floatingBackground: string;
  floatingForeground: string;
  floatingMuted: string;
  floatingMutedForeground: string;
  floatingAccent: string;
  floatingPrimary: string;
  floatingPrimaryForeground: string;
  floatingBorder: string;
}

interface HslColor {
  hue: number;
  saturation: number;
  lightness: number;
}

interface WeightedHslColor extends HslColor {
  weight: number;
}

const HUE_BIN_COUNT = 24;
const MAX_SAMPLE_SIZE = 48;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeHue = (hue: number) => ((hue % 360) + 360) % 360;

const hslToken = (hue: number, saturation: number, lightness: number) =>
  `${Math.round(normalizeHue(hue))} ${Math.round(clamp(saturation, 0, 100))}% ${Math.round(clamp(lightness, 0, 100))}%`;

const normalizeAlpha = (alpha: number | undefined) => {
  if (typeof alpha !== "number") return 1;
  return clamp(alpha > 1 ? alpha / 255 : alpha, 0, 1);
};

const relativeLuminance = ({ r, g, b }: RgbSample) => {
  const toLinear = (channel: number) => {
    const value = clamp(channel, 0, 255) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

const rgbToHsl = ({ r, g, b }: RgbSample): HslColor => {
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { hue: 220, saturation: 0, lightness };
  }

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return {
    hue: normalizeHue(hue * 60),
    saturation,
    lightness,
  };
};

const weightedAverageRgb = (samples: RgbSample[]) => {
  let totalWeight = 0;
  let r = 0;
  let g = 0;
  let b = 0;

  for (const sample of samples) {
    const weight = normalizeAlpha(sample.a);
    totalWeight += weight;
    r += sample.r * weight;
    g += sample.g * weight;
    b += sample.b * weight;
  }

  if (totalWeight === 0) return { r: 255, g: 255, b: 255 };
  return {
    r: r / totalWeight,
    g: g / totalWeight,
    b: b / totalWeight,
  };
};

const choosePaletteColor = (samples: RgbSample[]) => {
  const candidates: WeightedHslColor[] = [];
  const bins = Array.from({ length: HUE_BIN_COUNT }, () => 0);

  for (const sample of samples) {
    const alpha = normalizeAlpha(sample.a);
    if (alpha < 0.12) continue;
    const hsl = rgbToHsl(sample);
    if (
      hsl.saturation < 0.12 ||
      hsl.lightness < 0.1 ||
      hsl.lightness > 0.92
    ) {
      continue;
    }

    const lightnessWeight =
      1 - clamp(Math.abs(hsl.lightness - 0.52) / 0.52, 0, 1) * 0.45;
    const weight = alpha * Math.pow(hsl.saturation, 1.35) * lightnessWeight;
    const bin = Math.min(
      HUE_BIN_COUNT - 1,
      Math.floor((hsl.hue / 360) * HUE_BIN_COUNT),
    );

    bins[bin] += weight;
    candidates.push({ ...hsl, weight });
  }

  const average = rgbToHsl(weightedAverageRgb(samples));
  let dominantBin = -1;
  let dominantWeight = 0;

  bins.forEach((weight, index) => {
    if (weight > dominantWeight) {
      dominantBin = index;
      dominantWeight = weight;
    }
  });

  if (dominantBin < 0 || dominantWeight <= 0) {
    return {
      hue: average.hue,
      saturation: clamp(average.saturation * 100, 8, 18),
    };
  }

  let vectorX = 0;
  let vectorY = 0;
  let saturation = 0;
  let totalWeight = 0;

  for (const candidate of candidates) {
    const bin = Math.min(
      HUE_BIN_COUNT - 1,
      Math.floor((candidate.hue / 360) * HUE_BIN_COUNT),
    );
    if (bin !== dominantBin) continue;
    const angle = (candidate.hue * Math.PI) / 180;
    vectorX += Math.cos(angle) * candidate.weight;
    vectorY += Math.sin(angle) * candidate.weight;
    saturation += candidate.saturation * candidate.weight;
    totalWeight += candidate.weight;
  }

  if (totalWeight === 0) {
    return {
      hue: average.hue,
      saturation: clamp(average.saturation * 100, 8, 18),
    };
  }

  return {
    hue: normalizeHue((Math.atan2(vectorY, vectorX) * 180) / Math.PI),
    saturation: clamp((saturation / totalWeight) * 100, 24, 68),
  };
};

export function getFallbackImageSkinTokens(
  isDarkMode: boolean,
): ImageSkinColorTokens {
  return isDarkMode
    ? {
        background: "222 8% 9%",
        foreground: "220 8% 96%",
        muted: "222 8% 16%",
        mutedForeground: "220 7% 78%",
        accent: "222 9% 22%",
        accentForeground: "220 8% 96%",
        popover: "222 8% 13%",
        popoverForeground: "220 8% 96%",
        primary: "220 36% 78%",
        primaryForeground: "222 18% 12%",
        border: "222 8% 38%",
        ribbon: "222 10% 8%",
        mdHeading: "220 8% 96%",
        floatingBackground: "222 10% 13%",
        floatingForeground: "220 8% 96%",
        floatingMuted: "222 10% 20%",
        floatingMutedForeground: "220 7% 76%",
        floatingAccent: "222 12% 25%",
        floatingPrimary: "220 36% 78%",
        floatingPrimaryForeground: "222 18% 12%",
        floatingBorder: "222 8% 42%",
      }
    : {
        background: "220 14% 97%",
        foreground: "222 18% 8%",
        muted: "220 12% 91%",
        mutedForeground: "222 10% 30%",
        accent: "220 14% 86%",
        accentForeground: "222 18% 8%",
        popover: "220 16% 98%",
        popoverForeground: "222 18% 8%",
        primary: "220 46% 38%",
        primaryForeground: "0 0% 100%",
        border: "220 12% 68%",
        ribbon: "220 12% 89%",
        mdHeading: "222 20% 7%",
        floatingBackground: "222 14% 16%",
        floatingForeground: "220 10% 96%",
        floatingMuted: "222 12% 24%",
        floatingMutedForeground: "220 8% 76%",
        floatingAccent: "222 14% 30%",
        floatingPrimary: "220 46% 76%",
        floatingPrimaryForeground: "222 18% 10%",
        floatingBorder: "222 10% 48%",
      };
}

export function deriveImageSkinTokens(
  samples: RgbSample[],
  isDarkMode: boolean,
): ImageSkinColorTokens {
  const visibleSamples = samples.filter((sample) => normalizeAlpha(sample.a) >= 0.12);
  if (visibleSamples.length === 0) {
    return getFallbackImageSkinTokens(isDarkMode);
  }

  const averageRgb = weightedAverageRgb(visibleSamples);
  const averageLuminance = relativeLuminance(averageRgb);
  const palette = choosePaletteColor(visibleSamples);
  const hue = palette.hue;
  const chroma = palette.saturation;
  const surfaceSaturation = clamp(chroma * 0.18, 4, 14);
  const controlSaturation = clamp(chroma * 0.28, 6, 22);
  const borderSaturation = clamp(chroma * 0.2, 6, 18);
  const accentSaturation = clamp(chroma * 0.88, 34, 64);

  if (isDarkMode) {
    const lift = clamp(averageLuminance * 2, 0, 2);
    return {
      background: hslToken(hue, surfaceSaturation, 9 + lift),
      foreground: "220 8% 96%",
      muted: hslToken(hue, surfaceSaturation, 16 + lift),
      mutedForeground: "220 7% 78%",
      accent: hslToken(hue, controlSaturation, 22 + lift),
      accentForeground: "220 8% 96%",
      popover: hslToken(hue, surfaceSaturation, 13 + lift),
      popoverForeground: "220 8% 96%",
      primary: hslToken(hue, accentSaturation, 76),
      primaryForeground: "222 18% 10%",
      border: hslToken(hue, borderSaturation, 38 + lift),
      ribbon: hslToken(hue, surfaceSaturation, 7 + lift),
      mdHeading: "220 8% 98%",
      floatingBackground: hslToken(hue, surfaceSaturation, 13 + lift),
      floatingForeground: "220 8% 96%",
      floatingMuted: hslToken(hue, surfaceSaturation, 21 + lift),
      floatingMutedForeground: "220 7% 76%",
      floatingAccent: hslToken(hue, controlSaturation, 27 + lift),
      floatingPrimary: hslToken(hue, accentSaturation, 76),
      floatingPrimaryForeground: "222 18% 10%",
      floatingBorder: hslToken(hue, borderSaturation, 42 + lift),
    };
  }

  const shadow = clamp((1 - averageLuminance) * 2, 0, 2);
  return {
    background: hslToken(hue, surfaceSaturation, 97 - shadow),
    foreground: "222 18% 8%",
    muted: hslToken(hue, surfaceSaturation, 91 - shadow),
    mutedForeground: "222 10% 30%",
    accent: hslToken(hue, controlSaturation, 86 - shadow),
    accentForeground: "222 18% 8%",
    popover: hslToken(hue, surfaceSaturation, 98 - shadow * 0.5),
    popoverForeground: "222 18% 8%",
    primary: hslToken(hue, accentSaturation, 38),
    primaryForeground: "0 0% 100%",
    border: hslToken(hue, borderSaturation, 68 - shadow),
    ribbon: hslToken(hue, surfaceSaturation, 89 - shadow),
    mdHeading: "222 20% 7%",
    floatingBackground: hslToken(hue, surfaceSaturation, 16),
    floatingForeground: "220 10% 96%",
    floatingMuted: hslToken(hue, surfaceSaturation, 24),
    floatingMutedForeground: "220 8% 76%",
    floatingAccent: hslToken(hue, controlSaturation, 30),
    floatingPrimary: hslToken(hue, accentSaturation, 76),
    floatingPrimaryForeground: "222 18% 10%",
    floatingBorder: hslToken(hue, borderSaturation, 48),
  };
}

const loadImage = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode image skin source"));
    image.src = source;
  });

export async function extractImageSkinTokensFromSource(
  source: string,
  isDarkMode: boolean,
): Promise<ImageSkinColorTokens> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return getFallbackImageSkinTokens(isDarkMode);
  }

  const image = await loadImage(source);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return getFallbackImageSkinTokens(isDarkMode);
  }

  const scale = Math.min(
    1,
    MAX_SAMPLE_SIZE / sourceWidth,
    MAX_SAMPLE_SIZE / sourceHeight,
  );
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return getFallbackImageSkinTokens(isDarkMode);

  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const samples: RgbSample[] = [];

  for (let index = 0; index < imageData.data.length; index += 4) {
    samples.push({
      r: imageData.data[index] ?? 0,
      g: imageData.data[index + 1] ?? 0,
      b: imageData.data[index + 2] ?? 0,
      a: imageData.data[index + 3] ?? 255,
    });
  }

  return deriveImageSkinTokens(samples, isDarkMode);
}
