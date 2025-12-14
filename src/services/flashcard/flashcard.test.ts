/**
 * Flashcard 工具函数测试
 */
import { describe, it, expect } from 'vitest';
import {
  parseCloze,
  getClozeIndices,
  renderClozeFront,
  renderClozeBack,
  expandClozeCard,
  expandReversedCard,
} from './flashcard';

describe('Cloze 填空语法解析', () => {
  describe('parseCloze', () => {
    it('should parse single cloze', () => {
      const result = parseCloze('The {{c1::capital}} of France is Paris');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ index: 1, answer: 'capital', hint: undefined });
    });

    it('should parse multiple clozes', () => {
      const result = parseCloze('{{c1::Paris}} is the {{c2::capital}} of {{c3::France}}');
      expect(result).toHaveLength(3);
      expect(result[0].answer).toBe('Paris');
      expect(result[1].answer).toBe('capital');
      expect(result[2].answer).toBe('France');
    });

    it('should parse cloze with hint', () => {
      const result = parseCloze('The answer is {{c1::42::the meaning of life}}');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ 
        index: 1, 
        answer: '42', 
        hint: 'the meaning of life' 
      });
    });

    it('should handle duplicate cloze indices', () => {
      const result = parseCloze('{{c1::A}} and {{c1::B}} are both c1');
      expect(result).toHaveLength(2);
      expect(result[0].index).toBe(1);
      expect(result[1].index).toBe(1);
    });

    it('should return empty array for no clozes', () => {
      const result = parseCloze('No clozes here');
      expect(result).toEqual([]);
    });

    it('should handle empty string', () => {
      const result = parseCloze('');
      expect(result).toEqual([]);
    });
  });

  describe('getClozeIndices', () => {
    it('should return unique sorted indices', () => {
      const result = getClozeIndices('{{c3::C}} {{c1::A}} {{c2::B}} {{c1::A2}}');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should return empty array for no clozes', () => {
      const result = getClozeIndices('No clozes');
      expect(result).toEqual([]);
    });
  });

  describe('renderClozeFront', () => {
    it('should hide active cloze with [...]', () => {
      const text = 'The {{c1::capital}} of France';
      const result = renderClozeFront(text, 1);
      expect(result).toBe('The [...] of France');
    });

    it('should show hint if provided', () => {
      const text = 'Answer is {{c1::42::number}}';
      const result = renderClozeFront(text, 1);
      expect(result).toBe('Answer is [number]');
    });

    it('should show other clozes as answers', () => {
      const text = '{{c1::A}} and {{c2::B}}';
      const result = renderClozeFront(text, 1);
      expect(result).toBe('[...] and B');
    });

    it('should handle multiple same-index clozes', () => {
      const text = '{{c1::First}} and {{c1::Second}}';
      const result = renderClozeFront(text, 1);
      expect(result).toBe('[...] and [...]');
    });
  });

  describe('renderClozeBack', () => {
    it('should highlight active cloze', () => {
      const text = 'The {{c1::capital}} of France';
      const result = renderClozeBack(text, 1);
      expect(result).toBe('The **capital** of France');
    });

    it('should show other clozes without highlight', () => {
      const text = '{{c1::A}} and {{c2::B}}';
      const result = renderClozeBack(text, 1);
      expect(result).toBe('**A** and B');
    });
  });
});

describe('卡片生成', () => {
  describe('expandClozeCard', () => {
    it('should generate one card per cloze index', () => {
      const card = {
        type: 'cloze' as const,
        text: '{{c1::A}} {{c2::B}} {{c3::C}}',
        deck: 'Test Deck',
        source: 'test.md',
      };
      const result = expandClozeCard(card);
      expect(result).toHaveLength(3);
    });

    it('should not duplicate cards for same index', () => {
      const card = {
        type: 'cloze' as const,
        text: '{{c1::A}} and {{c1::B}}',
        deck: 'Test Deck',
      };
      const result = expandClozeCard(card);
      expect(result).toHaveLength(1);
    });

    it('should include deck and source in generated cards', () => {
      const card = {
        type: 'cloze' as const,
        text: '{{c1::Answer}}',
        deck: 'My Deck',
        source: 'source.md',
      };
      const result = expandClozeCard(card);
      expect(result[0].deck).toBe('My Deck');
      expect(result[0].source).toBe('source.md');
    });

    it('should set type to cloze', () => {
      const card = {
        type: 'cloze' as const,
        text: '{{c1::Answer}}',
        deck: 'Test',
      };
      const result = expandClozeCard(card);
      expect(result[0].type).toBe('cloze');
    });
  });

  describe('expandReversedCard', () => {
    it('should generate two cards (forward and reverse)', () => {
      const card = {
        front: 'Question',
        back: 'Answer',
        deck: 'Test Deck',
      };
      const result = expandReversedCard(card);
      expect(result).toHaveLength(2);
    });

    it('should have correct front/back for forward card', () => {
      const card = {
        front: 'Q',
        back: 'A',
        deck: 'Test',
      };
      const result = expandReversedCard(card);
      expect(result[0].front).toBe('Q');
      expect(result[0].back).toBe('A');
    });

    it('should have swapped front/back for reverse card', () => {
      const card = {
        front: 'Q',
        back: 'A',
        deck: 'Test',
      };
      const result = expandReversedCard(card);
      expect(result[1].front).toBe('A');
      expect(result[1].back).toBe('Q');
    });

    it('should include source in both cards', () => {
      const card = {
        front: 'Q',
        back: 'A',
        deck: 'Test',
        source: 'source.md',
      };
      const result = expandReversedCard(card);
      expect(result[0].source).toBe('source.md');
      expect(result[1].source).toBe('source.md');
    });
  });
});
