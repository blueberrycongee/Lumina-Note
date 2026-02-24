/**
 * LLM-as-Judge 评估器
 * 使用 LLM 来评估 Agent 的任务完成度
 */

import { useAIStore } from '@/stores/useAIStore';
import { TestCase } from './testCases';
import { AgentResult, MetricResult } from './types';

export interface LLMEvalResult {
  taskCompletion: MetricResult;
  toolCorrectness: MetricResult;
  planQuality: MetricResult;
  outputQuality: MetricResult;
  overallScore: number;
  llmReasoning: string;
  // 详细信息（用于报告）
  evalPrompt: string;
  llmRawResponse: string;
  rawScores: {
    taskCompletion: { score: number; reason: string };
    toolCorrectness: { score: number; reason: string };
    planQuality: { score: number; reason: string };
    outputQuality: { score: number; reason: string };
  };
}

/**
 * 调用 LLM API 进行评估
 */
async function callLLMForEval(prompt: string): Promise<string> {
  const config = useAIStore.getState().config;
  
  if (!config.apiKey) {
    throw new Error('未配置 API Key');
  }

  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const model = config.model === 'custom' ? config.customModelId : config.model;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `你是一个专业的 AI Agent 评估专家。你的任务是评估一个笔记管理 Agent 的任务完成情况。
请严格按照评估标准打分，给出 0-100 的分数和详细理由。
输出格式必须是 JSON，包含以下字段：
{
  "task_completion": { "score": 0-100, "reason": "理由" },
  "tool_correctness": { "score": 0-100, "reason": "理由" },
  "plan_quality": { "score": 0-100, "reason": "理由" },
  "output_quality": { "score": 0-100, "reason": "理由" },
  "overall_reasoning": "整体评价"
}`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API 调用失败: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

/**
 * 构建评估 Prompt
 */
function buildEvalPrompt(testCase: TestCase, result: AgentResult): string {
  const toolsCalled = result.toolsCalled.map(t => 
    `- ${t.name}(${JSON.stringify(t.params).slice(0, 100)}...) → ${t.success ? '成功' : '失败'}`
  ).join('\n');

  const planSteps = result.plan?.steps.map(s => 
    `- [${s.completed ? '✓' : ' '}] ${s.description}`
  ).join('\n') || '(无计划)';

  return `
## 评估任务

### 测试用例
- **ID**: ${testCase.id}
- **类别**: ${testCase.category}
- **名称**: ${testCase.name}

### 用户输入
${testCase.input}

### 评估标准
${testCase.evaluationCriteria?.join('\n') || '完成用户请求的任务'}

### 期望工具
${testCase.expectedTools?.join(', ') || '(未指定)'}

---

## Agent 执行结果

### 最终状态
${result.finalStatus}

### 执行计划
${planSteps}

### 工具调用记录
${toolsCalled || '(无工具调用)'}

### Agent 输出
${result.actualOutput?.slice(0, 500) || '(无输出)'}

### Token 使用
- Prompt: ${result.tokenUsage.prompt}
- Completion: ${result.tokenUsage.completion}
- Total: ${result.tokenUsage.total}

### 执行时间
${result.completionTimeMs}ms

---

## 评估标准

1. **任务完成度 (task_completion)**: Agent 是否正确理解并完成了用户的请求？
2. **工具正确性 (tool_correctness)**: Agent 是否选择了正确的工具？工具调用是否成功？
3. **计划质量 (plan_quality)**: 计划是否合理、完整、步骤清晰？
4. **输出质量 (output_quality)**: 最终输出是否有帮助、准确、格式良好？

请根据以上信息进行评估，输出 JSON 格式的评分结果。
`;
}

/**
 * 解析 LLM 评估结果
 */
function parseEvalResult(llmResponse: string, evalPrompt: string): LLMEvalResult | null {
  try {
    // 提取 JSON
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    const toMetric = (name: string, data: { score: number; reason: string }): MetricResult => ({
      name,
      score: (data.score || 0) / 100,
      passed: (data.score || 0) >= 70,
      reason: data.reason || '',
    });

    const rawScores = {
      taskCompletion: parsed.task_completion || { score: 0, reason: '解析失败' },
      toolCorrectness: parsed.tool_correctness || { score: 0, reason: '解析失败' },
      planQuality: parsed.plan_quality || { score: 0, reason: '解析失败' },
      outputQuality: parsed.output_quality || { score: 0, reason: '解析失败' },
    };

    return {
      taskCompletion: toMetric('task_completion', rawScores.taskCompletion),
      toolCorrectness: toMetric('tool_correctness', rawScores.toolCorrectness),
      planQuality: toMetric('plan_quality', rawScores.planQuality),
      outputQuality: toMetric('output_quality', rawScores.outputQuality),
      overallScore: (
        (rawScores.taskCompletion.score || 0) +
        (rawScores.toolCorrectness.score || 0) +
        (rawScores.planQuality.score || 0) +
        (rawScores.outputQuality.score || 0)
      ) / 400,
      llmReasoning: parsed.overall_reasoning || '',
      evalPrompt,
      llmRawResponse: llmResponse,
      rawScores,
    };
  } catch (e) {
    console.error('解析 LLM 评估结果失败:', e);
    return null;
  }
}

/**
 * 使用 LLM 评估 Agent 结果
 */
export async function evaluateWithLLM(
  testCase: TestCase,
  result: AgentResult
): Promise<LLMEvalResult> {
  console.log(`🤖 [LLM Eval] 评估测试: ${testCase.id}`);
  
  const prompt = buildEvalPrompt(testCase, result);
  
  try {
    const llmResponse = await callLLMForEval(prompt);
    
    console.log(`🤖 [LLM Eval] 收到响应`);
    
    const evalResult = parseEvalResult(llmResponse, prompt);
    
    if (evalResult) {
      console.log(`🤖 [LLM Eval] 评分: ${(evalResult.overallScore * 100).toFixed(1)}%`);
      return evalResult;
    }
    
    // 解析失败，返回默认结果
    return getDefaultEvalResult('LLM 响应解析失败', prompt, llmResponse);
  } catch (error) {
    console.error(`🤖 [LLM Eval] 评估失败:`, error);
    return getDefaultEvalResult(String(error), prompt, '');
  }
}

/**
 * 获取默认评估结果（当 LLM 评估失败时使用）
 */
function getDefaultEvalResult(reason: string, evalPrompt: string, llmRawResponse: string): LLMEvalResult {
  const defaultMetric = (name: string): MetricResult => ({
    name,
    score: 0,
    passed: false,
    reason: `LLM 评估失败: ${reason}`,
  });

  const defaultScore = { score: 0, reason: `LLM 评估失败: ${reason}` };

  return {
    taskCompletion: defaultMetric('task_completion'),
    toolCorrectness: defaultMetric('tool_correctness'),
    planQuality: defaultMetric('plan_quality'),
    outputQuality: defaultMetric('output_quality'),
    overallScore: 0,
    llmReasoning: reason,
    evalPrompt,
    llmRawResponse,
    rawScores: {
      taskCompletion: defaultScore,
      toolCorrectness: defaultScore,
      planQuality: defaultScore,
      outputQuality: defaultScore,
    },
  };
}

/**
 * 检查是否启用 LLM 评估
 */
export function isLLMEvalEnabled(): boolean {
  const config = useAIStore.getState().config;
  return !!config.apiKey;
}
