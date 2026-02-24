/**
 * Agent 评估运行器
 * 
 * 用法：
 *   npx ts-node tests/agent-eval/runner.ts
 *   npx ts-node tests/agent-eval/runner.ts --category=basic
 *   npx ts-node tests/agent-eval/runner.ts --report
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { TestCase, AgentResult, EvalResult, EvalReport, EvalConfig } from './types';
import { evaluateAll, calculateOverallScore } from './metrics';

// ============ 配置 ============

const DEFAULT_CONFIG: EvalConfig = {
  agentConfig: {
    provider: process.env.AGENT_PROVIDER || 'openai',
    model: process.env.AGENT_MODEL || 'gpt-4o-mini',
    apiKey: process.env.AGENT_API_KEY || '',
  },
  testVaultPath: path.join(__dirname, 'fixtures', 'test-vault'),
  reportPath: path.join(__dirname, 'reports'),
  verbose: true
};

// ============ 测试用例加载 ============

function loadTestCases(config: EvalConfig): TestCase[] {
  const casesDir = path.join(__dirname, 'cases');
  const files = fs.readdirSync(casesDir).filter(f => f.endsWith('.yaml'));
  
  const allCases: TestCase[] = [];
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(casesDir, file), 'utf-8');
    const cases = yaml.load(content) as TestCase[];
    
    if (Array.isArray(cases)) {
      allCases.push(...cases);
    }
  }

  // 过滤
  if (config.categories && config.categories.length > 0) {
    return allCases.filter(c => config.categories!.includes(c.category));
  }
  if (config.testIds && config.testIds.length > 0) {
    return allCases.filter(c => config.testIds!.includes(c.id));
  }

  return allCases;
}

// ============ Agent 调用 ============

/**
 * 调用 Agent 执行任务
 * 这里需要连接到实际的 Rust Agent 后端
 */
async function runAgent(
  input: string, 
  config: EvalConfig
): Promise<AgentResult> {
  const startTime = Date.now();

  // TODO: 实际实现需要通过 Tauri 命令调用 Rust Agent
  // 这里是模拟实现，用于展示数据结构
  
  // 方式 1: 直接调用 Tauri 命令（需要在 Tauri 环境中）
  // const result = await invoke('agent_start_task', { task: input, context: {...} });
  
  // 方式 2: 通过 HTTP API（如果启用了）
  // const response = await fetch('http://localhost:3000/api/agent', {...});
  
  // 方式 3: 单元测试中 mock
  console.log(`[Agent] Running task: ${input.substring(0, 50)}...`);
  
  // 模拟返回
  return {
    input,
    actualOutput: '[Mock] Task completed',
    finalStatus: 'completed',
    plan: {
      steps: [
        { id: '1', description: 'Step 1', completed: true },
        { id: '2', description: 'Step 2', completed: true }
      ]
    },
    toolsCalled: [
      { name: 'read_note', params: { path: 'note1.md' }, success: true, output: '...' }
    ],
    tokenUsage: { prompt: 500, completion: 200, total: 700 },
    completionTimeMs: Date.now() - startTime,
    loopIterations: 2
  };
}

// ============ 评估执行 ============

async function evaluateTestCase(
  testCase: TestCase,
  config: EvalConfig
): Promise<EvalResult> {
  const timestamp = new Date().toISOString();
  
  try {
    // 1. 运行 Agent
    const agentResult = await runAgent(testCase.input, config);

    // 2. 评估各项指标
    const metricResults = await evaluateAll(testCase, agentResult);

    // 3. 计算综合得分
    const overallScore = calculateOverallScore(metricResults);
    const passed = overallScore >= 0.7;

    return {
      testId: testCase.id,
      testName: testCase.name,
      category: testCase.category,
      passed,
      metrics: {
        taskCompletion: metricResults.task_completion,
        toolCorrectness: metricResults.tool_correctness,
        planQuality: metricResults.plan_quality,
        efficiency: metricResults.efficiency
      },
      agentResult,
      timestamp
    };

  } catch (error) {
    return {
      testId: testCase.id,
      testName: testCase.name,
      category: testCase.category,
      passed: false,
      metrics: {
        taskCompletion: { name: 'task_completion', score: 0, passed: false, reason: 'Error' },
        toolCorrectness: { name: 'tool_correctness', score: 0, passed: false, reason: 'Error' },
        planQuality: { name: 'plan_quality', score: 0, passed: false, reason: 'Error' },
        efficiency: { name: 'efficiency', score: 0, passed: false, reason: 'Error' }
      },
      agentResult: {
        input: testCase.input,
        actualOutput: '',
        finalStatus: 'error',
        toolsCalled: [],
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        completionTimeMs: 0,
        loopIterations: 0
      },
      timestamp,
      errors: [String(error)]
    };
  }
}

// ============ 报告生成 ============

function generateReport(results: EvalResult[], durationMs: number): EvalReport {
  const runId = `eval-${Date.now()}`;
  const timestamp = new Date().toISOString();

  // 总体统计
  const passedCount = results.filter(r => r.passed).length;
  const avgTaskCompletion = average(results.map(r => r.metrics.taskCompletion.score));
  const avgToolCorrectness = average(results.map(r => r.metrics.toolCorrectness.score));
  const avgPlanQuality = average(results.map(r => r.metrics.planQuality.score));
  const avgEfficiency = average(results.map(r => r.metrics.efficiency.score));
  const totalTokens = results.reduce((sum, r) => sum + r.agentResult.tokenUsage.total, 0);
  const avgTimeMs = average(results.map(r => r.agentResult.completionTimeMs));

  // 分类统计
  const byCategory: Record<string, any> = {};
  const categories = [...new Set(results.map(r => r.category))];
  
  for (const category of categories) {
    const categoryResults = results.filter(r => r.category === category);
    const categoryPassed = categoryResults.filter(r => r.passed).length;
    
    byCategory[category] = {
      total: categoryResults.length,
      passed: categoryPassed,
      passRate: categoryPassed / categoryResults.length,
      avgTaskCompletion: average(categoryResults.map(r => r.metrics.taskCompletion.score))
    };
  }

  // 失败分析
  const failedCases = results
    .filter(r => !r.passed)
    .map(r => ({
      id: r.testId,
      reason: getFailureReason(r)
    }));

  const commonIssues = analyzeCommonIssues(results.filter(r => !r.passed));

  return {
    runId,
    timestamp,
    totalCases: results.length,
    duration: durationMs,
    summary: {
      passRate: passedCount / results.length,
      avgTaskCompletion,
      avgToolCorrectness,
      avgPlanQuality,
      avgEfficiency,
      totalTokens,
      avgTimeMs
    },
    byCategory,
    results,
    failureAnalysis: {
      commonIssues,
      failedCases
    }
  };
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function getFailureReason(result: EvalResult): string {
  const reasons: string[] = [];
  
  if (!result.metrics.taskCompletion.passed) {
    reasons.push(`任务完成: ${result.metrics.taskCompletion.reason}`);
  }
  if (!result.metrics.toolCorrectness.passed) {
    reasons.push(`工具调用: ${result.metrics.toolCorrectness.reason}`);
  }
  if (!result.metrics.planQuality.passed) {
    reasons.push(`计划质量: ${result.metrics.planQuality.reason}`);
  }

  return reasons.join('; ') || '未知原因';
}

function analyzeCommonIssues(failedResults: EvalResult[]): string[] {
  const issues: Map<string, number> = new Map();
  
  for (const result of failedResults) {
    // 统计常见失败原因
    if (result.metrics.taskCompletion.score < 0.5) {
      increment(issues, '任务未完成');
    }
    if (result.metrics.toolCorrectness.score < 0.5) {
      increment(issues, '工具选择错误');
    }
    if (result.metrics.planQuality.score < 0.5) {
      increment(issues, '计划质量差');
    }
    
    // 检查特定工具问题
    const editCalls = result.agentResult.toolsCalled.filter(t => t.name === 'edit_note');
    const failedEdits = editCalls.filter(t => !t.success);
    if (failedEdits.length > 0) {
      increment(issues, 'edit_note 匹配失败');
    }
  }

  // 按频率排序
  return [...issues.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([issue, count]) => `${issue} (${count}次)`);
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1);
}

// ============ 输出格式化 ============

function printResults(report: EvalReport, verbose: boolean) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Agent 评估报告');
  console.log('='.repeat(60));
  
  console.log(`\n📅 时间: ${report.timestamp}`);
  console.log(`⏱️  耗时: ${(report.duration / 1000).toFixed(1)}s`);
  console.log(`📝 测试: ${report.totalCases} 个`);
  
  console.log('\n📈 总体指标:');
  console.log(`   通过率:       ${(report.summary.passRate * 100).toFixed(1)}%`);
  console.log(`   任务完成度:   ${(report.summary.avgTaskCompletion * 100).toFixed(1)}%`);
  console.log(`   工具正确率:   ${(report.summary.avgToolCorrectness * 100).toFixed(1)}%`);
  console.log(`   计划质量:     ${(report.summary.avgPlanQuality * 100).toFixed(1)}%`);
  console.log(`   效率得分:     ${(report.summary.avgEfficiency * 100).toFixed(1)}%`);
  console.log(`   Token 总量:   ${report.summary.totalTokens}`);
  console.log(`   平均耗时:     ${(report.summary.avgTimeMs / 1000).toFixed(2)}s`);

  console.log('\n📁 分类表现:');
  for (const [category, stats] of Object.entries(report.byCategory)) {
    console.log(`   ${category}: ${stats.passed}/${stats.total} (${(stats.passRate * 100).toFixed(0)}%)`);
  }

  if (report.failureAnalysis.commonIssues.length > 0) {
    console.log('\n⚠️  常见问题:');
    for (const issue of report.failureAnalysis.commonIssues) {
      console.log(`   - ${issue}`);
    }
  }

  if (verbose && report.failureAnalysis.failedCases.length > 0) {
    console.log('\n❌ 失败用例:');
    for (const { id, reason } of report.failureAnalysis.failedCases.slice(0, 10)) {
      console.log(`   ${id}: ${reason}`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

function saveReport(report: EvalReport, outputPath: string) {
  const filename = `report-${report.runId}.json`;
  const filepath = path.join(outputPath, filename);
  
  fs.mkdirSync(outputPath, { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  
  console.log(`\n💾 报告已保存: ${filepath}`);
}

// ============ 主函数 ============

async function main() {
  const args = process.argv.slice(2);
  
  // 解析参数
  const config: EvalConfig = { ...DEFAULT_CONFIG };
  
  for (const arg of args) {
    if (arg.startsWith('--category=')) {
      config.categories = arg.split('=')[1].split(',');
    }
    if (arg.startsWith('--id=')) {
      config.testIds = arg.split('=')[1].split(',');
    }
    if (arg === '--report') {
      config.verbose = true;
    }
    if (arg === '--quiet') {
      config.verbose = false;
    }
  }

  // 检查 API Key
  if (!config.agentConfig.apiKey) {
    console.error('❌ 请设置 AGENT_API_KEY 环境变量');
    process.exit(1);
  }

  // 加载测试用例
  const testCases = loadTestCases(config);
  console.log(`\n🧪 加载了 ${testCases.length} 个测试用例`);

  // 执行评估
  const startTime = Date.now();
  const results: EvalResult[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n[${i + 1}/${testCases.length}] ${testCase.id}: ${testCase.name}`);
    
    const result = await evaluateTestCase(testCase, config);
    results.push(result);
    
    const status = result.passed ? '✅' : '❌';
    console.log(`   ${status} Score: ${(calculateOverallScore({
      task_completion: result.metrics.taskCompletion,
      tool_correctness: result.metrics.toolCorrectness,
      plan_quality: result.metrics.planQuality,
      efficiency: result.metrics.efficiency
    }) * 100).toFixed(0)}%`);
  }

  const duration = Date.now() - startTime;

  // 生成报告
  const report = generateReport(results, duration);
  
  // 输出结果
  printResults(report, config.verbose || false);
  
  // 保存报告
  if (config.reportPath) {
    saveReport(report, config.reportPath);
  }

  // 返回退出码
  const exitCode = report.summary.passRate >= 0.8 ? 0 : 1;
  process.exit(exitCode);
}

// 运行
main().catch(console.error);
