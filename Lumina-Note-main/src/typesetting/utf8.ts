export function sliceUtf8(text: string, startByte: number, endByte: number): string {
  if (!text) return "";
  const bytes = new TextEncoder().encode(text);
  if (bytes.length === 0) return "";
  const safeStart = clampByte(0, startByte, bytes.length);
  const safeEnd = clampByte(safeStart, endByte, bytes.length);
  if (safeStart === safeEnd) return "";
  return new TextDecoder().decode(bytes.slice(safeStart, safeEnd));
}

function clampByte(min: number, value: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
