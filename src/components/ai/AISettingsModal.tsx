import { useEffect, useState, useCallback } from "react";
import { useAIStore } from "@/stores/useAIStore";
import { useRustAgentStore } from "@/stores/useRustAgentStore";
import { useRAGStore } from "@/stores/useRAGStore";
import { useBrowserStore } from "@/stores/useBrowserStore";
import { PROVIDER_REGISTRY, type LLMProviderType, createProvider } from "@/services/llm";
import { Settings, Tag, Loader2, Check, X, Zap, AlertTriangle } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";

// 测试连接状态类型
type TestStatus = "idle" | "testing" | "success" | "error";

interface TestResult {
  status: TestStatus;
  message?: string;
  latency?: number;
}

// 常见错误信息映射
const ERROR_MESSAGES: Record<string, string> = {
  "401": "API Key 无效或已过期",
  "403": "API Key 权限不足",
  "404": "API 端点不存在，请检查 Base URL",
  "429": "请求过于频繁，请稍后再试",
  "500": "服务器内部错误",
  "502": "网关错误，服务暂时不可用",
  "503": "服务暂时不可用",
  "timeout": "连接超时，请检查网络或服务器地址",
  "network": "网络连接失败，请检查网络设置",
  "invalid_key": "API Key 格式不正确",
  "no_key": "请先输入 API Key",
  "connection_refused": "连接被拒绝，请检查服务是否运行",
};

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const { config, setConfig } = useAIStore();
  const { autoApprove, setAutoApprove } = useRustAgentStore();
  const {
    config: ragConfig,
    setConfig: setRAGConfig,
    isIndexing: ragIsIndexing,
    indexStatus,
    rebuildIndex,
    cancelIndex,
    lastError: ragError,
  } = useRAGStore();
  const { hideAllWebViews, showAllWebViews } = useBrowserStore();
  const { t } = useLocaleStore();

  // 测试连接状态
  const [testResult, setTestResult] = useState<TestResult>({ status: "idle" });

  // 解析错误信息
  const parseError = useCallback((error: unknown): string => {
    const errorStr = String(error);
    const errorLower = errorStr.toLowerCase();
    
    // 精确匹配 HTTP 状态码（避免误匹配）
    const statusCodePatterns: [RegExp, string][] = [
      [/\b401\b|status[:\s]*401/i, "401"],
      [/\b403\b|status[:\s]*403/i, "403"],
      [/\b404\b|status[:\s]*404/i, "404"],
      [/\b429\b|status[:\s]*429/i, "429"],
      [/\b500\b|status[:\s]*500/i, "500"],
      [/\b502\b|status[:\s]*502/i, "502"],
      [/\b503\b|status[:\s]*503/i, "503"],
    ];
    
    for (const [pattern, code] of statusCodePatterns) {
      if (pattern.test(errorStr) && ERROR_MESSAGES[code]) {
        return ERROR_MESSAGES[code];
      }
    }
    
    // 检查常见错误关键词
    if (errorLower.includes("timeout")) return ERROR_MESSAGES.timeout;
    if (errorLower.includes("econnrefused") || errorLower.includes("connection refused")) return ERROR_MESSAGES.connection_refused;
    if (errorLower.includes("unauthorized") || errorLower.includes("invalid api key") || errorLower.includes("invalid_api_key")) return ERROR_MESSAGES["401"];
    if (errorLower.includes("network error") || errorLower.includes("failed to fetch")) return ERROR_MESSAGES.network;
    
    // 返回原始错误（截断过长的）
    return errorStr.length > 100 ? errorStr.slice(0, 100) + "..." : errorStr;
  }, []);

  // 测试 API 连接
  const testConnection = useCallback(async () => {
    // 检查 API Key（Ollama 除外）
    if (config.provider !== "ollama" && !config.apiKey) {
      setTestResult({ status: "error", message: ERROR_MESSAGES.no_key });
      return;
    }

    setTestResult({ status: "testing" });
    const startTime = Date.now();

    try {
      const provider = createProvider(config);
      
      // 发送简单测试请求
      const response = await provider.call(
        [{ role: "user", content: "Reply with exactly: OK" }],
        { maxTokens: 10, temperature: 0 }
      );

      const latency = Date.now() - startTime;
      
      if (response.content) {
        setTestResult({
          status: "success",
          message: `连接成功`,
          latency,
        });
      } else {
        setTestResult({
          status: "error",
          message: "服务响应异常，未返回内容",
        });
      }
    } catch (error) {
      setTestResult({
        status: "error",
        message: parseError(error),
      });
    }
  }, [config, parseError]);

  // 配置变化时重置测试状态
  useEffect(() => {
    setTestResult({ status: "idle" });
  }, [config.provider, config.apiKey, config.model, config.baseUrl]);

  // 弹窗打开时隐藏 WebView，关闭时恢复
  useEffect(() => {
    if (isOpen) {
      hideAllWebViews();
    } else {
      showAllWebViews();
    }
  }, [isOpen, hideAllWebViews, showAllWebViews]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 模态内容 */}
      <div className="relative w-[520px] max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden border border-border bg-background/95 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/60">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Settings size={16} />
            <span>{t.aiSettings.title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            {t.aiSettings.close}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* AI Provider Settings */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-foreground flex items-center gap-2">
              <span>🤖 {t.aiSettings.mainModel}</span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">服务商</label>
              <select
                value={config.provider}
                onChange={(e) => {
                  const provider = e.target.value as LLMProviderType;
                  const providerMeta = PROVIDER_REGISTRY[provider];
                  const defaultModel = providerMeta?.models[0]?.id || "";
                  setConfig({ provider, model: defaultModel });
                }}
                className="w-full text-xs p-2 rounded border border-border bg-background"
              >
                {Object.entries(PROVIDER_REGISTRY).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label} - {meta.description}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t.aiSettings.apiKey} {config.provider === "ollama" && <span className="text-muted-foreground">({t.aiSettings.apiKeyOptional})</span>}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ apiKey: e.target.value })}
                  placeholder={
                    config.provider === "ollama"
                      ? t.aiSettings.localModelNoKey
                      : config.provider === "anthropic"
                        ? "sk-ant-..."
                        : "sk-..."
                  }
                  className="flex-1 text-xs p-2 rounded border border-border bg-background"
                />
                <button
                  onClick={testConnection}
                  disabled={testResult.status === "testing"}
                  className={`px-3 py-2 text-xs rounded border transition-all flex items-center gap-1.5 min-w-[90px] justify-center ${
                    testResult.status === "success"
                      ? "border-green-500/50 bg-green-500/10 text-green-500"
                      : testResult.status === "error"
                        ? "border-red-500/50 bg-red-500/10 text-red-500"
                        : "border-border hover:bg-muted"
                  }`}
                >
                  {testResult.status === "testing" ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      测试中
                    </>
                  ) : testResult.status === "success" ? (
                    <>
                      <Check size={12} />
                      {testResult.latency ? `${(testResult.latency / 1000).toFixed(1)}s` : "成功"}
                    </>
                  ) : testResult.status === "error" ? (
                    <>
                      <X size={12} />
                      失败
                    </>
                  ) : (
                    <>
                      <Zap size={12} />
                      测试
                    </>
                  )}
                </button>
              </div>
              {/* 测试结果详情 */}
              {testResult.status === "error" && testResult.message && (
                <div className="mt-1.5 text-xs text-red-500 bg-red-500/10 rounded px-2 py-1.5 flex items-start gap-1.5">
                  <X size={12} className="shrink-0 mt-0.5" />
                  <span>{testResult.message}</span>
                </div>
              )}
              {testResult.status === "success" && (
                <div className="mt-1.5 text-xs text-green-500 bg-green-500/10 rounded px-2 py-1.5 flex items-center gap-1.5">
                  <Check size={12} />
                  <span>连接成功，API 配置有效</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">模型</label>
              <select
                value={
                  PROVIDER_REGISTRY[config.provider as LLMProviderType]?.models.some(m => m.id === config.model)
                    ? config.model
                    : "custom"
                }
                onChange={(e) => {
                  const newModel = e.target.value;
                  if (newModel === "custom") {
                    setConfig({ model: newModel, customModelId: "" });
                  } else {
                    setConfig({ model: newModel });
                  }
                }}
                className="w-full text-xs p-2 rounded border border-border bg-background"
              >
                {PROVIDER_REGISTRY[config.provider as LLMProviderType]?.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} {model.supportsThinking ? "🧠" : ""}
                  </option>
                ))}
              </select>
            </div>

            {config.model === "custom" && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">自定义模型 ID</label>
                <input
                  type="text"
                  value={config.customModelId || ""}
                  onChange={(e) => setConfig({ customModelId: e.target.value })}
                  placeholder={t.aiSettings.customModelHint}
                  className="w-full text-xs p-2 rounded border border-border bg-background"
                />
              </div>
            )}

            {config.model === "custom" && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {t.aiSettings.baseUrl} <span className="text-muted-foreground">({t.aiSettings.baseUrlOptional})</span>
                </label>
                <input
                  type="text"
                  value={config.baseUrl || ""}
                  onChange={(e) => setConfig({ baseUrl: e.target.value || undefined })}
                  placeholder={PROVIDER_REGISTRY[config.provider as LLMProviderType]?.defaultBaseUrl}
                  className="w-full text-xs p-2 rounded border border-border bg-background"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">{t.aiSettings.temperature}</label>
                <span className="text-xs text-muted-foreground">{config.temperature ?? 0.3}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature ?? 0.3}
                onChange={(e) => setConfig({ temperature: parseFloat(e.target.value) })}
                className="w-full accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          {/* 动态路由设置 */}
          <div className="space-y-2 pt-3 border-t border-border">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span className="flex items-center gap-1">
                <Zap size={16} className="text-amber-500" />
                动态路由 (Intent Routing)
              </span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.routing?.enabled || false}
                  onChange={(e) => {
                    const currentRouting = config.routing || {
                      enabled: false,
                      targetIntents: ["chat", "search"] as any,
                    };
                    // 强制设置 targetIntents 为 chat 和 search
                    setConfig({ 
                      routing: { 
                        ...currentRouting, 
                        enabled: e.target.checked,
                        targetIntents: ["chat", "search"]
                      } 
                    });
                  }}
                  className="w-3 h-3"
                />
                <span className="text-xs text-muted-foreground">启用</span>
              </label>
            </div>

            {config.routing?.enabled && (
              <div className="space-y-4 pl-2 border-l-2 border-muted ml-1">
                <div className="text-xs text-muted-foreground">
                  配置意图识别模型和路由规则。
                </div>

                {/* 1. 意图识别模型配置 */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-foreground">🧠 意图识别模型 (Intent Model)</div>
                  <div className="text-[10px] text-muted-foreground mb-1">用于分析用户意图 (Chat/Search/Edit/...)</div>
                  
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">服务商</label>
                    <select
                      value={config.routing.intentProvider || config.provider}
                      onChange={(e) => {
                        const provider = e.target.value as LLMProviderType;
                        const providerMeta = PROVIDER_REGISTRY[provider];
                        const defaultModel = providerMeta?.models[0]?.id || "";
                        const currentRouting = config.routing!;
                        setConfig({ 
                          routing: { 
                            ...currentRouting, 
                            intentProvider: provider,
                            intentModel: defaultModel
                          } 
                        });
                      }}
                      className="w-full text-xs p-2 rounded border border-border bg-background"
                    >
                      {Object.entries(PROVIDER_REGISTRY).map(([key, meta]) => (
                        <option key={key} value={key}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      API Key <span className="text-muted-foreground">(留空则使用主 Key)</span>
                    </label>
                    <input
                      type="password"
                      value={config.routing.intentApiKey || ""}
                      onChange={(e) => {
                        const currentRouting = config.routing!;
                        setConfig({ 
                          routing: { ...currentRouting, intentApiKey: e.target.value } 
                        });
                      }}
                      placeholder="sk-..."
                      className="w-full text-xs p-2 rounded border border-border bg-background"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">模型</label>
                    <select
                      value={
                        PROVIDER_REGISTRY[(config.routing.intentProvider || config.provider) as LLMProviderType]?.models.some(m => m.id === config.routing?.intentModel)
                          ? config.routing.intentModel
                          : "custom"
                      }
                      onChange={(e) => {
                        const newModel = e.target.value;
                        const currentRouting = config.routing!;
                        if (newModel === "custom") {
                          setConfig({ 
                            routing: { ...currentRouting, intentModel: "custom", intentCustomModelId: "" } 
                          });
                        } else {
                          setConfig({ 
                            routing: { ...currentRouting, intentModel: newModel } 
                          });
                        }
                      }}
                      className="w-full text-xs p-2 rounded border border-border bg-background"
                    >
                      {PROVIDER_REGISTRY[(config.routing.intentProvider || config.provider) as LLMProviderType]?.models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {config.routing.intentModel === "custom" && (
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">自定义模型 ID</label>
                      <input
                        type="text"
                        value={config.routing.intentCustomModelId || ""}
                        onChange={(e) => {
                          const currentRouting = config.routing!;
                          setConfig({ 
                            routing: { ...currentRouting, intentCustomModelId: e.target.value } 
                          });
                        }}
                        placeholder="例如：deepseek-ai/DeepSeek-V3"
                        className="w-full text-xs p-2 rounded border border-border bg-background"
                      />
                    </div>
                  )}

                  {config.routing.intentModel === "custom" && (
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Base URL <span className="text-muted-foreground">(可选)</span>
                      </label>
                      <input
                        type="text"
                        value={config.routing.intentBaseUrl || ""}
                        onChange={(e) => {
                          const currentRouting = config.routing!;
                          setConfig({ 
                            routing: { ...currentRouting, intentBaseUrl: e.target.value } 
                          });
                        }}
                        placeholder={PROVIDER_REGISTRY[(config.routing.intentProvider || config.provider) as LLMProviderType]?.defaultBaseUrl}
                        className="w-full text-xs p-2 rounded border border-border bg-background"
                      />
                    </div>
                  )}
                </div>

                {/* 2. 聊天模型配置 */}
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div className="text-xs font-medium text-foreground">💬 聊天模型 (Chat Model)</div>
                  <div className="text-[10px] text-muted-foreground mb-1">用于 Chat 模式和简单任务 (如闲聊、搜索)</div>
                  
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">服务商</label>
                    <select
                      value={config.routing.chatProvider || ""}
                      onChange={(e) => {
                        const provider = e.target.value;
                        const currentRouting = config.routing!;
                        
                        if (!provider) {
                          setConfig({ 
                            routing: { 
                              ...currentRouting, 
                              chatProvider: undefined,
                              chatApiKey: undefined,
                              chatModel: undefined,
                              chatCustomModelId: undefined,
                              chatBaseUrl: undefined
                            } 
                          });
                          return;
                        }

                        const providerMeta = PROVIDER_REGISTRY[provider as LLMProviderType];
                        const defaultModel = providerMeta?.models[0]?.id || "";
                        
                        setConfig({ 
                          routing: { 
                            ...currentRouting, 
                            chatProvider: provider as LLMProviderType,
                            chatModel: defaultModel
                          } 
                        });
                      }}
                      className="w-full text-xs p-2 rounded border border-border bg-background"
                    >
                      <option value="">🔄 跟随主模型 (默认)</option>
                      {Object.entries(PROVIDER_REGISTRY).map(([key, meta]) => (
                        <option key={key} value={key}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!config.routing.chatProvider ? (
                    <div className="p-2 bg-muted/50 rounded border border-border/50 text-[10px] text-muted-foreground">
                      <AlertTriangle size={12} className="text-amber-500 inline mr-1" />
                      未配置专用聊天模型，将使用主模型处理所有任务。建议配置轻量级模型（如 GPT-4o-mini, Gemini Flash）以降低成本并提高速度。
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">
                          API Key <span className="text-muted-foreground">(留空则使用主 Key)</span>
                        </label>
                        <input
                          type="password"
                          value={config.routing.chatApiKey || ""}
                          onChange={(e) => {
                            const currentRouting = config.routing!;
                            setConfig({ 
                              routing: { ...currentRouting, chatApiKey: e.target.value } 
                            });
                          }}
                          placeholder="sk-..."
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">模型</label>
                        <select
                          value={
                            PROVIDER_REGISTRY[config.routing.chatProvider as LLMProviderType]?.models.some(m => m.id === config.routing?.chatModel)
                              ? config.routing.chatModel
                              : "custom"
                          }
                          onChange={(e) => {
                            const newModel = e.target.value;
                            const currentRouting = config.routing!;
                            if (newModel === "custom") {
                              setConfig({ 
                                routing: { ...currentRouting, chatModel: "custom", chatCustomModelId: "" } 
                              });
                            } else {
                              setConfig({ 
                                routing: { ...currentRouting, chatModel: newModel } 
                              });
                            }
                          }}
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        >
                          {PROVIDER_REGISTRY[config.routing.chatProvider as LLMProviderType]?.models.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {config.routing.chatModel === "custom" && (
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">自定义模型 ID</label>
                          <input
                            type="text"
                            value={config.routing.chatCustomModelId || ""}
                            onChange={(e) => {
                              const currentRouting = config.routing!;
                              setConfig({ 
                                routing: { ...currentRouting, chatCustomModelId: e.target.value } 
                              });
                            }}
                            placeholder="例如：deepseek-ai/DeepSeek-V3"
                            className="w-full text-xs p-2 rounded border border-border bg-background"
                          />
                        </div>
                      )}

                      {config.routing.chatModel === "custom" && (
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">
                            Base URL <span className="text-muted-foreground">(可选)</span>
                          </label>
                          <input
                            type="text"
                            value={config.routing.chatBaseUrl || ""}
                            onChange={(e) => {
                              const currentRouting = config.routing!;
                              setConfig({ 
                                routing: { ...currentRouting, chatBaseUrl: e.target.value } 
                              });
                            }}
                            placeholder={PROVIDER_REGISTRY[config.routing.chatProvider as LLMProviderType]?.defaultBaseUrl}
                            className="w-full text-xs p-2 rounded border border-border bg-background"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* 3. 路由规则说明 */}
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div className="text-xs font-medium text-foreground">📋 路由规则</div>
                  <div className="text-[10px] text-muted-foreground">
                    系统将自动使用"聊天模型"处理以下任务，以节省成本并提高速度：
                    <ul className="list-disc list-inside mt-1 space-y-0.5 text-muted-foreground/80">
                      <li>💬 闲聊 (Chat) - 日常对话、灵感启发</li>
                      <li>🔍 搜索 (Search) - 知识检索、信息查询</li>
                    </ul>
                    <div className="mt-1 text-[10px] opacity-70">
                      * 其他复杂任务（如编辑、整理、写作）将始终使用"主模型"以保证质量。
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Agent 设置 */}
          <div className="space-y-2 pt-3 border-t border-border">
            <div className="text-xs font-medium text-foreground">🤖 {t.aiSettings.agentSettings}</div>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                className="w-3 h-3 rounded border-border"
              />
              {t.aiSettings.autoApproveTools}
              <span className="text-muted-foreground">({t.aiSettings.noManualConfirm})</span>
            </label>
          </div>

          {/* RAG 设置（完整，与 RightPanel 同步） */}
          <div className="space-y-2 pt-3 border-t border-border">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span className="flex items-center gap-1">
                <Tag size={12} />
                语义搜索 (RAG)
              </span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ragConfig.enabled}
                  onChange={(e) => setRAGConfig({ enabled: e.target.checked })}
                  className="w-3 h-3"
                />
                <span className="text-xs text-muted-foreground">启用</span>
              </label>
            </div>

            {ragConfig.enabled && (
              <>
                {/* RAG 当前状态 + 操作按钮 */}
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">
                    {ragIsIndexing
                      ? `正在索引${
                          typeof indexStatus?.progress === "number"
                            ? `：${Math.round(indexStatus.progress * 100)}%`
                            : "..."
                        }`
                      : indexStatus
                        ? `已索引 ${indexStatus.totalChunks ?? 0} 个片段`
                        : "尚未建立索引"}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={rebuildIndex}
                      disabled={ragIsIndexing}
                      className="px-2 py-1 rounded border border-border text-xs hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      重新索引
                    </button>
                    {ragIsIndexing && (
                      <button
                        type="button"
                        onClick={cancelIndex}
                        className="px-2 py-1 rounded border border-red-500/60 text-xs text-red-500 hover:bg-red-500/10"
                      >
                        取消索引
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Embedding 服务</label>
                  <select
                    value={ragConfig.embeddingProvider}
                    onChange={(e) => {
                      const provider = e.target.value as "openai" | "ollama";
                      const defaultModels: Record<string, string> = {
                        openai: "text-embedding-3-small",
                        ollama: "nomic-embed-text",
                      };
                      setRAGConfig({
                        embeddingProvider: provider,
                        embeddingModel: defaultModels[provider],
                      });
                    }}
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="ollama">Ollama (本地)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Embedding API Key
                    {ragConfig.embeddingProvider === "ollama" && (
                      <span className="text-muted-foreground/60 ml-1">(可选)</span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={ragConfig.embeddingApiKey || ""}
                    onChange={(e) => setRAGConfig({ embeddingApiKey: e.target.value })}
                    placeholder={
                      ragConfig.embeddingProvider === "openai" ? "sk-..." : "http://localhost:11434"
                    }
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Embedding Base URL</label>
                  <input
                    type="text"
                    value={ragConfig.embeddingBaseUrl || ""}
                    onChange={(e) => setRAGConfig({ embeddingBaseUrl: e.target.value })}
                    placeholder={
                      ragConfig.embeddingProvider === "openai"
                        ? "https://api.openai.com/v1"
                        : "http://localhost:11434"
                    }
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Embedding 模型</label>
                  <input
                    type="text"
                    value={ragConfig.embeddingModel}
                    onChange={(e) => setRAGConfig({ embeddingModel: e.target.value })}
                    placeholder="Qwen/Qwen3-Embedding-8B"
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    向量维度
                    <span className="text-muted-foreground/60 ml-1">(可选)</span>
                  </label>
                  <input
                    type="number"
                    value={ragConfig.embeddingDimensions || ""}
                    onChange={(e) =>
                      setRAGConfig({
                        embeddingDimensions: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                    placeholder="如 1024（留空使用默认）"
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>

                {/* Reranker Settings */}
                <div className="border-t border-border pt-3 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium">重排序 (Reranker)</span>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={ragConfig.rerankerEnabled || false}
                        onChange={(e) => setRAGConfig({ rerankerEnabled: e.target.checked })}
                        className="w-3 h-3"
                      />
                      <span className="text-xs text-muted-foreground">启用</span>
                    </label>
                  </div>

                  {ragConfig.rerankerEnabled && (
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Reranker Base URL</label>
                        <input
                          type="text"
                          value={ragConfig.rerankerBaseUrl || ""}
                          onChange={(e) => setRAGConfig({ rerankerBaseUrl: e.target.value })}
                          placeholder="https://api.siliconflow.cn/v1"
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Reranker API Key</label>
                        <input
                          type="password"
                          value={ragConfig.rerankerApiKey || ""}
                          onChange={(e) => setRAGConfig({ rerankerApiKey: e.target.value })}
                          placeholder="sk-..."
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Reranker 模型</label>
                        <input
                          type="text"
                          value={ragConfig.rerankerModel || ""}
                          onChange={(e) => setRAGConfig({ rerankerModel: e.target.value })}
                          placeholder="BAAI/bge-reranker-v2-m3"
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">返回数量 (Top N)</label>
                        <input
                          type="number"
                          value={ragConfig.rerankerTopN || 5}
                          onChange={(e) =>
                            setRAGConfig({ rerankerTopN: parseInt(e.target.value) || 5 })
                          }
                          min={1}
                          max={20}
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Index Status */}
                <div className="bg-muted/50 rounded p-2 space-y-2 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">索引状态</span>
                    {ragIsIndexing ? (
                      <span className="text-yellow-500 flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" />
                        索引中...
                      </span>
                    ) : indexStatus?.initialized ? (
                      <span className="text-green-500 flex items-center gap-1"><Check size={12} /> 已就绪</span>
                    ) : (
                      <span className="text-muted-foreground">未初始化</span>
                    )}
                  </div>

                  {ragIsIndexing && indexStatus?.progress && typeof indexStatus.progress !== "number" && (
                    <div className="space-y-1">
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{
                            width: `${Math.round(
                              (indexStatus.progress.current /
                                Math.max(indexStatus.progress.total, 1)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground flex justify-between">
                        <span>
                          {indexStatus.progress.current} / {indexStatus.progress.total} 文件
                        </span>
                        <span>
                          {Math.round(
                            (indexStatus.progress.current /
                              Math.max(indexStatus.progress.total, 1)) * 100
                          )}%
                        </span>
                      </div>
                      {indexStatus.progress.currentFile && (
                        <div
                          className="text-xs text-muted-foreground truncate"
                          title={indexStatus.progress.currentFile}
                        >
                          正在处理: {indexStatus.progress.currentFile.split(/[/\\]/).pop()}
                        </div>
                      )}
                    </div>
                  )}

                  {!ragIsIndexing && indexStatus && (
                    <div className="text-xs text-muted-foreground">
                      {indexStatus.totalFiles} 个文件, {indexStatus.totalChunks} 个块
                    </div>
                  )}

                  {ragError && (
                    <div className="text-xs text-red-500">
                      {ragError}
                    </div>
                  )}

                  <button
                    onClick={() => rebuildIndex()}
                    disabled={ragIsIndexing || (ragConfig.embeddingProvider === 'openai' && !ragConfig.embeddingApiKey)}
                    className="w-full text-xs py-1 px-2 bg-primary/10 hover:bg-primary/20 text-primary rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {ragIsIndexing ? "索引中..." : "重建索引"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Deep Research 网络搜索设置 */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Zap size={14} className="text-yellow-500" />
              Deep Research 网络搜索
            </div>
            <p className="text-xs text-muted-foreground">
              配置 Tavily API Key 以在深度研究时搜索互联网内容
            </p>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Tavily API Key
                <a
                  href="https://tavily.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary ml-1 hover:underline"
                >
                  (获取 API Key)
                </a>
              </label>
              <input
                type="password"
                value={config.tavilyApiKey || ""}
                onChange={(e) => setConfig({ tavilyApiKey: e.target.value })}
                placeholder="tvly-xxxxxxxxxx"
                className="w-full text-xs p-2 rounded border border-border bg-background"
              />
              {config.tavilyApiKey && (
                <p className="text-xs text-green-500 mt-1 flex items-center gap-1"><Check size={12} /> 已配置，Deep Research 将搜索网络内容</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
