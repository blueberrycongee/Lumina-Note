/**
 * Agent 评估系统类型定义
 */

// ============ 实验配置 ============

export interface ExperimentConfig {
  // 实验元信息
  experimentId: string;
  experimentName: string;
  description?: string;
  createdAt: string;
  
  // 模型配置
  model: {
    provider: string;      // openai, anthropic, deepseek, etc.
    modelId: string;       // gpt-4o, claude-3-5-sonnet, etc.
    temperature: number;
    maxTokens?: number;
  };
  
  // Agent 配置
  agent: {
    maxIterations: number;   // 最大循环次数
    timeout: number;         // 超时时间（ms）
    planningEnabled: boolean; // 是否启用计划
  };
  
  // 测试配置
  testConfig: {
    categories: string[];    // 测试类别
    testCaseIds?: string[];  // 指定测试用例（可选）
    testVaultPath: string;   // 测试笔记库路径
  };
}

// ============ 工具调用 ============

export interface ToolCall {
  name: string;
  params: Record<string, unknown>;
  success: boolean;
  output?: string;
  durationMs?: number;
}

// ============ 计划 ============

export interface PlanStep {
  id: string;
  description: string;
  completed: boolean;
  agent?: string;
}

export interface Plan {
  steps: PlanStep[];
  createdAt?: string;
}

// ============ Agent 结果 ============

export interface AgentResult {
  input: string;
  actualOutput: string;
  finalStatus: 'completed' | 'error' | 'aborted' | 'timeout';
  plan?: Plan;
  toolsCalled: ToolCall[];
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
  completionTimeMs: number;
  loopIterations: number;
  errorMessage?: string;
}

// ============ 指标结果 ============

export interface MetricResult {
  name: string;
  score: number;        // 0-1
  passed: boolean;
  weight?: number;      // 权重（可选）
  reason?: string;
  details?: Record<string, unknown>;
}

export interface MetricsSummary {
  taskCompletion: MetricResult;
  toolCorrectness: MetricResult;
  planQuality: MetricResult;
  efficiency: MetricResult;
}

// ============ 单个测试结果 ============

export interface TestCaseResult {
  // 测试用例信息
  testId: string;
  testName: string;
  category: string;
  
  // 评估结果
  passed: boolean;
  overallScore: number;
  metrics: MetricsSummary;
  
  // Agent 执行详情
  agentResult: AgentResult;
  
  // 时间戳
  startedAt: string;
  completedAt: string;
  
  // 错误信息
  error?: string;
}

// ============ 实验报告 ============

export interface ExperimentReport {
  // 实验配置
  config: ExperimentConfig;
  
  // 汇总统计
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    
    // 平均指标
    avgTaskCompletion: number;
    avgToolCorrectness: number;
    avgPlanQuality: number;
    avgEfficiency: number;
    avgOverallScore: number;
    
    // 资源消耗
    totalTokens: number;
    totalTimeMs: number;
    avgTokensPerTest: number;
    avgTimePerTest: number;
  };
  
  // 分类统计
  categoryStats: Record<string, {
    total: number;
    passed: number;
    passRate: number;
    avgScore: number;
  }>;
  
  // 详细结果
  results: TestCaseResult[];
  
  // 常见问题
  commonIssues: {
    issue: string;
    count: number;
    testIds: string[];
  }[];
  
  // 时间戳
  startedAt: string;
  completedAt: string;
}

// ============ 历史记录 ============

export interface ExperimentHistoryItem {
  experimentId: string;
  experimentName: string;
  createdAt: string;
  modelId: string;
  passRate: number;
  avgScore: number;
  totalTests: number;
}
