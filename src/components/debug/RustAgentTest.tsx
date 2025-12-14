/**
 * Rust Agent 测试组件
 * 
 * 用于验证 Rust Agent 后端是否正常工作
 */

import { useState, useEffect } from "react";
import { useRustAgentStore, initRustAgentListeners } from "@/stores/useRustAgentStore";
import { useFileStore } from "@/stores/useFileStore";
import { getAIConfig } from "@/services/ai/ai";

export function RustAgentTest() {
  const [input, setInput] = useState("");
  const [initialized, setInitialized] = useState(false);
  
  const { 
    status, 
    messages, 
    streamingContent,
    currentPlan,
    error, 
    startTask, 
    abort, 
    clearChat 
  } = useRustAgentStore();
  
  const vaultPath = useFileStore((s) => s.vaultPath);

  // 初始化事件监听器
  useEffect(() => {
    initRustAgentListeners().then(() => {
      setInitialized(true);
      console.log("[RustAgentTest] 事件监听器已初始化");
    });
  }, []);

  const handleSubmit = async () => {
    if (!input.trim() || !vaultPath) return;
    
    console.log("[RustAgentTest] 启动 Rust Agent 任务:", input);
    
    await startTask(input, {
      workspace_path: vaultPath,
    });
    
    setInput("");
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl border p-4 z-50">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-sm">🦀 Rust Agent 测试</h3>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs ${
            status === "running" ? "bg-yellow-100 text-yellow-800" :
            status === "completed" ? "bg-green-100 text-green-800" :
            status === "error" ? "bg-red-100 text-red-800" :
            "bg-gray-100 text-gray-800"
          }`}>
            {status}
          </span>
          {!initialized && <span className="text-xs text-red-500">未初始化</span>}
        </div>
      </div>

      {/* 消息列表 */}
      <div className="h-48 overflow-y-auto mb-2 text-xs space-y-1 bg-gray-50 dark:bg-gray-900 rounded p-2">
        {messages.map((msg, i) => (
          <div key={i} className={`${
            msg.role === "user" ? "text-blue-600" : 
            msg.role === "tool" ? "text-purple-600" :
            "text-gray-800 dark:text-gray-200"
          }`}>
            <strong>{msg.role}:</strong> {msg.content.slice(0, 100)}
            {msg.content.length > 100 && "..."}
          </div>
        ))}
        
        {/* 流式输出 */}
        {streamingContent && (
          <div className="text-green-600 animate-pulse">
            <strong>streaming:</strong> {streamingContent.slice(-100)}
          </div>
        )}
        
        {/* 当前计划 */}
        {currentPlan && (
          <div className="text-orange-600">
            <strong>计划:</strong> {currentPlan.steps.length} 步骤
          </div>
        )}
        
        {/* 错误 */}
        {error && (
          <div className="text-red-600">
            <strong>错误:</strong> {error}
          </div>
        )}
      </div>

      {/* 输入 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="输入测试任务..."
          className="flex-1 px-2 py-1 text-sm border rounded"
          disabled={status === "running"}
        />
        {status === "running" ? (
          <button
            onClick={abort}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded"
          >
            停止
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded"
            disabled={!vaultPath}
          >
            发送
          </button>
        )}
        <button
          onClick={clearChat}
          className="px-2 py-1 text-sm bg-gray-200 rounded"
        >
          清空
        </button>
      </div>
      
      <div className="mt-2 text-xs text-gray-500 space-y-1">
        <div>工作区: {vaultPath || "未选择"}</div>
        <div>
          配置: {getAIConfig().provider} / {
            getAIConfig().model === "custom" 
              ? getAIConfig().customModelId || "未设置自定义模型"
              : getAIConfig().model
          }
          {getAIConfig().apiKey ? " ✅" : " ❌无API Key"}
        </div>
      </div>
    </div>
  );
}
