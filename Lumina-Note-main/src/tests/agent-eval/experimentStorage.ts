/**
 * 实验记录存储
 * 负责保存和加载实验数据（localStorage）
 */

import { 
  ExperimentConfig, 
  ExperimentReport, 
  ExperimentHistoryItem,
  TestCaseResult,
} from './types';

/**
 * 生成实验 ID
 */
export function generateExperimentId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const random = Math.random().toString(36).slice(2, 6);
  return `exp_${timestamp}_${random}`;
}

/**
 * 获取当前模型配置
 */
export async function getCurrentModelConfig(): Promise<ExperimentConfig['model']> {
  try {
    // 从 localStorage 读取 AI 设置
    const aiSettingsStr = localStorage.getItem('ai-settings');
    if (aiSettingsStr) {
      const settings = JSON.parse(aiSettingsStr);
      return {
        provider: settings.state?.provider || 'unknown',
        modelId: settings.state?.model === 'custom' 
          ? settings.state?.customModelId 
          : settings.state?.model || 'unknown',
        temperature: settings.state?.temperature || 0.7,
        maxTokens: settings.state?.maxTokens,
      };
    }
  } catch (e) {
    console.warn('Failed to get model config:', e);
  }
  
  return {
    provider: 'unknown',
    modelId: 'unknown',
    temperature: 0.7,
  };
}

/**
 * 创建实验配置
 */
export async function createExperimentConfig(
  name: string,
  description: string,
  categories: string[],
  testVaultPath: string,
): Promise<ExperimentConfig> {
  const model = await getCurrentModelConfig();
  
  return {
    experimentId: generateExperimentId(),
    experimentName: name,
    description,
    createdAt: new Date().toISOString(),
    model,
    agent: {
      maxIterations: 20,
      timeout: 120000,
      planningEnabled: true,
    },
    testConfig: {
      categories,
      testVaultPath,
    },
  };
}

/**
 * 计算实验汇总统计
 */
export function calculateSummary(results: TestCaseResult[]): ExperimentReport['summary'] {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  
  const avgTaskCompletion = average(results.map(r => r.metrics.taskCompletion.score));
  const avgToolCorrectness = average(results.map(r => r.metrics.toolCorrectness.score));
  const avgPlanQuality = average(results.map(r => r.metrics.planQuality.score));
  const avgEfficiency = average(results.map(r => r.metrics.efficiency.score));
  const avgOverallScore = average(results.map(r => r.overallScore));
  
  const totalTokens = results.reduce((sum, r) => sum + r.agentResult.tokenUsage.total, 0);
  const totalTimeMs = results.reduce((sum, r) => sum + r.agentResult.completionTimeMs, 0);
  
  return {
    total,
    passed,
    failed,
    passRate: total > 0 ? passed / total : 0,
    avgTaskCompletion,
    avgToolCorrectness,
    avgPlanQuality,
    avgEfficiency,
    avgOverallScore,
    totalTokens,
    totalTimeMs,
    avgTokensPerTest: total > 0 ? totalTokens / total : 0,
    avgTimePerTest: total > 0 ? totalTimeMs / total : 0,
  };
}

/**
 * 计算分类统计
 */
export function calculateCategoryStats(
  results: TestCaseResult[]
): ExperimentReport['categoryStats'] {
  const stats: ExperimentReport['categoryStats'] = {};
  
  // 按类别分组
  const byCategory = new Map<string, TestCaseResult[]>();
  for (const r of results) {
    const list = byCategory.get(r.category) || [];
    list.push(r);
    byCategory.set(r.category, list);
  }
  
  // 计算每个类别的统计
  for (const [category, categoryResults] of byCategory) {
    const total = categoryResults.length;
    const passed = categoryResults.filter(r => r.passed).length;
    stats[category] = {
      total,
      passed,
      passRate: total > 0 ? passed / total : 0,
      avgScore: average(categoryResults.map(r => r.overallScore)),
    };
  }
  
  return stats;
}

/**
 * 分析常见问题
 */
export function analyzeCommonIssues(
  results: TestCaseResult[]
): ExperimentReport['commonIssues'] {
  const issueMap = new Map<string, string[]>();
  
  for (const r of results) {
    if (!r.passed) {
      // 检查各项指标
      if (r.metrics.taskCompletion.score < 0.7) {
        const issue = `任务完成度不足: ${r.metrics.taskCompletion.reason || '未知原因'}`;
        const ids = issueMap.get(issue) || [];
        ids.push(r.testId);
        issueMap.set(issue, ids);
      }
      if (r.metrics.toolCorrectness.score < 0.7) {
        const issue = `工具调用问题: ${r.metrics.toolCorrectness.reason || '未知原因'}`;
        const ids = issueMap.get(issue) || [];
        ids.push(r.testId);
        issueMap.set(issue, ids);
      }
      if (r.metrics.planQuality.score < 0.6) {
        const issue = `计划质量问题: ${r.metrics.planQuality.reason || '未知原因'}`;
        const ids = issueMap.get(issue) || [];
        ids.push(r.testId);
        issueMap.set(issue, ids);
      }
      if (r.error) {
        const issue = `执行错误: ${r.error}`;
        const ids = issueMap.get(issue) || [];
        ids.push(r.testId);
        issueMap.set(issue, ids);
      }
    }
  }
  
  // 转换为数组并按数量排序
  return Array.from(issueMap.entries())
    .map(([issue, testIds]) => ({ issue, count: testIds.length, testIds }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // 最多返回 10 个问题
}

/**
 * 创建完整实验报告
 */
export function createExperimentReport(
  config: ExperimentConfig,
  results: TestCaseResult[],
  startedAt: string,
): ExperimentReport {
  return {
    config,
    summary: calculateSummary(results),
    categoryStats: calculateCategoryStats(results),
    results,
    commonIssues: analyzeCommonIssues(results),
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

/**
 * 保存实验报告到 localStorage
 * 注：由于前端无法可靠获取项目目录，统一保存到 localStorage
 */
export async function saveExperimentReport(
  report: ExperimentReport,
  _workspacePath: string,
): Promise<string> {
  const key = `experiment_${report.config.experimentId}`;
  
  try {
    localStorage.setItem(key, JSON.stringify(report));
    console.log(`✅ 实验报告已保存: ${key}`);
    console.log(`📊 通过率: ${(report.summary.passRate * 100).toFixed(1)}%`);
    console.log(`📁 测试数: ${report.summary.total}`);
    return key;
  } catch (e) {
    console.error('Failed to save experiment report:', e);
    throw e;
  }
}

/**
 * 导出报告为 JSON 文件（供手动下载）
 */
export function exportReportAsJson(report: ExperimentReport): void {
  const json = JSON.stringify(report, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.config.experimentId}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
}

/**
 * 获取实验历史列表
 */
export function getExperimentHistory(): ExperimentHistoryItem[] {
  const history: ExperimentHistoryItem[] = [];
  
  // 从 localStorage 获取
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('experiment_')) {
      try {
        const report: ExperimentReport = JSON.parse(localStorage.getItem(key) || '');
        history.push({
          experimentId: report.config.experimentId,
          experimentName: report.config.experimentName,
          createdAt: report.config.createdAt,
          modelId: report.config.model.modelId,
          passRate: report.summary.passRate,
          avgScore: report.summary.avgOverallScore,
          totalTests: report.summary.total,
        });
      } catch (e) {
        // ignore
      }
    }
  }
  
  // 按时间排序
  return history.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * 加载实验报告
 */
export function loadExperimentReport(experimentId: string): ExperimentReport | null {
  const key = `experiment_${experimentId}`;
  const data = localStorage.getItem(key);
  if (data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * 删除实验报告
 */
export function deleteExperimentReport(experimentId: string): boolean {
  const key = `experiment_${experimentId}`;
  if (localStorage.getItem(key)) {
    localStorage.removeItem(key);
    return true;
  }
  return false;
}

// 辅助函数
function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
