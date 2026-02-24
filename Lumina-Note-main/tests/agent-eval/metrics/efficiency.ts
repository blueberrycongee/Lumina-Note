/**
 * 效率指标评估
 * 
 * 评估维度：
 * 1. Token 消耗
 * 2. 响应时间
 * 3. 循环迭代次数
 * 4. 工具调用次数
 */

import type { TestCase, AgentResult, MetricResult, MetricEvaluator } from '../types';

export interface EfficiencyThresholds {
  /** 最大 Token 数 */
  maxTokens: number;
  /** 最大响应时间（ms） */
  maxTimeMs: number;
  /** 最大循环次数 */
  maxLoopIterations: number;
  /** 最大工具调用次数 */
  maxToolCalls: number;
}

const DEFAULT_THRESHOLDS: EfficiencyThresholds = {
  maxTokens: 10000,
  maxTimeMs: 60000,      // 60 秒
  maxLoopIterations: 10,
  maxToolCalls: 20
};

export class EfficiencyMetric implements MetricEvaluator {
  name = 'efficiency';
  private thresholds: EfficiencyThresholds;

  constructor(thresholds: Partial<EfficiencyThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  async evaluate(testCase: TestCase, result: AgentResult): Promise<MetricResult> {
    const details: Record<string, unknown> = {};
    const scores: number[] = [];

    // 使用测试用例的阈值覆盖默认值
    const maxTokens = testCase.maxTokens || this.thresholds.maxTokens;
    const maxTimeMs = testCase.maxTimeMs || this.thresholds.maxTimeMs;
    const maxLoopIterations = testCase.maxLoopIterations || this.thresholds.maxLoopIterations;

    // 1. Token 效率
    const tokenScore = this.calculateScore(
      result.tokenUsage.total,
      maxTokens,
      { softLimit: 0.7, hardLimit: 1.5 }
    );
    scores.push(tokenScore);
    details.tokenUsage = {
      actual: result.tokenUsage.total,
      threshold: maxTokens,
      score: tokenScore
    };

    // 2. 时间效率
    const timeScore = this.calculateScore(
      result.completionTimeMs,
      maxTimeMs,
      { softLimit: 0.7, hardLimit: 2.0 }
    );
    scores.push(timeScore);
    details.time = {
      actual: result.completionTimeMs,
      threshold: maxTimeMs,
      score: timeScore
    };

    // 3. 循环效率
    const loopScore = this.calculateScore(
      result.loopIterations,
      maxLoopIterations,
      { softLimit: 0.5, hardLimit: 1.0 }
    );
    scores.push(loopScore);
    details.loops = {
      actual: result.loopIterations,
      threshold: maxLoopIterations,
      score: loopScore
    };

    // 4. 工具调用效率
    const toolCallScore = this.calculateScore(
      result.toolsCalled.length,
      this.thresholds.maxToolCalls,
      { softLimit: 0.5, hardLimit: 1.5 }
    );
    scores.push(toolCallScore);
    details.toolCalls = {
      actual: result.toolsCalled.length,
      threshold: this.thresholds.maxToolCalls,
      score: toolCallScore
    };

    // 计算平均分
    const totalScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const passed = totalScore >= 0.6;

    return {
      name: this.name,
      score: totalScore,
      passed,
      reason: this.generateReason(details),
      details
    };
  }

  /**
   * 计算效率分数
   * @param actual 实际值
   * @param threshold 阈值
   * @param limits softLimit: 超过此比例开始扣分, hardLimit: 超过此比例得 0 分
   */
  private calculateScore(
    actual: number,
    threshold: number,
    limits: { softLimit: number; hardLimit: number }
  ): number {
    const ratio = actual / threshold;

    if (ratio <= limits.softLimit) {
      return 1;
    } else if (ratio >= limits.hardLimit) {
      return 0;
    } else {
      // 线性衰减
      return 1 - (ratio - limits.softLimit) / (limits.hardLimit - limits.softLimit);
    }
  }

  private generateReason(details: Record<string, unknown>): string {
    const issues: string[] = [];

    const tokenScore = (details.tokenUsage as any)?.score || 1;
    const timeScore = (details.time as any)?.score || 1;
    const loopScore = (details.loops as any)?.score || 1;

    if (tokenScore < 0.7) {
      const actual = (details.tokenUsage as any)?.actual;
      issues.push(`Token 消耗过高(${actual})`);
    }
    if (timeScore < 0.7) {
      const actual = (details.time as any)?.actual;
      issues.push(`响应时间过长(${(actual / 1000).toFixed(1)}s)`);
    }
    if (loopScore < 0.7) {
      const actual = (details.loops as any)?.actual;
      issues.push(`循环次数过多(${actual}次)`);
    }

    if (issues.length === 0) {
      return '效率良好';
    }
    return issues.join(', ');
  }
}
