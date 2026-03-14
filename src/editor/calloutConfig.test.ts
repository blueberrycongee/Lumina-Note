import { describe, it, expect } from 'vitest';
import { resolveCalloutType, matchCalloutHeader, parseFoldModifier, isEmoji } from './calloutConfig';

describe('calloutConfig', () => {
  describe('resolveCalloutType', () => {
    it('resolves known types', () => {
      expect(resolveCalloutType('note')).toEqual({ icon: '📝', color: 'blue', label: 'Note' });
      expect(resolveCalloutType('tip')).toEqual({ icon: '💡', color: 'green', label: 'Tip' });
      expect(resolveCalloutType('warning')).toEqual({ icon: '⚠️', color: 'yellow', label: 'Warning' });
    });

    it('is case-insensitive', () => {
      expect(resolveCalloutType('NOTE')).toEqual({ icon: '📝', color: 'blue', label: 'Note' });
      expect(resolveCalloutType('Warning')).toEqual({ icon: '⚠️', color: 'yellow', label: 'Warning' });
    });

    it('resolves emoji types with blue default', () => {
      const result = resolveCalloutType('🔥');
      expect(result.icon).toBe('🔥');
      expect(result.color).toBe('blue');
      expect(result.label).toBe('');
    });

    it('falls back to gray for unknown types', () => {
      expect(resolveCalloutType('unknown')).toEqual({ icon: '📝', color: 'gray', label: 'Unknown' });
    });
  });

  describe('matchCalloutHeader', () => {
    it('matches basic callout', () => {
      const result = matchCalloutHeader('> [!note] My Title');
      expect(result).toEqual({ rawType: 'note', title: 'My Title', foldable: false, defaultFolded: false });
    });

    it('matches callout with + modifier', () => {
      const result = matchCalloutHeader('> [!tip]+ Expanded');
      expect(result).toEqual({ rawType: 'tip', title: 'Expanded', foldable: true, defaultFolded: false });
    });

    it('matches callout with - modifier', () => {
      const result = matchCalloutHeader('> [!warning]- Collapsed');
      expect(result).toEqual({ rawType: 'warning', title: 'Collapsed', foldable: true, defaultFolded: true });
    });

    it('uses type label as default title', () => {
      const result = matchCalloutHeader('> [!danger]');
      expect(result?.title).toBe('Danger');
    });

    it('returns null for non-callout lines', () => {
      expect(matchCalloutHeader('> regular quote')).toBeNull();
      expect(matchCalloutHeader('not a quote')).toBeNull();
    });
  });

  describe('parseFoldModifier', () => {
    it('parses + as open', () => {
      expect(parseFoldModifier('> [!note]+ Title')).toBe('open');
    });

    it('parses - as closed', () => {
      expect(parseFoldModifier('> [!note]- Title')).toBe('closed');
    });

    it('defaults to open when no modifier', () => {
      expect(parseFoldModifier('> [!note] Title')).toBe('open');
    });
  });

  describe('isEmoji', () => {
    it('detects emoji', () => {
      expect(isEmoji('🔥')).toBe(true);
      expect(isEmoji('💡')).toBe(true);
    });

    it('rejects non-emoji', () => {
      expect(isEmoji('note')).toBe(false);
      expect(isEmoji('abc')).toBe(false);
    });
  });
});
