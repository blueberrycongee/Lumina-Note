/**
 * 任务完成度评估
 * 
 * 评估维度：
 * 1. 最终状态是否为 completed
 * 2. 计划步骤完成比例（Milestone KPI）
 * 3. LLM-as-Judge 评判结果质量（可选）
 */

import type { TestCase, AgentResult, MetricResult, MetricEvaluator } from '../types';

export class TaskCompletionMetric implements MetricEvaluator {
  name = 'task_completion';

  async evaluate(testCase: TestCase, result: AgentResult): Promise<MetricResult> {
    const scores: number[] = [];
    const details: Record<string, unknown> = {};

    // 1. 最终状态检查（权重 40%）
    const statusScore = result.finalStatus === 'completed' ? 1 : 0;
    scores.push(statusScore * 0.4);
    details.finalStatus = result.finalStatus;

    // 2. 计划步骤完成率（权重 40%）
    let milestoneScore = 1;
    if (result.plan && result.plan.steps.length > 0) {
      const completedSteps = result.plan.steps.filter(s => s.completed).length;
      milestoneScore = completedSteps / result.plan.steps.length;
      details.planSteps = {
        total: result.plan.steps.length,
        completed: completedSteps,
        rate: milestoneScore
      };
    }
    scores.push(milestoneScore * 0.4);

    // 3. attempt_completion 是否被调用（权重 20%）
    const hasCompletion = result.toolsCalled.some(t => t.name === 'attempt_completion');
    const completionScore = hasCompletion ? 1 : 0;
    scores.push(completionScore * 0.2);
    details.attemptCompletionCalled = hasCompletion;

    // 计算总分
    const totalScore = scores.reduce((a, b) => a + b, 0);
    
    // 判断是否通过（阈值 0.7）
    const passed = totalScore >= 0.7;

    return {
      name: this.name,
      score: totalScore,
      passed,
      reason: passed 
        ? '任务成功完成' 
        : `任务未完成：状态=${result.finalStatus}, 步骤完成率=${(milestoneScore * 100).toFixed(0)}%`,
      details
    };
  }
}

/**
 * 带 LLM-as-Judge 的增强版任务完成度评估
 * 用于需要主观判断的场景
 */
export class TaskCompletionWithJudgeMetric implements MetricEvaluator {
  name = 'task_completion_judge';
  
  constructor(private callLLM: (prompt: string) => Promise<string>) {}

  async evaluate(testCase: TestCase, result: AgentResult): Promise<MetricResult> {
    // 先做基础评估
    const basicMetric = new TaskCompletionMetric();
    const basicResult = await basicMetric.evaluate(testCase, result);

    // 如果有评估标准，使用 LLM 评判
    if (testCase.evaluationCriteria && testCase.evaluationCriteria.length > 0) {
      const judgePrompt = `
你是一个 Agent 评估专家。请评估以下任务执行结果。

## 用户任务
${testCase.input}

## Agent 最终输出
${result.actualOutput}

## 评估标准
${testCase.evaluationCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## 请评估
针对每个评估标准，判断是否满足（是/否），并给出总体评分（0-10）。

输出 JSON 格式：
{
  "criteriaResults": [
    {"criterion": "标准1", "met": true/false, "reason": "原因"}
  ],
  "overallScore": 8,
  "feedback": "总体评价"
}
`;

      try {
        const response = await this.callLLM(judgePrompt);
        const judgeResult = JSON.parse(response);
        
        // 计算 LLM 评判分数（归一化到 0-1）
        const llmScore = judgeResult.overallScore / 10;
        
        // 综合基础分数和 LLM 分数（各 50%）
        const combinedScore = basicResult.score * 0.5 + llmScore * 0.5;

        return {
          name: this.name,
          score: combinedScore,
          passed: combinedScore >= 0.7,
          reason: judgeResult.feedback,
          details: {
            ...basicResult.details,
            llmJudge: judgeResult
          }
        };
      } catch (e) {
        // LLM 评判失败，回退到基础评估
        return basicResult;
      }
    }

    return basicResult;
  }
}
