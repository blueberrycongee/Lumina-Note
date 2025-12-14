/**
 * SM-2 间隔重复算法实现
 * 
 * 基于 SuperMemo 2 算法，用于计算下次复习时间
 * https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 */

import { SM2State, ReviewRating } from '../types/flashcard';

// ==================== 常量 ====================

/** 默认难度因子 */
export const DEFAULT_EASE = 2.5;

/** 最小难度因子 */
export const MIN_EASE = 1.3;

/** 新卡片初始状态 */
export const INITIAL_SM2_STATE: SM2State = {
  ease: DEFAULT_EASE,
  interval: 0,
  repetitions: 0,
  due: new Date().toISOString().split('T')[0],
};

// ==================== 核心算法 ====================

/**
 * SM-2 算法：根据评分计算下次复习状态
 * 
 * @param state 当前 SM-2 状态
 * @param rating 用户评分 (0-3)
 * @returns 新的 SM-2 状态
 */
export function calculateNextReview(
  state: SM2State,
  rating: ReviewRating
): SM2State {
  const today = new Date().toISOString().split('T')[0];
  
  // 评分 < 2 表示失败，重置进度
  if (rating < 2) {
    return {
      ease: Math.max(MIN_EASE, state.ease - 0.2),
      interval: 1,
      repetitions: 0,
      due: addDays(today, 1),
      lastReview: today,
    };
  }
  
  // 评分 >= 2 表示成功
  let newInterval: number;
  let newRepetitions = state.repetitions + 1;
  
  if (state.repetitions === 0) {
    // 第一次成功：1 天后复习
    newInterval = 1;
  } else if (state.repetitions === 1) {
    // 第二次成功：6 天后复习
    newInterval = 6;
  } else {
    // 后续成功：interval * ease
    newInterval = Math.round(state.interval * state.ease);
  }
  
  // 根据评分调整难度因子
  // Easy (3): +0.15, Good (2): 0, Hard (1): -0.15, Again (0): -0.2
  const easeAdjustment = 0.1 - (3 - rating) * (0.08 + (3 - rating) * 0.02);
  const newEase = Math.max(MIN_EASE, state.ease + easeAdjustment);
  
  // Easy 评分额外奖励：间隔 * 1.3
  if (rating === 3) {
    newInterval = Math.round(newInterval * 1.3);
  }
  
  return {
    ease: newEase,
    interval: newInterval,
    repetitions: newRepetitions,
    due: addDays(today, newInterval),
    lastReview: today,
  };
}

// ==================== 工具函数 ====================

/**
 * 日期加天数
 */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * 计算两个日期之间的天数差
 */
export function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 检查卡片是否到期
 */
export function isDue(dueDate: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return dueDate <= today;
}

/**
 * 检查是否是新卡片（从未复习过）
 */
export function isNewCard(state: SM2State): boolean {
  return state.repetitions === 0 && state.interval === 0;
}

/**
 * 获取卡片状态标签
 */
export function getCardStatus(state: SM2State): 'new' | 'learning' | 'review' | 'due' {
  if (isNewCard(state)) return 'new';
  if (state.interval < 21) return 'learning';
  if (isDue(state.due)) return 'due';
  return 'review';
}

/**
 * 预览不同评分的下次复习时间
 */
export function previewNextReview(state: SM2State): Record<ReviewRating, string> {
  return {
    0: calculateNextReview(state, 0).due,
    1: calculateNextReview(state, 1).due,
    2: calculateNextReview(state, 2).due,
    3: calculateNextReview(state, 3).due,
  };
}

/**
 * 格式化间隔显示
 */
export function formatInterval(days: number): string {
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  if (days < 7) return `${days}天`;
  if (days < 30) return `${Math.round(days / 7)}周`;
  if (days < 365) return `${Math.round(days / 30)}月`;
  return `${(days / 365).toFixed(1)}年`;
}

/**
 * 计算牌组统计
 */
export function calculateDeckStats(cards: SM2State[]): {
  total: number;
  new: number;
  learning: number;
  due: number;
  review: number;
} {
  const stats = { total: cards.length, new: 0, learning: 0, due: 0, review: 0 };
  
  for (const card of cards) {
    const status = getCardStatus(card);
    stats[status]++;
  }
  
  return stats;
}
