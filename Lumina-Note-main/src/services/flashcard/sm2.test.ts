/**
 * SM-2 间隔重复算法测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_EASE,
  MIN_EASE,
  INITIAL_SM2_STATE,
  calculateNextReview,
  addDays,
  daysBetween,
  isDue,
  isNewCard,
  getCardStatus,
  formatInterval,
  calculateDeckStats,
} from './sm2';
import type { SM2State } from '@/types/flashcard';

// Mock current date for consistent testing
// const MOCK_TODAY = '2024-01-15'; // TODO: 用于未来的日期相关测试

describe('SM-2 Algorithm Constants', () => {
  it('should have correct default ease factor', () => {
    expect(DEFAULT_EASE).toBe(2.5);
  });

  it('should have correct minimum ease factor', () => {
    expect(MIN_EASE).toBe(1.3);
  });

  it('should have correct initial state structure', () => {
    expect(INITIAL_SM2_STATE.ease).toBe(DEFAULT_EASE);
    expect(INITIAL_SM2_STATE.interval).toBe(0);
    expect(INITIAL_SM2_STATE.repetitions).toBe(0);
  });
});

describe('addDays', () => {
  it('should add days to a date', () => {
    expect(addDays('2024-01-15', 1)).toBe('2024-01-16');
    expect(addDays('2024-01-15', 7)).toBe('2024-01-22');
    expect(addDays('2024-01-15', 30)).toBe('2024-02-14');
  });

  it('should handle month boundaries', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // 2024 is leap year
  });

  it('should handle year boundaries', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
  });
});

describe('daysBetween', () => {
  it('should calculate days between dates', () => {
    expect(daysBetween('2024-01-15', '2024-01-16')).toBe(1);
    expect(daysBetween('2024-01-15', '2024-01-22')).toBe(7);
    expect(daysBetween('2024-01-01', '2024-12-31')).toBe(365); // Leap year
  });

  it('should handle same date', () => {
    expect(daysBetween('2024-01-15', '2024-01-15')).toBe(0);
  });

  it('should handle negative difference', () => {
    expect(daysBetween('2024-01-16', '2024-01-15')).toBe(-1);
  });
});

describe('isDue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return true for past due dates', () => {
    expect(isDue('2024-01-14')).toBe(true);
    expect(isDue('2024-01-01')).toBe(true);
  });

  it('should return true for today', () => {
    expect(isDue('2024-01-15')).toBe(true);
  });

  it('should return false for future dates', () => {
    expect(isDue('2024-01-16')).toBe(false);
    expect(isDue('2024-02-01')).toBe(false);
  });
});

describe('isNewCard', () => {
  it('should return true for new cards', () => {
    const newCard: SM2State = {
      ease: DEFAULT_EASE,
      interval: 0,
      repetitions: 0,
      due: '2024-01-15',
    };
    expect(isNewCard(newCard)).toBe(true);
  });

  it('should return false for reviewed cards', () => {
    const reviewedCard: SM2State = {
      ease: DEFAULT_EASE,
      interval: 1,
      repetitions: 1,
      due: '2024-01-16',
    };
    expect(isNewCard(reviewedCard)).toBe(false);
  });
});

describe('getCardStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "new" for new cards', () => {
    const card: SM2State = {
      ease: DEFAULT_EASE,
      interval: 0,
      repetitions: 0,
      due: '2024-01-15',
    };
    expect(getCardStatus(card)).toBe('new');
  });

  it('should return "learning" for cards with short interval', () => {
    const card: SM2State = {
      ease: DEFAULT_EASE,
      interval: 6,
      repetitions: 2,
      due: '2024-01-21',
    };
    expect(getCardStatus(card)).toBe('learning');
  });

  it('should return "due" for overdue cards', () => {
    const card: SM2State = {
      ease: DEFAULT_EASE,
      interval: 30,
      repetitions: 5,
      due: '2024-01-10',
    };
    expect(getCardStatus(card)).toBe('due');
  });

  it('should return "review" for cards with long interval not yet due', () => {
    const card: SM2State = {
      ease: DEFAULT_EASE,
      interval: 30,
      repetitions: 5,
      due: '2024-02-15',
    };
    expect(getCardStatus(card)).toBe('review');
  });
});

describe('calculateNextReview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Failed review (rating < 2)', () => {
    it('should reset progress on Again (0)', () => {
      const state: SM2State = {
        ease: 2.5,
        interval: 10,
        repetitions: 3,
        due: '2024-01-15',
      };

      const result = calculateNextReview(state, 0);

      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
      expect(result.ease).toBeLessThan(state.ease);
      expect(result.due).toBe('2024-01-16');
    });

    it('should reset progress on Hard (1)', () => {
      const state: SM2State = {
        ease: 2.5,
        interval: 10,
        repetitions: 3,
        due: '2024-01-15',
      };

      const result = calculateNextReview(state, 1);

      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
    });

    it('should not reduce ease below minimum', () => {
      const state: SM2State = {
        ease: MIN_EASE,
        interval: 1,
        repetitions: 0,
        due: '2024-01-15',
      };

      const result = calculateNextReview(state, 0);

      expect(result.ease).toBe(MIN_EASE);
    });
  });

  describe('Successful review (rating >= 2)', () => {
    it('should set 1 day interval on first success', () => {
      const state: SM2State = {
        ease: 2.5,
        interval: 0,
        repetitions: 0,
        due: '2024-01-15',
      };

      const result = calculateNextReview(state, 2);

      expect(result.repetitions).toBe(1);
      expect(result.interval).toBe(1);
      expect(result.due).toBe('2024-01-16');
    });

    it('should set 6 day interval on second success', () => {
      const state: SM2State = {
        ease: 2.5,
        interval: 1,
        repetitions: 1,
        due: '2024-01-16',
      };

      const result = calculateNextReview(state, 2);

      expect(result.repetitions).toBe(2);
      expect(result.interval).toBe(6);
      expect(result.due).toBe('2024-01-21');
    });

    it('should multiply interval by ease on subsequent successes', () => {
      const state: SM2State = {
        ease: 2.5,
        interval: 6,
        repetitions: 2,
        due: '2024-01-21',
      };

      const result = calculateNextReview(state, 2);

      expect(result.repetitions).toBe(3);
      expect(result.interval).toBe(15); // 6 * 2.5 = 15
    });

    it('should give bonus for Easy (3) rating', () => {
      const state: SM2State = {
        ease: 2.5,
        interval: 6,
        repetitions: 2,
        due: '2024-01-21',
      };

      const resultGood = calculateNextReview(state, 2);
      const resultEasy = calculateNextReview(state, 3);

      expect(resultEasy.interval).toBeGreaterThan(resultGood.interval);
      expect(resultEasy.ease).toBeGreaterThan(resultGood.ease);
    });
  });
});

describe('formatInterval', () => {
  it('should format today', () => {
    expect(formatInterval(0)).toBe('今天');
  });

  it('should format tomorrow', () => {
    expect(formatInterval(1)).toBe('明天');
  });

  it('should format days', () => {
    expect(formatInterval(3)).toBe('3天');
    expect(formatInterval(6)).toBe('6天');
  });

  it('should format weeks', () => {
    expect(formatInterval(7)).toBe('1周');
    expect(formatInterval(14)).toBe('2周');
    expect(formatInterval(21)).toBe('3周');
  });

  it('should format months', () => {
    expect(formatInterval(30)).toBe('1月');
    expect(formatInterval(60)).toBe('2月');
    expect(formatInterval(90)).toBe('3月');
  });

  it('should format years', () => {
    expect(formatInterval(365)).toBe('1.0年');
    expect(formatInterval(730)).toBe('2.0年');
  });
});

describe('calculateDeckStats', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should count cards by status', () => {
    const cards: SM2State[] = [
      // New cards
      { ease: 2.5, interval: 0, repetitions: 0, due: '2024-01-15' },
      { ease: 2.5, interval: 0, repetitions: 0, due: '2024-01-15' },
      // Learning cards
      { ease: 2.5, interval: 6, repetitions: 2, due: '2024-01-21' },
      // Due cards
      { ease: 2.5, interval: 30, repetitions: 5, due: '2024-01-10' },
      // Review cards (not due)
      { ease: 2.5, interval: 30, repetitions: 5, due: '2024-02-15' },
    ];

    const stats = calculateDeckStats(cards);

    expect(stats.total).toBe(5);
    expect(stats.new).toBe(2);
    expect(stats.learning).toBe(1);
    expect(stats.due).toBe(1);
    expect(stats.review).toBe(1);
  });

  it('should handle empty deck', () => {
    const stats = calculateDeckStats([]);

    expect(stats.total).toBe(0);
    expect(stats.new).toBe(0);
    expect(stats.learning).toBe(0);
    expect(stats.due).toBe(0);
    expect(stats.review).toBe(0);
  });
});
