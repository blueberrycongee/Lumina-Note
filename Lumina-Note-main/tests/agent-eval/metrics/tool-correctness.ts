/**
 * 工具调用正确性评估
 * 
 * 参考 DeepEval 的 ToolCorrectnessMetric
 * 
 * 评估维度：
 * 1. Tool Selection - 是否选择了正确的工具
 * 2. Parameter Accuracy - 参数是否正确
 * 3. Execution Success - 工具执行是否成功
 * 4. Tool Efficacy - 工具调用是否有效推进任务
 */

import type { TestCase, AgentResult, MetricResult, MetricEvaluator, ToolCall } from '../types';

export interface ToolCorrectnessConfig {
  /** 是否考虑工具调用顺序 */
  considerOrdering?: boolean;
  /** 是否允许额外的工具调用 */
  allowExtraTools?: boolean;
  /** 权重配置 */
  weights?: {
    selection: number;
    execution: number;
    efficacy: number;
  };
}

const DEFAULT_CONFIG: ToolCorrectnessConfig = {
  considerOrdering: false,
  allowExtraTools: true,
  weights: {
    selection: 0.5,
    execution: 0.3,
    efficacy: 0.2
  }
};

export class ToolCorrectnessMetric implements MetricEvaluator {
  name = 'tool_correctness';
  private config: ToolCorrectnessConfig;

  constructor(config: Partial<ToolCorrectnessConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async evaluate(testCase: TestCase, result: AgentResult): Promise<MetricResult> {
    const details: Record<string, unknown> = {};
    const weights = this.config.weights!;

    // 获取实际调用的工具名列表
    const actualTools = result.toolsCalled.map(t => t.name);
    const expectedTools = testCase.expectedTools || [];

    // 1. Tool Selection 评估
    let selectionScore = 1;
    if (expectedTools.length > 0) {
      if (this.config.considerOrdering && testCase.expectedToolSequence) {
        // 严格顺序匹配
        selectionScore = this.evaluateSequence(actualTools, testCase.expectedToolSequence);
      } else {
        // 集合匹配（忽略顺序和频率）
        selectionScore = this.evaluateSet(actualTools, expectedTools);
      }
    }
    details.toolSelection = {
      expected: expectedTools,
      actual: actualTools,
      score: selectionScore
    };

    // 2. Execution Success 评估
    const successfulCalls = result.toolsCalled.filter(t => t.success).length;
    const executionScore = result.toolsCalled.length > 0 
      ? successfulCalls / result.toolsCalled.length 
      : 1;
    details.executionSuccess = {
      total: result.toolsCalled.length,
      successful: successfulCalls,
      score: executionScore
    };

    // 3. Tool Efficacy 评估
    // 检查是否有无效调用（调用了但没有推进任务）
    const efficacyScore = this.evaluateEfficacy(result.toolsCalled);
    details.efficacy = {
      score: efficacyScore
    };

    // 计算加权总分
    const totalScore = 
      selectionScore * weights.selection +
      executionScore * weights.execution +
      efficacyScore * weights.efficacy;

    const passed = totalScore >= 0.7;

    return {
      name: this.name,
      score: totalScore,
      passed,
      reason: this.generateReason(selectionScore, executionScore, efficacyScore),
      details
    };
  }

  /** 集合匹配评估 */
  private evaluateSet(actual: string[], expected: string[]): number {
    if (expected.length === 0) return 1;

    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);

    // 计算覆盖率：实际调用覆盖了多少预期工具
    let covered = 0;
    for (const tool of expectedSet) {
      if (actualSet.has(tool)) covered++;
    }
    const recall = covered / expectedSet.size;

    // 如果不允许额外工具，计算精确率
    if (!this.config.allowExtraTools) {
      const extraTools = actual.filter(t => !expectedSet.has(t));
      const precision = extraTools.length === 0 ? 1 : covered / actual.length;
      return (recall + precision) / 2;
    }

    return recall;
  }

  /** 序列匹配评估 */
  private evaluateSequence(actual: string[], expected: string[]): number {
    if (expected.length === 0) return 1;
    if (actual.length === 0) return 0;

    // 使用最长公共子序列（LCS）算法
    const m = actual.length;
    const n = expected.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (actual[i - 1] === expected[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const lcsLength = dp[m][n];
    return lcsLength / expected.length;
  }

  /** 工具效能评估 */
  private evaluateEfficacy(toolsCalled: ToolCall[]): number {
    if (toolsCalled.length === 0) return 1;

    // 检查是否有重复的失败调用（同样的工具、同样的错误）
    const failedPatterns = new Map<string, number>();
    let ineffectiveCalls = 0;

    for (const call of toolsCalled) {
      if (!call.success) {
        const pattern = `${call.name}:${call.output}`;
        const count = failedPatterns.get(pattern) || 0;
        if (count > 0) {
          // 重复的失败调用视为无效
          ineffectiveCalls++;
        }
        failedPatterns.set(pattern, count + 1);
      }
    }

    return 1 - (ineffectiveCalls / toolsCalled.length);
  }

  private generateReason(selection: number, execution: number, efficacy: number): string {
    const issues: string[] = [];
    
    if (selection < 0.7) {
      issues.push(`工具选择不准确(${(selection * 100).toFixed(0)}%)`);
    }
    if (execution < 0.9) {
      issues.push(`执行成功率偏低(${(execution * 100).toFixed(0)}%)`);
    }
    if (efficacy < 0.8) {
      issues.push(`存在无效调用(效能${(efficacy * 100).toFixed(0)}%)`);
    }

    if (issues.length === 0) {
      return '工具调用正确';
    }
    return issues.join(', ');
  }
}

/**
 * 工具参数准确性评估（需要预期参数定义）
 */
export class ToolParameterAccuracyMetric implements MetricEvaluator {
  name = 'tool_parameter_accuracy';

  async evaluate(testCase: TestCase, result: AgentResult): Promise<MetricResult> {
    // 这个指标需要预定义的预期参数，适用于更严格的场景
    // 对于 Lumina Note，主要关注路径参数是否正确

    let correctParams = 0;
    let totalParams = 0;

    for (const call of result.toolsCalled) {
      // 检查路径参数格式
      if (call.params.path) {
        totalParams++;
        const path = call.params.path as string;
        // 路径应该是相对路径，不应包含绝对路径
        if (!path.includes(':') && !path.startsWith('/')) {
          correctParams++;
        }
      }

      // 检查 edit_note 的 old_string 是否存在
      if (call.name === 'edit_note') {
        totalParams++;
        if (call.params.old_string && call.params.new_string) {
          correctParams++;
        }
      }
    }

    const score = totalParams > 0 ? correctParams / totalParams : 1;

    return {
      name: this.name,
      score,
      passed: score >= 0.8,
      reason: score >= 0.8 ? '参数格式正确' : '部分参数格式有误',
      details: { correctParams, totalParams }
    };
  }
}
