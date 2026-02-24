export type RawBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BoundsSnapshot = {
  raw: RawBounds;
  normalized: RawBounds;
};

const EPSILON = 0.75;

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export function normalizeBounds(raw: RawBounds): RawBounds {
  return {
    x: Math.round(raw.x),
    y: Math.round(raw.y),
    width: Math.round(clampNonNegative(raw.width)),
    height: Math.round(clampNonNegative(raw.height)),
  };
}

export function createBoundsSnapshot(raw: RawBounds): BoundsSnapshot {
  return {
    raw,
    normalized: normalizeBounds(raw),
  };
}

function isDeltaBelowEpsilon(prev: RawBounds, next: RawBounds): boolean {
  return (
    Math.abs(prev.x - next.x) < EPSILON &&
    Math.abs(prev.y - next.y) < EPSILON &&
    Math.abs(prev.width - next.width) < EPSILON &&
    Math.abs(prev.height - next.height) < EPSILON
  );
}

export function shouldUpdateBounds(prev: BoundsSnapshot | null, nextRaw: RawBounds): boolean {
  if (!prev) return true;
  if (isDeltaBelowEpsilon(prev.raw, nextRaw)) return false;

  const nextNormalized = normalizeBounds(nextRaw);
  return !(
    prev.normalized.x === nextNormalized.x &&
    prev.normalized.y === nextNormalized.y &&
    prev.normalized.width === nextNormalized.width &&
    prev.normalized.height === nextNormalized.height
  );
}

