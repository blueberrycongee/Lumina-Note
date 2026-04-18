/**
 * Agent 评估 Store
 * 管理评估状态、运行测试、收集结果、保存实验记录
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { TestCase, allTestCases } from './testCases';
import { useAIStore } from '@/stores/useAIStore';
import { 
  ExperimentReport, 
  TestCaseResult, 
  AgentResult,
  MetricResult,
  ExperimentHistoryItem,
  ToolCall,
  PlanStep,
} from './types';
import {
  createExperimentConfig,
  createExperimentReport,
  saveExperimentReport,
  getExperimentHistory,
  loadExperimentReport,
  deleteExperimentReport,
} from './experimentStorage';
import { evaluateWithLLM, LLMEvalResult } from './llmEvaluator';
import { 
  FullExperimentReport, 
  ExecutionTrace,
  saveMarkdownReport,
} from './reportExporter';

// 类型从 ./types 导入

// 执行链路记录
interface TraceItem {
  timestamp: string;
  type: string;
  data: any;
}

interface EvalResult {
  testId: string;
  testName: string;
  category: string;
  passed: boolean;
  overallScore: number;
  metrics: {
    taskCompletion: MetricResult;
    toolCorrectness: MetricResult;
    planQuality: MetricResult;
    efficiency: MetricResult;
  };
  agentResult: AgentResult;
  timestamp: string;
  error?: string;
  // 详细数据
  testCase?: TestCase;
  executionTrace?: TraceItem[];
  llmEvaluation?: LLMEvalResult;
}

interface EvalState {
  // 状态
  isRunning: boolean;
  currentTestId: string | null;
  progress: { current: number; total: number };
  
  // 实验配置
  experimentName: string;
  experimentDescription: string;
  
  // 结果
  results: EvalResult[];
  currentReport: ExperimentReport | null;
  
  // 配置
  selectedCategories: string[];
  
  // 统计
  summary: {
    total: number;
    passed: number;
    passRate: number;
    avgTaskCompletion: number;
    avgToolCorrectness: number;
  } | null;
  
  // 历史记录
  history: ExperimentHistoryItem[];
}

interface EvalActions {
  // 运行测试
  runAllTests: (workspacePath: string) => Promise<void>;
  runTestsByCategory: (category: string, workspacePath: string) => Promise<void>;
  runSingleTest: (testCase: TestCase, workspacePath: string) => Promise<EvalResult>;
  
  // 控制
  stopTests: () => void;
  clearResults: () => void;
  
  // 配置
  setSelectedCategories: (categories: string[]) => void;
  setExperimentName: (name: string) => void;
  setExperimentDescription: (desc: string) => void;
  
  // 历史记录
  loadHistory: () => void;
  loadReport: (experimentId: string) => ExperimentReport | null;
  deleteReport: (experimentId: string) => void;
  
  // 导出报告
  exportDetailedReport: (workspacePath: string) => Promise<string>;
}

// ============ Store 实现 ============

export const useAgentEvalStore = create<EvalState & EvalActions>((set, get) => {
  let stopRequested = false;

  return {
    // 初始状态
    isRunning: false,
    currentTestId: null,
    progress: { current: 0, total: 0 },
    experimentName: '',
    experimentDescription: '',
    results: [],
    currentReport: null,
    selectedCategories: ['basic', 'complex'],
    summary: null,
    history: [],

    // 运行单个测试
    runSingleTest: async (testCase: TestCase, workspacePath: string): Promise<EvalResult> => {
      set({ currentTestId: testCase.id });
      
      const startTime = Date.now();
      const toolsCalled: ToolCall[] = [];
      const executionTrace: TraceItem[] = []; // 执行链路记录
      let plan: { steps: PlanStep[] } | undefined;
      let finalOutput = '';
      let finalStatus: 'completed' | 'error' | 'aborted' = 'error';
      let tokenUsage = { prompt: 0, completion: 0, total: 0 };
      let loopIterations = 0;
      let error: string | undefined;

      // 记录链路
      const trace = (type: string, data: any) => {
        executionTrace.push({
          timestamp: new Date().toISOString(),
          type,
          data,
        });
      };

      // 用 Promise 等待 Agent 完成
      let resolveAgent: () => void;
      const agentDonePromise = new Promise<void>((resolve) => {
        resolveAgent = resolve;
      });

      // 监听 Agent 事件
      const unlisteners: UnlistenFn[] = [];
      
      try {
        console.log('👂 [Eval] 设置事件监听器...');
        unlisteners.push(await listen('agent-event', (event: any) => {
          const { type, data } = event.payload;
          console.log(`📨 [Eval] 收到事件: ${type}`, data);
          
          // 记录所有事件到执行链路
          trace(type, data);
          
          switch (type) {
            case 'tool_start':
              console.log(`🔧 [Eval] 工具调用: ${data.tool}`);
              toolsCalled.push({
                name: data.tool,
                params: data.input ?? {},
                success: true,
              });
              loopIterations++;
              break;

            case 'tool_result': {
              const lastCall = toolsCalled[toolsCalled.length - 1];
              if (lastCall) {
                lastCall.success = true;
                lastCall.output = data.output?.content ?? data.output;
              }
              break;
            }

            case 'tool_error': {
              const lastCall = toolsCalled[toolsCalled.length - 1];
              if (lastCall) {
                lastCall.success = false;
                lastCall.output = data.error;
              }
              break;
            }

            case 'text_delta':
              if (data.delta) {
                finalOutput = (finalOutput || '') + data.delta;
              }
              break;

            case 'text_final':
              if (data.text) {
                finalOutput = data.text;
              }
              break;

            case 'step_finish':
              tokenUsage.prompt += data.tokens?.input || 0;
              tokenUsage.completion += data.tokens?.output || 0;
              tokenUsage.total += (data.tokens?.input || 0) + (data.tokens?.output || 0);
              break;

            case 'run_completed':
              console.log('✅ [Eval] 收到 run_completed 事件');
              finalStatus = 'completed';
              resolveAgent();
              break;

            case 'run_failed':
              console.log('❌ [Eval] 收到 run_failed 事件:', data.error);
              error = data.error;
              finalStatus = 'error';
              resolveAgent();
              break;

            case 'run_aborted':
              console.log('⏹️ [Eval] 收到 run_aborted 事件');
              finalStatus = 'aborted';
              resolveAgent();
              break;

            case 'tool_call':
              console.log(`🔧 [Eval] 工具调用: ${data.tool?.name}`);
              toolsCalled.push({
                name: data.tool.name,
                params: data.tool.params,
                success: true,
              });
              loopIterations++;
              break;
              
            case 'plan_created':
              plan = {
                steps: data.plan.steps.map((s: any) => ({
                  id: s.id,
                  description: s.description,
                  completed: s.completed || false,
                })),
              };
              break;
              
            case 'step_completed':
              if (plan) {
                const step = plan.steps.find(s => s.id === data.step.id);
                if (step) step.completed = true;
              }
              break;
              
            case 'token_usage':
              tokenUsage.prompt += data.prompt_tokens || 0;
              tokenUsage.completion += data.completion_tokens || 0;
              tokenUsage.total += data.total_tokens || 0;
              break;
            
            case 'message_chunk':
              // 累积流式消息内容
              if (data.content) {
                finalOutput = (finalOutput || '') + data.content;
              }
              break;
              
            case 'complete':
              console.log('✅ [Eval] 收到 complete 事件');
              // 如果有 result 且当前 finalOutput 为空，使用 result
              // 否则保留流式累积的内容
              if (data.result && (!finalOutput || finalOutput.trim() === '')) {
                finalOutput = data.result;
              }
              finalStatus = 'completed';
              resolveAgent(); // Agent 完成，resolve Promise
              break;
              
            case 'error':
              console.log('❌ [Eval] 收到 error 事件:', data.message);
              error = data.message;
              finalStatus = 'error';
              resolveAgent(); // 即使错误也 resolve，让流程继续
              break;
              
            case 'status_change':
              console.log(`📊 [Eval] 状态变化: ${data.status}`);
              if (data.status === 'aborted') {
                finalStatus = 'aborted';
                resolveAgent();
              }
              break;
          }
        }));

        // 从 useAIStore 获取已解密的 AI 配置
        const aiConfig = useAIStore.getState().config;
        
        const config = {
          provider: aiConfig.provider || 'openai',
          model: aiConfig.model === 'custom' ? aiConfig.customModelId : (aiConfig.model || 'gpt-4o'),
          api_key: aiConfig.apiKey || '',
          base_url: aiConfig.baseUrl || null,
          temperature: aiConfig.temperature || 0.7,
          max_tokens: (aiConfig as any).maxTokens || 4096,
          max_plan_iterations: 0,
          max_steps: 0,
          auto_approve: true,  // 评估时自动审批
          locale: 'zh-CN',
        };
        
        if (!config.api_key) {
          throw new Error('未配置 API Key，请在设置中配置后重试');
        }

        // 先获取工作区目录结构，帮助 Agent 了解笔记库布局
        console.log('📂 [Eval] 获取工作区目录结构...');
        let fileTree: string | null = null;
        try {
          // 递归列出目录结构（最多3层）
          fileTree = await invoke('list_directory_tree', { 
            path: workspacePath, 
            maxDepth: 3 
          }) as string;
          console.log('📂 [Eval] 目录结构:', fileTree?.slice(0, 200) + '...');
        } catch (e) {
          console.log('⚠️ [Eval] 获取目录结构失败，将使用空值:', e);
        }

        // 启动 Agent 任务
        console.log('📤 [Eval] 调用 agent_start_task...');
        
        // 设置超时（5分钟）
        const timeout = 5 * 60 * 1000;
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('Agent 执行超时')), timeout);
        });
        
        try {
          // 启动任务（不等待 invoke 返回，因为 Rust 端可能异步执行）
          invoke('agent_start_task', {
            config,
            task: testCase.input,
            context: {
              workspace_path: workspacePath,
              active_note_path: null,
              active_note_content: null,
              file_tree: fileTree,  // 提供目录结构上下文
              resolved_links: [],
              history: [],
            },
          }).catch(invokeError => {
            console.log('❌ [Eval] agent_start_task 失败:', invokeError);
            error = String(invokeError);
            finalStatus = 'error';
            resolveAgent(); // 失败时也 resolve，让流程继续
          });
          
          console.log('⏳ [Eval] 等待 Agent 完成...');
          
          // 等待 Agent 完成（通过事件）或超时
          await Promise.race([agentDonePromise, timeoutPromise]);
          
          console.log('✅ [Eval] Agent 执行完成');
          
        } catch (timeoutError) {
          console.log('⏰ [Eval] Agent 执行超时');
          error = 'Agent 执行超时';
          finalStatus = 'error';
          // 超时后中止 Agent
          await invoke('agent_abort').catch(() => {});
        }

      } catch (e) {
        error = String(e);
        finalStatus = 'error';
      } finally {
        // 清理监听器
        for (const unlisten of unlisteners) {
          unlisten();
        }
      }

      const completionTimeMs = Date.now() - startTime;

      // 构建结果
      const agentResult: AgentResult = {
        input: testCase.input,
        actualOutput: finalOutput,
        finalStatus,
        plan,
        toolsCalled,
        tokenUsage,
        completionTimeMs,
        loopIterations,
      };

      // 使用 LLM 评估（每次都是独立的全新对话，无历史污染）
      console.log('🤖 [Eval] 使用 LLM 评估...');
      const llmResult = await evaluateWithLLM(testCase, agentResult);
      
      const taskCompletion = llmResult.taskCompletion;
      const toolCorrectness = llmResult.toolCorrectness;
      const planQuality = llmResult.planQuality;
      const efficiency = llmResult.outputQuality;
      const overallScore = llmResult.overallScore;
      
      console.log(`🤖 [Eval] LLM 评估完成: ${(overallScore * 100).toFixed(1)}%`);
      console.log(`🤖 [Eval] 理由: ${llmResult.llmReasoning}`);

      const evalResult: EvalResult = {
        testId: testCase.id,
        testName: testCase.name,
        category: testCase.category,
        passed: overallScore >= 0.7,
        overallScore,
        metrics: { taskCompletion, toolCorrectness, planQuality, efficiency },
        agentResult,
        timestamp: new Date().toISOString(),
        error,
        // 详细数据
        testCase,
        executionTrace,
        llmEvaluation: llmResult,
      };

      return evalResult;
    },

    // 运行所有测试
    runAllTests: async (workspacePath: string) => {
      const { runSingleTest, selectedCategories, experimentName, experimentDescription } = get();
      const startedAt = new Date().toISOString();
      
      const testCases = allTestCases.filter(tc => 
        selectedCategories.includes(tc.category)
      );
      
      set({ 
        isRunning: true, 
        results: [],
        progress: { current: 0, total: testCases.length },
        summary: null,
        currentReport: null,
      });
      
      stopRequested = false;
      const results: EvalResult[] = [];

      // 等待 Agent 变为 idle 的辅助函数
      const waitForAgentIdle = async (maxWaitMs = 30000): Promise<boolean> => {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
          try {
            const status = await invoke('agent_get_status') as string;
            console.log(`🔍 [Eval] Agent 状态: ${status}`);
            if (status === 'idle' || status === 'Idle') {
              return true;
            }
          } catch (e) {
            console.log('⚠️ [Eval] 获取状态失败:', e);
          }
          await new Promise(r => setTimeout(r, 500));
        }
        return false;
      };

      // 开始前先中止任何正在运行的 Agent
      console.log('🧪 [Eval] 开始评估测试...');
      console.log(`📁 [Eval] 测试笔记库: ${workspacePath}`);
      console.log(`📊 [Eval] 测试用例数: ${testCases.length}`);
      
      try {
        console.log('⏸️ [Eval] 中止之前的 Agent...');
        await invoke('agent_abort');
        // 等待 Agent 真正变为 idle
        const isIdle = await waitForAgentIdle(5000);
        if (isIdle) {
          console.log('✅ [Eval] Agent 已空闲');
        } else {
          console.log('⚠️ [Eval] Agent 未能变为空闲，继续尝试...');
        }
      } catch (e) {
        console.log('⚠️ [Eval] 中止 Agent 失败:', e);
      }

      for (let i = 0; i < testCases.length; i++) {
        if (stopRequested) {
          console.log('🛑 [Eval] 用户停止测试');
          break;
        }
        
        console.log(`\n${'='.repeat(50)}`);
        console.log(`🔄 [Eval] 测试 ${i + 1}/${testCases.length}: ${testCases[i].name} (${testCases[i].id})`);
        console.log(`📝 [Eval] 输入: ${testCases[i].input}`);
        
        set({ progress: { current: i + 1, total: testCases.length } });
        
        // 确保 Agent 空闲
        console.log('⏸️ [Eval] 确保 Agent 空闲...');
        await invoke('agent_abort').catch(() => {});
        const isIdleBeforeTest = await waitForAgentIdle(10000);
        if (!isIdleBeforeTest) {
          console.log('❌ [Eval] Agent 仍在运行，跳过此测试');
          const errorReason = 'Agent is still running';
          results.push({
            testId: testCases[i].id,
            testName: testCases[i].name,
            category: testCases[i].category,
            passed: false,
            overallScore: 0,
            metrics: {
              taskCompletion: { name: 'taskCompletion', score: 0, passed: false, reason: errorReason },
              toolCorrectness: { name: 'toolCorrectness', score: 0, passed: false, reason: errorReason },
              planQuality: { name: 'planQuality', score: 0, passed: false, reason: errorReason },
              efficiency: { name: 'efficiency', score: 0, passed: false, reason: errorReason },
            },
            agentResult: {
              input: testCases[i].input,
              actualOutput: '',
              toolsCalled: [],
              plan: undefined,
              loopIterations: 0,
              tokenUsage: { prompt: 0, completion: 0, total: 0 },
              completionTimeMs: 0,
              finalStatus: 'error',
            },
            timestamp: new Date().toISOString(),
            error: 'Agent is still running from previous test',
            testCase: testCases[i],
            executionTrace: [],
          });
          set({ results: [...results] });
          continue;
        }
        
        console.log('🚀 [Eval] 开始执行测试...');
        const startTime = Date.now();
        
        // runSingleTest 内部会等待 Agent 完成
        const result = await runSingleTest(testCases[i], workspacePath);
        
        console.log(`⏱️ [Eval] 测试完成，耗时: ${Date.now() - startTime}ms`);
        console.log(`📊 [Eval] 结果: ${result.passed ? '✅ 通过' : '❌ 失败'} (${(result.overallScore * 100).toFixed(0)}%)`);
        if (result.error) {
          console.log(`❌ [Eval] 错误: ${result.error}`);
        }
        results.push(result);
        
        set({ results: [...results] });
        
        // 测试完成后确保 Agent 状态清理
        console.log('🧹 [Eval] 清理 Agent 状态...');
        await invoke('agent_abort').catch(() => {});
        await waitForAgentIdle(10000);
      }

      // 计算汇总
      const passed = results.filter(r => r.passed).length;
      const summary = {
        total: results.length,
        passed,
        passRate: results.length > 0 ? passed / results.length : 0,
        avgTaskCompletion: average(results.map(r => r.metrics.taskCompletion.score)),
        avgToolCorrectness: average(results.map(r => r.metrics.toolCorrectness.score)),
      };

      // 创建并保存实验报告
      const config = await createExperimentConfig(
        experimentName || `实验 ${new Date().toLocaleDateString()}`,
        experimentDescription,
        selectedCategories,
        workspacePath,
      );
      
      // 转换结果格式
      const testCaseResults: TestCaseResult[] = results.map(r => ({
        testId: r.testId,
        testName: r.testName,
        category: r.category,
        passed: r.passed,
        overallScore: r.overallScore,
        metrics: r.metrics,
        agentResult: r.agentResult,
        startedAt: r.timestamp,
        completedAt: r.timestamp,
        error: r.error,
      }));
      
      const report = createExperimentReport(config, testCaseResults, startedAt);
      
      // 保存报告
      await saveExperimentReport(report, workspacePath);

      set({ 
        isRunning: false, 
        currentTestId: null,
        summary,
        currentReport: report,
      });
      
      // 刷新历史记录
      get().loadHistory();
    },

    // 按类别运行
    runTestsByCategory: async (category: string, workspacePath: string) => {
      set({ selectedCategories: [category] });
      await get().runAllTests(workspacePath);
    },

    // 停止测试
    stopTests: () => {
      stopRequested = true;
      set({ isRunning: false });
    },

    // 清除结果
    clearResults: () => {
      set({ results: [], summary: null, progress: { current: 0, total: 0 } });
    },

    // 设置类别
    setSelectedCategories: (categories: string[]) => {
      set({ selectedCategories: categories });
    },

    // 设置实验名称
    setExperimentName: (name: string) => {
      set({ experimentName: name });
    },

    // 设置实验描述
    setExperimentDescription: (desc: string) => {
      set({ experimentDescription: desc });
    },

    // 加载历史记录
    loadHistory: () => {
      const history = getExperimentHistory();
      set({ history });
    },

    // 加载报告
    loadReport: (experimentId: string) => {
      return loadExperimentReport(experimentId);
    },

    // 删除报告
    deleteReport: (experimentId: string) => {
      deleteExperimentReport(experimentId);
      get().loadHistory();
    },

    // 导出详细报告
    exportDetailedReport: async (workspacePath: string): Promise<string> => {
      const { results, experimentName, experimentDescription, summary } = get();
      const aiConfig = useAIStore.getState().config;
      
      if (results.length === 0) {
        throw new Error('没有测试结果可导出');
      }

      // 构建完整报告
      const report: FullExperimentReport = {
        experiment: {
          name: experimentName || `实验 ${new Date().toLocaleDateString()}`,
          description: experimentDescription,
          startTime: results[0]?.timestamp || new Date().toISOString(),
          endTime: results[results.length - 1]?.timestamp || new Date().toISOString(),
          workspacePath,
        },
        aiConfig: {
          provider: aiConfig.provider || 'openai',
          model: (aiConfig.model === 'custom' ? aiConfig.customModelId : aiConfig.model) || 'gpt-4o',
          baseUrl: aiConfig.baseUrl || null,
        },
        tests: results.map(r => ({
          testCase: r.testCase!,
          timestamp: r.timestamp,
          agentConfig: {
            provider: aiConfig.provider || 'openai',
            model: (aiConfig.model === 'custom' ? aiConfig.customModelId : aiConfig.model) || 'gpt-4o',
            baseUrl: aiConfig.baseUrl || null,
            temperature: aiConfig.temperature || 0.7,
            maxTokens: (aiConfig as any).maxTokens || 4096,
          },
          executionTrace: (r.executionTrace || []) as ExecutionTrace[],
          agentResult: r.agentResult,
          evaluation: {
            prompt: r.llmEvaluation?.evalPrompt || '',
            llmResponse: r.llmEvaluation?.llmRawResponse || '',
            scores: r.llmEvaluation?.rawScores || {
              taskCompletion: { score: 0, reason: '' },
              toolCorrectness: { score: 0, reason: '' },
              planQuality: { score: 0, reason: '' },
              outputQuality: { score: 0, reason: '' },
            },
            overallScore: r.overallScore,
            overallReasoning: r.llmEvaluation?.llmReasoning || '',
          },
        })),
        summary: {
          total: summary?.total || results.length,
          passed: summary?.passed || results.filter(r => r.passed).length,
          failed: (summary?.total || results.length) - (summary?.passed || results.filter(r => r.passed).length),
          passRate: summary?.passRate || 0,
          avgTaskCompletion: summary?.avgTaskCompletion || 0,
          avgToolCorrectness: summary?.avgToolCorrectness || 0,
          avgPlanQuality: average(results.map(r => r.metrics.planQuality.score)),
          avgOutputQuality: average(results.map(r => r.metrics.efficiency.score)),
          totalTokens: results.reduce((sum, r) => sum + r.agentResult.tokenUsage.total, 0),
          totalTime: results.reduce((sum, r) => sum + r.agentResult.completionTimeMs, 0),
        },
      };

      // 保存 Markdown 报告
      const filePath = await saveMarkdownReport(report, workspacePath);
      console.log(`📁 详细报告已导出: ${filePath}`);
      return filePath;
    },
  };
});

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
