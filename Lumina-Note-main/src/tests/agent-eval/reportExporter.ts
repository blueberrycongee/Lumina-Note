/**
 * 详细测试报告导出器
 * 将测试结果导出为详细的本地文件
 */

import { TestCase } from './testCases';
import { AgentResult } from './types';

// 详细的执行记录
export interface ExecutionTrace {
  timestamp: string;
  type: 'llm_request' | 'llm_response' | 'tool_call' | 'tool_result' | 'plan' | 'status' | 'message';
  data: any;
}

// 完整的测试报告
export interface DetailedTestReport {
  // 测试信息
  testCase: TestCase;
  timestamp: string;
  
  // Agent 配置
  agentConfig: {
    provider: string;
    model: string;
    baseUrl: string | null;
    temperature: number;
    maxTokens: number;
  };
  
  // 执行链路（完整的调用过程）
  executionTrace: ExecutionTrace[];
  
  // Agent 结果
  agentResult: AgentResult;
  
  // LLM 评估
  evaluation: {
    prompt: string;
    llmResponse: string;
    scores: {
      taskCompletion: { score: number; reason: string };
      toolCorrectness: { score: number; reason: string };
      planQuality: { score: number; reason: string };
      outputQuality: { score: number; reason: string };
    };
    overallScore: number;
    overallReasoning: string;
  };
}

// 完整的实验报告
export interface FullExperimentReport {
  // 实验配置
  experiment: {
    name: string;
    description: string;
    startTime: string;
    endTime: string;
    workspacePath: string;
  };
  
  // AI 配置
  aiConfig: {
    provider: string;
    model: string;
    baseUrl: string | null;
  };
  
  // 测试结果
  tests: DetailedTestReport[];
  
  // 汇总
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    avgTaskCompletion: number;
    avgToolCorrectness: number;
    avgPlanQuality: number;
    avgOutputQuality: number;
    totalTokens: number;
    totalTime: number;
  };
}

/**
 * 生成完整的实验报告并下载为文件
 */
export async function saveDetailedReport(
  report: FullExperimentReport,
  _workspacePath: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `eval-report-${timestamp}.json`;
  
  // 格式化为可读的 JSON
  const content = JSON.stringify(report, null, 2);
  
  // 下载到本地
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  
  console.log(`📁 详细报告已下载: ${fileName}`);
  return fileName;
}

/**
 * 生成 Markdown 格式的报告
 */
export function generateMarkdownReport(report: FullExperimentReport): string {
  let md = `# Agent 评估报告

## 实验信息

- **名称**: ${report.experiment.name}
- **描述**: ${report.experiment.description || '无'}
- **开始时间**: ${report.experiment.startTime}
- **结束时间**: ${report.experiment.endTime}
- **测试库路径**: ${report.experiment.workspacePath}

## AI 配置

- **Provider**: ${report.aiConfig.provider}
- **Model**: ${report.aiConfig.model}
- **Base URL**: ${report.aiConfig.baseUrl || '默认'}

## 测试汇总

| 指标 | 值 |
|------|-----|
| 总测试数 | ${report.summary.total} |
| 通过 | ${report.summary.passed} |
| 失败 | ${report.summary.failed} |
| **通过率** | **${(report.summary.passRate * 100).toFixed(1)}%** |
| 平均任务完成度 | ${(report.summary.avgTaskCompletion * 100).toFixed(1)}% |
| 平均工具正确性 | ${(report.summary.avgToolCorrectness * 100).toFixed(1)}% |
| 平均计划质量 | ${(report.summary.avgPlanQuality * 100).toFixed(1)}% |
| 平均输出质量 | ${(report.summary.avgOutputQuality * 100).toFixed(1)}% |
| 总 Token 消耗 | ${report.summary.totalTokens} |
| 总耗时 | ${(report.summary.totalTime / 1000).toFixed(1)}s |

---

## 测试详情

`;

  for (const test of report.tests) {
    md += `### ${test.testCase.name} (${test.testCase.id})

**输入**: ${test.testCase.input}

**状态**: ${test.agentResult.finalStatus === 'completed' ? '✅ 完成' : '❌ ' + test.agentResult.finalStatus}

**耗时**: ${test.agentResult.completionTimeMs}ms

#### 执行计划
${test.agentResult.plan?.steps.map(s => `- [${s.completed ? 'x' : ' '}] ${s.description}`).join('\n') || '无计划'}

#### 工具调用
${test.agentResult.toolsCalled.map(t => `- \`${t.name}\`: ${t.success ? '✅' : '❌'}`).join('\n') || '无工具调用'}

#### Agent 输出
\`\`\`
${test.agentResult.actualOutput || '(无输出)'}
\`\`\`

#### LLM 评估

| 维度 | 分数 | 理由 |
|------|------|------|
| 任务完成 | ${test.evaluation.scores.taskCompletion.score} | ${test.evaluation.scores.taskCompletion.reason} |
| 工具正确 | ${test.evaluation.scores.toolCorrectness.score} | ${test.evaluation.scores.toolCorrectness.reason} |
| 计划质量 | ${test.evaluation.scores.planQuality.score} | ${test.evaluation.scores.planQuality.reason} |
| 输出质量 | ${test.evaluation.scores.outputQuality.score} | ${test.evaluation.scores.outputQuality.reason} |

**综合评分**: ${(test.evaluation.overallScore * 100).toFixed(1)}%

**评估理由**: ${test.evaluation.overallReasoning}

---

`;
  }

  return md;
}

/**
 * 下载 Markdown 报告
 */
export async function saveMarkdownReport(
  report: FullExperimentReport,
  _workspacePath: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `eval-report-${timestamp}.md`;
  
  const content = generateMarkdownReport(report);
  
  // 下载到本地
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  
  console.log(`📁 Markdown 报告已下载: ${fileName}`);
  return fileName;
}
