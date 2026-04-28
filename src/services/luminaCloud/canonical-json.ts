/**
 * Canonical JSON serialization (sorted keys, no whitespace) for license
 * payload signing per CONTRACT.md §1.2. Matches the simple subset of RFC 8785:
 * recursively sort object keys, drop `undefined` values, re-use `JSON.stringify`
 * for primitives.
 *
 * Sufficient for the license payload (CONTRACT.md §1.1) which only contains
 * strings, integers, booleans, arrays of strings, and `null`. If the payload
 * grows non-integer numbers, replace this with a full JCS implementation.
 */

export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalJsonError';
  }
}

export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) {
    throw new CanonicalJsonError('Cannot canonicalize `undefined` at root');
  }
  return canonicalizeInner(value);
}

function canonicalizeInner(value: unknown): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return (value as boolean) ? 'true' : 'false';
  if (t === 'number') {
    const n = value as number;
    if (!Number.isFinite(n)) {
      throw new CanonicalJsonError(`Cannot canonicalize non-finite number: ${n}`);
    }
    return JSON.stringify(n);
  }
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = value.map((v) => (v === undefined ? 'null' : canonicalizeInner(v)));
    return '[' + items.join(',') + ']';
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalizeInner(obj[k]));
    return '{' + parts.join(',') + '}';
  }
  throw new CanonicalJsonError(`Cannot canonicalize value of type ${t}`);
}

export function canonicalizeToBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
