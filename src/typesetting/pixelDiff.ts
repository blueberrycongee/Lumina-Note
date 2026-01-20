export type PixelDiffResult = {
  totalPixels: number;
  diffPixels: number;
  diffRatio: number;
  maxChannelDelta: number;
  meanChannelDelta: number;
};

export function diffPixelData(
  base: Uint8ClampedArray,
  candidate: Uint8ClampedArray,
): PixelDiffResult {
  if (base.length !== candidate.length) {
    throw new Error(`Pixel data length mismatch: ${base.length} vs ${candidate.length}`);
  }

  if (base.length % 4 !== 0) {
    throw new Error("Pixel data length must be a multiple of 4 (RGBA)");
  }

  const totalPixels = base.length / 4;
  if (totalPixels === 0) {
    return {
      totalPixels,
      diffPixels: 0,
      diffRatio: 0,
      maxChannelDelta: 0,
      meanChannelDelta: 0,
    };
  }

  let diffPixels = 0;
  let maxChannelDelta = 0;
  let sumChannelDelta = 0;

  for (let index = 0; index < base.length; index += 4) {
    let pixelChanged = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(candidate[index + channel] - base[index + channel]);
      if (delta !== 0) {
        pixelChanged = true;
      }
      if (delta > maxChannelDelta) {
        maxChannelDelta = delta;
      }
      sumChannelDelta += delta;
    }
    if (pixelChanged) {
      diffPixels += 1;
    }
  }

  return {
    totalPixels,
    diffPixels,
    diffRatio: diffPixels / totalPixels,
    maxChannelDelta,
    meanChannelDelta: sumChannelDelta / (totalPixels * 4),
  };
}
