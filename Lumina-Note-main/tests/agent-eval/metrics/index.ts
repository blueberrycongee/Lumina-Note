/**
 * 评估指标索引
 */

export { TaskCompletionMetric, TaskCompletionWithJudgeMetric } from './task-completion';
export { ToolCorrectnessMetric, ToolParameterAccuracyMetric } from './tool-correctness';
export { PlanQualityMetric, PlanQualityWithJudgeMetric } from './plan-quality';
export { EfficiencyMetric } from './efficiency';

import type { MetricEvaluator, TestCase, AgentResult, MetricResult } from '../types';
import { TaskCompletionMetric } from './task-completion';
import { ToolCorrectnessMetric } from './tool-correctness';
import { PlanQualityMetric } from './plan-quality';
import { EfficiencyMetric } from './efficiency';

/** 标准评估指标集 */
export function createStandardMetrics(): MetricEvaluator[] {
  return [
    new TaskCompletionMetric(),
    new ToolCorrectnessMetric(),
    new PlanQualityMetric(),
    new EfficiencyMetric()
  ];
}

/** 运行所有指标评估 */
export async function evaluateAll(
  testCase: TestCase, 
  result: AgentResult,
  metrics?: MetricEvaluator[]
): Promise<Record<string, MetricResult>> {
  const evaluators = metrics || createStandardMetrics();
  const results: Record<string, MetricResult> = {};

  for (const metric of evaluators) {
    results[metric.name] = await metric.evaluate(testCase, result);
  }

  return results;
}

/** 计算综合得分 */
export function calculateOverallScore(
  results: Record<string, MetricResult>,
  weights?: Record<string, number>
): number {
  const defaultWeights: Record<string, number> = {
    task_completion: 0.35,
    tool_correctness: 0.25,
    plan_quality: 0.25,
    efficiency: 0.15
  };

  const w = weights || defaultWeights;
  let totalScore = 0;
  let totalWeight = 0;

  for (const [name, result] of Object.entries(results)) {
    const weight = w[name] || 0.1;
    totalScore += result.score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? totalScore / totalWeight : 0;
}
