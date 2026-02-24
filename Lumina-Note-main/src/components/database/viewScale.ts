export const DATABASE_VIEW_SCALE_DEFAULT = 1;
export const DATABASE_VIEW_SCALE_MIN = 0.7;
export const DATABASE_VIEW_SCALE_MAX = 1.15;
export const DATABASE_VIEW_SCALE_STEP = 0.1;

function roundScale(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeDatabaseViewScale(scale?: number): number {
  if (typeof scale !== "number" || Number.isNaN(scale)) {
    return DATABASE_VIEW_SCALE_DEFAULT;
  }
  return roundScale(Math.min(DATABASE_VIEW_SCALE_MAX, Math.max(DATABASE_VIEW_SCALE_MIN, scale)));
}

export function nextDatabaseViewScale(scale: number): number {
  return normalizeDatabaseViewScale(scale + DATABASE_VIEW_SCALE_STEP);
}

export function prevDatabaseViewScale(scale: number): number {
  return normalizeDatabaseViewScale(scale - DATABASE_VIEW_SCALE_STEP);
}

export function formatDatabaseViewScale(scale: number): string {
  return `${Math.round(normalizeDatabaseViewScale(scale) * 100)}%`;
}
