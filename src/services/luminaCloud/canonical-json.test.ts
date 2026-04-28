import { describe, expect, it } from 'vitest';

import { CanonicalJsonError, canonicalize, canonicalizeToBytes } from './canonical-json';

describe('canonicalize', () => {
  it('sorts object keys alphabetically', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ z: { y: 1, x: 2 }, a: 1 })).toBe('{"a":1,"z":{"x":2,"y":1}}');
  });

  it('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalize([{ b: 1, a: 2 }, { d: 4, c: 3 }])).toBe('[{"a":2,"b":1},{"c":3,"d":4}]');
  });

  it('handles primitives', () => {
    expect(canonicalize('hello')).toBe('"hello"');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
    expect(canonicalize(null)).toBe('null');
  });

  it('drops undefined object properties', () => {
    expect(canonicalize({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });

  it('replaces undefined array elements with null (matches JSON.stringify)', () => {
    expect(canonicalize([1, undefined, 2])).toBe('[1,null,2]');
  });

  it('throws on non-finite numbers', () => {
    expect(() => canonicalize(Number.NaN)).toThrow(CanonicalJsonError);
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow(CanonicalJsonError);
  });

  it('throws when root is undefined', () => {
    expect(() => canonicalize(undefined)).toThrow(CanonicalJsonError);
  });

  it('escapes strings the same way as JSON.stringify', () => {
    expect(canonicalize('a"b\\c')).toBe(JSON.stringify('a"b\\c'));
    expect(canonicalize('über')).toBe(JSON.stringify('über'));
  });

  it('produces a stable, byte-identical encoding', () => {
    const a = canonicalize({ b: 2, a: 1, c: [3, 2, 1] });
    const b = canonicalize({ c: [3, 2, 1], a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":1,"b":2,"c":[3,2,1]}');
  });
});

describe('canonicalizeToBytes', () => {
  it('returns UTF-8 encoded bytes of the canonical string', () => {
    const bytes = canonicalizeToBytes({ a: 1 });
    expect(new TextDecoder().decode(bytes)).toBe('{"a":1}');
  });
});
