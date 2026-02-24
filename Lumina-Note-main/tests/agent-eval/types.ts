/**
 * Agent 评估系统类型定义
 * 参考 DeepEval 的 LLMTestCase 和 ToolCall 设计
 */

// ============ 测试用例定义 ============

/** 工具调用记录 */
export interface ToolCall {
  name: string;
  params: Record<string, unknown>;
  output?: string;
  success: boolean;
  reasoning?: string;
}

/** 计划步骤 */
export interface PlanStep {
  id: string;
  description: string;
  completed: boolean;
}

/** Agent 执行结果 */
export interface AgentResult {
  // 输入
  input: string;
  
  // 输出
  actualOutput: string;
  finalStatus: 'completed' | 'error' | 'aborted';
  
  // 计划
  plan?: {
    steps: PlanStep[];
  };
  
  // 工具调用
  toolsCalled: ToolCall[];
  
  // 统计
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
  completionTimeMs: number;
  loopIterations: number;
}

/** 测试用例（YAML 中定义） */
export interface TestCase {
  id: string;
  name: string;
  category: 'basic' | 'complex' | 'edge-case' | 'regression' | 'mcp';
  
  // 输入
  input: string;
  
  // 描述（用于文档和理解）
  description?: string;
  
  // 前置条件（MCP 测试需要）
  precondition?: string[];
  
  // 预期（可选，用于评估）
  expectedTools?: string[];           // 预期使用的工具名
  expectedToolSequence?: string[];    // 预期工具调用顺序（严格匹配）
  expectedPlanSteps?: number;         // 预期计划步骤数
  expectedOutcome?: string;           // 预期结果描述（LLM 评判）
  expectedBehavior?: string[];        // 预期行为描述（MCP 测试用）
  expectedApproval?: boolean;         // 是否预期需要用户审批
  
  // 评估标准
  evaluationCriteria?: string[];      // LLM-as-Judge 评判标准
  
  // 约束
  maxTokens?: number;
  maxTimeMs?: number;
  maxLoopIterations?: number;
}

// ============ 评估结果 ============

/** 单项指标结果 */
export interface MetricResult {
  name: string;
  score: number;        // 0-1
  passed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

/** 测试用例评估结果 */
export interface EvalResult {
  testId: string;
  testName: string;
  category: string;
  
  // 总体结果
  passed: boolean;
  
  // 各项指标
  metrics: {
    taskCompletion: MetricResult;
    toolCorrectness: MetricResult;
    planQuality: MetricResult;
    efficiency: MetricResult;
  };
  
  // 原始数据
  agentResult: AgentResult;
  
  // 时间戳
  timestamp: string;
  
  // 错误信息
  errors?: string[];
}

/** 评估报告 */
export interface EvalReport {
  // 元数据
  runId: string;
  timestamp: string;
  totalCases: number;
  duration: number;
  
  // 总体统计
  summary: {
    passRate: number;
    avgTaskCompletion: number;
    avgToolCorrectness: number;
    avgPlanQuality: number;
    avgEfficiency: number;
    totalTokens: number;
    avgTimeMs: number;
  };
  
  // 分类统计
  byCategory: Record<string, {
    total: number;
    passed: number;
    passRate: number;
    avgTaskCompletion: number;
  }>;
  
  // 详细结果
  results: EvalResult[];
  
  // 失败分析
  failureAnalysis: {
    commonIssues: string[];
    failedCases: { id: string; reason: string }[];
  };
}

// ============ 评估器接口 ============

/** 指标评估器 */
export interface MetricEvaluator {
  name: string;
  evaluate(testCase: TestCase, result: AgentResult): Promise<MetricResult>;
}

/** 评估配置 */
export interface EvalConfig {
  // 测试目标
  categories?: string[];
  testIds?: string[];
  
  // Agent 配置
  agentConfig: {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
  };
  
  // 测试环境
  testVaultPath: string;
  
  // LLM-as-Judge 配置（用于主观评估）
  judgeConfig?: {
    provider: string;
    model: string;
    apiKey: string;
  };
  
  // 输出
  reportPath?: string;
  verbose?: boolean;
}
