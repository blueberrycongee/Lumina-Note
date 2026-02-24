/**
 * Agent 评估面板
 * 用于运行和查看 Agent 评估结果
 */

import { useState, useEffect } from 'react';
import { useAgentEvalStore } from './useAgentEvalStore';
import { allTestCases } from './testCases';
import { 
  Play, 
  Square, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Zap,
  ChevronDown,
  ChevronRight,
  FileText,
  AlertCircle,
  History,
  Save,
} from 'lucide-react';

export function AgentEvalPanel() {
  const {
    isRunning,
    currentTestId,
    progress,
    results,
    summary,
    selectedCategories,
    experimentName,
    experimentDescription,
    history,
    currentReport,
    runAllTests,
    stopTests,
    clearResults,
    setSelectedCategories,
    setExperimentName,
    setExperimentDescription,
    loadHistory,
    deleteReport,
    exportDetailedReport,
  } = useAgentEvalStore();

  const [workspacePath, setWorkspacePath] = useState('D:\\Desktop\\Lumina Note\\tests\\agent-eval\\fixtures\\test-vault');
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);

  // 加载历史记录
  useEffect(() => {
    loadHistory();
  }, []);

  const toggleExpanded = (testId: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(testId)) {
      newExpanded.delete(testId);
    } else {
      newExpanded.add(testId);
    }
    setExpandedResults(newExpanded);
  };

  const categories = ['basic', 'complex', 'edge-case'];

  const handleCategoryToggle = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(c => c !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  const handleRun = () => {
    if (!workspacePath) {
      alert('请先设置测试笔记库路径');
      return;
    }
    runAllTests(workspacePath);
  };

  const filteredTestCases = allTestCases.filter(tc => 
    selectedCategories.includes(tc.category)
  );

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      {/* 头部 */}
      <div className="p-4 border-b border-border">
        <h1 className="text-xl font-bold mb-4">🧪 Agent 评估面板</h1>
        
        {/* 配置 */}
        <div className="space-y-3">
          {/* 实验配置 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted-foreground">实验名称</label>
              <input
                type="text"
                value={experimentName}
                onChange={(e) => setExperimentName(e.target.value)}
                placeholder="例如: GPT-4o 基准测试"
                className="w-full mt-1 px-3 py-2 bg-muted rounded border border-border"
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">测试笔记库路径</label>
              <input
                type="text"
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
                placeholder="例如: D:\test-vault"
                className="w-full mt-1 px-3 py-2 bg-muted rounded border border-border"
                disabled={isRunning}
              />
            </div>
          </div>
          
          <div>
            <label className="text-sm text-muted-foreground">实验描述（可选）</label>
            <input
              type="text"
              value={experimentDescription}
              onChange={(e) => setExperimentDescription(e.target.value)}
              placeholder="例如: 测试新的计划策略"
              className="w-full mt-1 px-3 py-2 bg-muted rounded border border-border"
              disabled={isRunning}
            />
          </div>

          {/* 类别选择 */}
          <div>
            <label className="text-sm text-muted-foreground">测试类别</label>
            <div className="flex gap-2 mt-1">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => handleCategoryToggle(cat)}
                  disabled={isRunning}
                  className={`px-3 py-1 rounded text-sm ${
                    selectedCategories.includes(cat)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {cat} ({allTestCases.filter(tc => tc.category === cat).length})
                </button>
              ))}
            </div>
          </div>

          {/* 评估方式说明 */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>🤖</span>
            <span>使用 LLM 评估（每个测试独立，无历史污染）</span>
          </div>

          {/* 控制按钮 */}
          <div className="flex gap-2">
            <button
              onClick={handleRun}
              disabled={isRunning || selectedCategories.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              <Play size={16} />
              运行测试 ({filteredTestCases.length} 个)
            </button>
            
            {isRunning && (
              <button
                onClick={stopTests}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                <Square size={16} />
                停止
              </button>
            )}
            
            <button
              onClick={clearResults}
              disabled={isRunning || results.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-muted rounded hover:bg-muted/80 disabled:opacity-50"
            >
              <Trash2 size={16} />
              清除结果
            </button>
            
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-2 px-4 py-2 rounded ${
                showHistory ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
            >
              <History size={16} />
              历史记录 ({history.length})
            </button>
            
            <button
              onClick={async () => {
                try {
                  const path = await exportDetailedReport(workspacePath);
                  alert(`报告已导出: ${path}`);
                } catch (e) {
                  alert(`导出失败: ${e}`);
                }
              }}
              disabled={isRunning || results.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={16} />
              导出报告
            </button>
          </div>
        </div>
      </div>

      {/* 进度 */}
      {isRunning && (
        <div className="px-4 py-2 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock className="animate-spin" size={16} />
            <span>
              正在测试: {currentTestId} ({progress.current}/{progress.total})
            </span>
          </div>
          <div className="mt-2 h-2 bg-muted rounded overflow-hidden">
            <div 
              className="h-full bg-primary transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 汇总 */}
      {summary && (
        <div className="p-4 bg-muted/30 border-b border-border">
          <h2 className="font-semibold mb-2">📊 评估结果</h2>
          <div className="grid grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">
                {summary.passed}/{summary.total}
              </div>
              <div className="text-sm text-muted-foreground">通过/总数</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${
                summary.passRate >= 0.8 ? 'text-green-500' : 
                summary.passRate >= 0.6 ? 'text-yellow-500' : 'text-red-500'
              }`}>
                {(summary.passRate * 100).toFixed(0)}%
              </div>
              <div className="text-sm text-muted-foreground">通过率</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {(summary.avgTaskCompletion * 100).toFixed(0)}%
              </div>
              <div className="text-sm text-muted-foreground">任务完成度</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {(summary.avgToolCorrectness * 100).toFixed(0)}%
              </div>
              <div className="text-sm text-muted-foreground">工具正确率</div>
            </div>
            <div>
              <div className="text-2xl font-bold flex items-center justify-center gap-1">
                {summary.passRate >= 0.8 ? (
                  <CheckCircle className="text-green-500" size={24} />
                ) : (
                  <AlertCircle className="text-yellow-500" size={24} />
                )}
              </div>
              <div className="text-sm text-muted-foreground">状态</div>
            </div>
          </div>
        </div>
      )}

      {/* 结果列表 */}
      <div className="flex-1 overflow-auto p-4">
        {results.length === 0 && !isRunning && (
          <div className="text-center text-muted-foreground py-8">
            <FileText size={48} className="mx-auto mb-2 opacity-50" />
            <p>点击"运行测试"开始评估</p>
          </div>
        )}

        <div className="space-y-2">
          {results.map(result => (
            <div 
              key={result.testId}
              className={`border rounded p-3 ${
                result.passed ? 'border-green-500/50 bg-green-500/5' : 'border-red-500/50 bg-red-500/5'
              }`}
            >
              {/* 标题行 */}
              <div 
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => toggleExpanded(result.testId)}
              >
                {expandedResults.has(result.testId) ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                
                {result.passed ? (
                  <CheckCircle className="text-green-500" size={16} />
                ) : (
                  <XCircle className="text-red-500" size={16} />
                )}
                
                <span className="font-medium">{result.testName}</span>
                <span className="text-sm text-muted-foreground">({result.testId})</span>
                
                <div className="ml-auto flex items-center gap-3 text-sm">
                  <span className={result.overallScore >= 0.7 ? 'text-green-500' : 'text-red-500'}>
                    {(result.overallScore * 100).toFixed(0)}%
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock size={12} />
                    {(result.agentResult.completionTimeMs / 1000).toFixed(1)}s
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Zap size={12} />
                    {result.agentResult.tokenUsage.total}
                  </span>
                </div>
              </div>

              {/* 展开详情 */}
              {expandedResults.has(result.testId) && (
                <div className="mt-3 pl-6 space-y-2 text-sm">
                  {/* 输入 */}
                  <div>
                    <span className="text-muted-foreground">输入：</span>
                    <span className="ml-2">{result.agentResult.input}</span>
                  </div>

                  {/* 指标 */}
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(result.metrics).map(([key, metric]) => (
                      <div 
                        key={key}
                        className={`p-2 rounded ${
                          metric.passed ? 'bg-green-500/10' : 'bg-red-500/10'
                        }`}
                      >
                        <div className="font-medium">
                          {key === 'taskCompletion' ? '任务完成' :
                           key === 'toolCorrectness' ? '工具正确' :
                           key === 'planQuality' ? '计划质量' : '效率'}
                        </div>
                        <div className={metric.passed ? 'text-green-500' : 'text-red-500'}>
                          {(metric.score * 100).toFixed(0)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {metric.reason}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 执行计划 */}
                  {result.agentResult.plan && result.agentResult.plan.steps.length > 0 && (
                    <div className="mt-2">
                      <div className="text-muted-foreground mb-1 font-medium">📋 执行计划：</div>
                      <div className="bg-muted/30 rounded p-2 space-y-1">
                        {result.agentResult.plan.steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className={step.completed ? 'text-green-500' : 'text-muted-foreground'}>
                              {step.completed ? '✅' : '⬜'}
                            </span>
                            <span className={step.completed ? '' : 'text-muted-foreground'}>
                              {step.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 工具调用详情 */}
                  {result.agentResult.toolsCalled.length > 0 && (
                    <div className="mt-2">
                      <div className="text-muted-foreground mb-1 font-medium">🔧 工具调用：</div>
                      <div className="space-y-2">
                        {result.agentResult.toolsCalled.map((tool, i) => (
                          <div 
                            key={i}
                            className={`bg-muted/30 rounded p-2 border-l-2 ${
                              tool.success ? 'border-green-500' : 'border-red-500'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`font-mono font-medium ${
                                tool.success ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {tool.name}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                tool.success ? 'bg-green-500/20 text-green-600' : 'bg-red-500/20 text-red-600'
                              }`}>
                                {tool.success ? '成功' : '失败'}
                              </span>
                            </div>
                            {tool.params && Object.keys(tool.params).length > 0 && (
                              <div className="text-xs text-muted-foreground mb-1">
                                <span className="font-medium">参数：</span>
                                <code className="ml-1 bg-muted px-1 rounded">
                                  {JSON.stringify(tool.params).slice(0, 100)}
                                  {JSON.stringify(tool.params).length > 100 ? '...' : ''}
                                </code>
                              </div>
                            )}
                            {tool.output && (
                              <div className="text-xs mt-1">
                                <span className="font-medium text-muted-foreground">输出：</span>
                                <pre className="mt-1 bg-muted p-2 rounded overflow-auto max-h-24 text-xs">
                                  {typeof tool.output === 'string' 
                                    ? tool.output.slice(0, 300) + (tool.output.length > 300 ? '...' : '')
                                    : JSON.stringify(tool.output, null, 2).slice(0, 300)}
                                </pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Agent 回复 */}
                  {result.agentResult.actualOutput && (
                    <div className="mt-2">
                      <div className="text-muted-foreground mb-1 font-medium">💬 Agent 回复：</div>
                      <div className="bg-muted/30 rounded p-3 whitespace-pre-wrap text-sm max-h-48 overflow-auto">
                        {result.agentResult.actualOutput}
                      </div>
                    </div>
                  )}

                  {/* 错误 */}
                  {result.error && (
                    <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-500">
                      ❌ 错误：{result.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 历史记录面板 */}
      {showHistory && (
        <div className="absolute right-0 top-0 h-full w-80 bg-background border-l border-border shadow-lg overflow-auto">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">📜 实验历史</h2>
            <button onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>
          
          {history.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              暂无历史记录
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {history.map(item => (
                <div 
                  key={item.experimentId}
                  className="p-3 bg-muted/50 rounded border border-border hover:bg-muted"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium truncate">{item.experimentName}</span>
                    <button
                      onClick={() => deleteReport(item.experimentId)}
                      className="text-red-500 hover:text-red-600 text-xs"
                    >
                      删除
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="px-2 py-0.5 bg-blue-500/20 rounded">
                      {item.modelId}
                    </span>
                    <span className={`px-2 py-0.5 rounded ${
                      item.passRate >= 0.8 ? 'bg-green-500/20' : 
                      item.passRate >= 0.6 ? 'bg-yellow-500/20' : 'bg-red-500/20'
                    }`}>
                      {(item.passRate * 100).toFixed(0)}% 通过
                    </span>
                    <span className="px-2 py-0.5 bg-muted rounded">
                      {item.totalTests} 测试
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 当前实验已保存提示 */}
      {currentReport && !isRunning && (
        <div className="absolute bottom-4 right-4 px-4 py-2 bg-green-500/20 border border-green-500/50 rounded flex items-center gap-2">
          <Save size={16} className="text-green-500" />
          <span className="text-sm">实验已保存: {currentReport.config.experimentId}</span>
        </div>
      )}
    </div>
  );
}

export default AgentEvalPanel;
