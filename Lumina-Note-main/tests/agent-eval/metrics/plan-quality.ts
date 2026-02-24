/**
 * 计划质量评估
 * 
 * 评估维度：
 * 1. 计划存在性 - 是否创建了计划
 * 2. 计划合理性 - 步骤数是否在合理范围内
 * 3. 计划遵循度 - 是否按计划执行
 * 4. 计划效率 - 步骤是否冗余
 */

import type { TestCase, AgentResult, MetricResult, MetricEvaluator } from '../types';

export class PlanQualityMetric implements MetricEvaluator {
  name = 'plan_quality';

  async evaluate(testCase: TestCase, result: AgentResult): Promise<MetricResult> {
    const details: Record<string, unknown> = {};

    // 检查是否调用了 create_plan
    const createPlanCall = result.toolsCalled.find(t => t.name === 'create_plan');
    const hasPlan = !!createPlanCall || !!result.plan;
    details.planCreated = hasPlan;

    if (!hasPlan) {
      return {
        name: this.name,
        score: 0.3, // 没有计划给基础分
        passed: false,
        reason: '未创建执行计划',
        details
      };
    }

    const scores: number[] = [];

    // 1. 计划步骤数合理性（1-5 步最佳）
    const stepCount = result.plan?.steps.length || 0;
    let stepScore = 1;
    if (stepCount === 0) {
      stepScore = 0;
    } else if (stepCount > 5) {
      stepScore = Math.max(0.5, 1 - (stepCount - 5) * 0.1);
    } else if (stepCount === 1 && testCase.category === 'complex') {
      stepScore = 0.7; // 复杂任务只有 1 步可能不够
    }
    scores.push(stepScore);
    details.stepCount = {
      actual: stepCount,
      expected: testCase.expectedPlanSteps,
      score: stepScore
    };

    // 2. 计划遵循度 - 检查 update_plan_progress 调用
    const updateCalls = result.toolsCalled.filter(t => t.name === 'update_plan_progress');
    const completedSteps = result.plan?.steps.filter(s => s.completed).length || 0;
    
    let adherenceScore = 1;
    if (stepCount > 0) {
      // 理想情况：每个完成的步骤都有对应的 update_plan_progress 调用
      adherenceScore = Math.min(1, updateCalls.length / Math.max(1, completedSteps));
    }
    scores.push(adherenceScore);
    details.planAdherence = {
      updateCalls: updateCalls.length,
      completedSteps,
      score: adherenceScore
    };

    // 3. 计划完成度 - 完成的步骤比例
    const completionScore = stepCount > 0 ? completedSteps / stepCount : 0;
    scores.push(completionScore);
    details.planCompletion = {
      completed: completedSteps,
      total: stepCount,
      score: completionScore
    };

    // 4. 计划效率 - 检查是否有被 skip 的步骤或重复执行
    let efficiencyScore = 1;
    const skippedSteps = result.plan?.steps.filter(
      s => s.completed && result.toolsCalled.some(
        t => t.name === 'update_plan_progress' && 
             t.params.step_id === s.id && 
             t.params.status === 'skipped'
      )
    ).length || 0;
    
    if (skippedSteps > stepCount * 0.3) {
      efficiencyScore = 0.7; // 超过 30% 的步骤被跳过
    }
    scores.push(efficiencyScore);
    details.efficiency = {
      skippedSteps,
      score: efficiencyScore
    };

    // 计算平均分
    const totalScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const passed = totalScore >= 0.7;

    return {
      name: this.name,
      score: totalScore,
      passed,
      reason: this.generateReason(details),
      details
    };
  }

  private generateReason(details: Record<string, unknown>): string {
    const issues: string[] = [];
    
    const stepCount = (details.stepCount as any)?.actual || 0;
    const completionScore = (details.planCompletion as any)?.score || 0;
    const adherenceScore = (details.planAdherence as any)?.score || 0;

    if (stepCount > 5) {
      issues.push(`计划步骤过多(${stepCount}步)`);
    }
    if (completionScore < 0.8) {
      issues.push(`计划完成度低(${(completionScore * 100).toFixed(0)}%)`);
    }
    if (adherenceScore < 0.8) {
      issues.push(`计划遵循度低`);
    }

    if (issues.length === 0) {
      return '计划质量良好';
    }
    return issues.join(', ');
  }
}

/**
 * 带 LLM-as-Judge 的计划质量评估
 */
export class PlanQualityWithJudgeMetric implements MetricEvaluator {
  name = 'plan_quality_judge';
  
  constructor(private callLLM: (prompt: string) => Promise<string>) {}

  async evaluate(testCase: TestCase, result: AgentResult): Promise<MetricResult> {
    const basicMetric = new PlanQualityMetric();
    const basicResult = await basicMetric.evaluate(testCase, result);

    if (!result.plan || result.plan.steps.length === 0) {
      return basicResult;
    }

    // 使用 LLM 评判计划合理性
    const judgePrompt = `
你是一个计划评估专家。请评估以下 Agent 为任务创建的执行计划。

## 用户任务
${testCase.input}

## Agent 创建的计划
${result.plan.steps.map((s, i) => `${i + 1}. [${s.completed ? '✓' : ' '}] ${s.description}`).join('\n')}

## 请评估（0-10 分）
1. **逻辑性**：步骤之间是否逻辑清晰，顺序合理？
2. **完整性**：计划是否覆盖了完成任务所需的所有操作？
3. **效率性**：是否有冗余步骤？是否可以更简洁？
4. **可执行性**：每个步骤是否具体、可执行？

输出 JSON：
{
  "logic": 8,
  "completeness": 9,
  "efficiency": 7,
  "executability": 8,
  "feedback": "评价"
}
`;

    try {
      const response = await this.callLLM(judgePrompt);
      const judgeResult = JSON.parse(response);
      
      const llmScore = (
        judgeResult.logic + 
        judgeResult.completeness + 
        judgeResult.efficiency + 
        judgeResult.executability
      ) / 40;

      const combinedScore = basicResult.score * 0.4 + llmScore * 0.6;

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
      return basicResult;
    }
  }
}
