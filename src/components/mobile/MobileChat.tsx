import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Settings, X, Check, Menu, Plus, MessageSquare, Trash2, Star, Mic } from 'lucide-react';
import { useAgentStore } from '@/stores/useAgentStore';
import { useAIStore } from '@/stores/useAIStore';
import { PROVIDER_REGISTRY, type LLMProviderType } from '@/services/llm/types';
import { useFileStore } from '@/stores/useFileStore';
import { useUIStore } from '@/stores/useUIStore';
import { 
  startListening, 
  cancelListening, 
  onPartialResult, 
  isNativeSpeechAvailable 
} from '@/lib/speech';

interface MobileChatProps {
  onToggleSidebar?: () => void;
}

export function MobileChat({ onToggleSidebar }: MobileChatProps) {
  // Agent Store (主要对话逻辑)
  const { 
    messages, 
    status,
    startTask,
    sessions,
    currentSessionId,
  } = useAgentStore();
  
  // AI Store (配置)
  const { config, setConfig } = useAIStore();
  
  // File Store (获取当前文件信息)
  const { vaultPath } = useFileStore();
  
  // UI Store (字号设置)
  const { mobileFontSize, setMobileFontSize } = useUIStore();
  
  const isStreaming = status === 'running';
  
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isKeyboardMode, setIsKeyboardMode] = useState(false); // 是否在键盘输入模式
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPressing = useRef(false);
  const didLongPress = useRef(false);
  const voiceTextRef = useRef('');
  const unlistenPartialRef = useRef<(() => void) | null>(null);

  // 同步 voiceText 到 ref
  useEffect(() => {
    voiceTextRef.current = voiceText;
  }, [voiceText]);

  // 长按开始录音 - 使用 Android 原生 API
  const startRecording = useCallback(async () => {
    if (!isNativeSpeechAvailable()) {
      alert('该设备不支持语音识别');
      return;
    }
    
    isLongPressing.current = true;
    setIsRecording(true);
    setIsCancelling(false);
    setVoiceText('');
    voiceTextRef.current = '';
    
    // 监听实时识别结果
    try {
      const unlisten = await onPartialResult((text) => {
        setVoiceText(text);
        voiceTextRef.current = text;
      });
      unlistenPartialRef.current = unlisten;
    } catch (e) {
      console.error('Failed to setup partial listener:', e);
    }
    
    // 开始语音识别
    const result = await startListening();
    
    // 识别结束后的处理
    if (isLongPressing.current) {
      // 用户还在按住，但识别已结束（可能是静音超时）
      isLongPressing.current = false;
      setIsRecording(false);
      
      // 清理监听器
      unlistenPartialRef.current?.();
      unlistenPartialRef.current = null;
      
      // 如果有结果，发送
      if (result.success && result.text) {
        setVoiceText(result.text);
        voiceTextRef.current = result.text;
        await startTask(result.text, { workspacePath: vaultPath || '' });
        setVoiceText('');
      }
    }
  }, [startTask, vaultPath]);

  // 停止录音并发送
  const stopRecording = useCallback(async (cancel: boolean) => {
    isLongPressing.current = false;
    setIsRecording(false);
    
    // 清理监听器
    unlistenPartialRef.current?.();
    unlistenPartialRef.current = null;
    
    if (cancel) {
      // 取消识别
      await cancelListening();
      setVoiceText('');
    } else {
      // 使用已识别的文本
      const text = voiceTextRef.current.trim();
      if (text) {
        await startTask(text, { workspacePath: vaultPath || '' });
      }
    }
    
    setVoiceText('');
    setIsCancelling(false);
  }, [startTask, vaultPath]);

  // 全局鼠标/触摸释放监听
  useEffect(() => {
    const handleGlobalUp = (e: MouseEvent | TouchEvent) => {
      // 清除长按定时器
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      // 如果正在录音则停止
      if (isLongPressing.current) {
        // 计算是否上滑取消
        let shouldCancel = isCancelling;
        if (e instanceof TouchEvent && e.changedTouches[0]) {
          const deltaY = touchStartY.current - e.changedTouches[0].clientY;
          shouldCancel = deltaY > 50;
        }
        stopRecording(shouldCancel);
      }
    };

    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      if (!isLongPressing.current) return;
      
      let clientY = 0;
      if (e instanceof TouchEvent && e.touches[0]) {
        clientY = e.touches[0].clientY;
      } else if (e instanceof MouseEvent) {
        clientY = e.clientY;
      }
      
      const deltaY = touchStartY.current - clientY;
      setIsCancelling(deltaY > 50);
    };

    document.addEventListener('mouseup', handleGlobalUp);
    document.addEventListener('touchend', handleGlobalUp);
    document.addEventListener('mousemove', handleGlobalMove);
    document.addEventListener('touchmove', handleGlobalMove);
    
    return () => {
      document.removeEventListener('mouseup', handleGlobalUp);
      document.removeEventListener('touchend', handleGlobalUp);
      document.removeEventListener('mousemove', handleGlobalMove);
      document.removeEventListener('touchmove', handleGlobalMove);
    };
  }, [isCancelling, stopRecording]);

  // 开始长按
  const handlePressStart = useCallback((clientY: number) => {
    touchStartY.current = clientY;
    didLongPress.current = false; // 重置长按标记
    
    // 清除之前的定时器
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    
    // 500ms 后启动录音
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true; // 标记已触发长按
      startRecording();
    }, 500);
  }, [startRecording]);

  // 点击输入框进入键盘模式
  const handleInputClick = useCallback(() => {
    // 如果是长按触发的，不进入键盘模式
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    // 清除长按定时器
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsKeyboardMode(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);
  
  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // 发送消息
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    
    const message = input.trim();
    setInput('');
    
    await startTask(message, { workspacePath: vaultPath || '' });
  }, [input, isStreaming, startTask, vaultPath]);

  // 清理消息内容（参考桌面端 MainAIChatShell 的 cleanContent）
  const cleanContent = useCallback((content: string, isUser: boolean): string => {
    // 跳过工具结果消息和系统提示
    if (content.includes("<tool_result") || 
        content.includes("<tool_error") ||
        content.includes("你的响应没有包含有效的工具调用") ||
        content.includes("请使用 <thinking> 标签分析错误原因") ||
        content.includes("系统错误:") ||
        content.includes("系统拒绝执行") ||
        content.includes("用户拒绝了工具调用")) {
      return "";
    }
    
    if (isUser) {
      // 用户消息：提取 <task> 内容，移除上下文标签
      return content
        .replace(/<task>([\s\S]*?)<\/task>/g, "$1")
        .replace(/<current_note[^>]*>[\s\S]*?<\/current_note>/g, "")
        .replace(/<related_notes[^>]*>[\s\S]*?<\/related_notes>/g, "")
        .trim();
    } else {
      // 助手消息
      let text = content;
      
      // 移除 thinking
      text = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "");
      
      // 处理 attempt_completion - 提取 result 内容
      const attemptMatch = text.match(/<attempt_completion>[\s\S]*?<result>([\s\S]*?)<\/result>[\s\S]*?<\/attempt_completion>/);
      if (attemptMatch) {
        text = attemptMatch[1].trim();
      } else {
        // 移除所有工具调用标签
        text = text.replace(/<(read_note|edit_note|create_note|list_notes|move_note|delete_note|search_notes|grep_search|semantic_search|query_database|add_database_row|get_backlinks|ask_user|attempt_completion)>[\s\S]*?<\/\1>/g, "");
      }
      
      // 清理剩余的 XML 标签
      text = text.replace(/<[^>]+>/g, "").trim();
      
      return text;
    }
  }, []);

  // 过滤并清理消息
  const filteredMessages = messages
    .map(msg => ({
      ...msg,
      cleanedContent: cleanContent(msg.content || '', msg.role === 'user')
    }))
    .filter(msg => msg.cleanedContent.trim() !== '');

  // 渲染消息内容，支持加粗
  const renderContent = (content: string) => {
    return content.split('**').map((part, i) => 
      i % 2 === 1 
        ? <span key={i} className="font-bold text-yellow-600 dark:text-yellow-400">{part}</span> 
        : part
    );
  };
  
  // Provider 列表
  const providers = Object.entries(PROVIDER_REGISTRY) as [LLMProviderType, typeof PROVIDER_REGISTRY[keyof typeof PROVIDER_REGISTRY]][];

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 relative">
      {/* 顶部标题栏 */}
      <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 safe-area-top">
        <div className="h-14 px-4 flex justify-between items-center">
          <button 
            onClick={onToggleSidebar}
            className="p-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
          >
            <Menu size={22} />
          </button>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
            {sessions.find(s => s.id === currentSessionId)?.title || '新对话'}
          </h2>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
          >
            <Settings size={22} />
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-2">AI 笔记助手</h2>
            <p className="text-gray-500 dark:text-gray-400 text-center text-sm mb-6">
              {config.apiKey ? '你可以对我说：' : '请先配置 API Key'}
            </p>
            
            {/* 未配置时显示配置按钮 */}
            {!config.apiKey ? (
              <button
                onClick={() => setShowSettings(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium shadow-lg shadow-blue-500/30 active:scale-95 transition-transform"
              >
                配置 API Key
              </button>
            ) : (
              /* 快捷提示 */
              <div className="space-y-2 w-full max-w-xs">
                {[
                  '"新建一个关于周报的笔记"',
                  '"帮我记一下买牛奶和面包"',
                  '"搜索一下会议记录"',
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(prompt.replace(/"/g, ''))}
                    className="w-full p-3 text-left text-sm bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all active:scale-[0.98]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {filteredMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-br-none' 
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-none border border-gray-100 dark:border-gray-700'
                }`}>
                  <div className="whitespace-pre-wrap leading-relaxed" style={{ fontSize: `${mobileFontSize}px` }}>
                    {renderContent(msg.cleanedContent)}
                  </div>
                </div>
              </div>
            ))}
            
            {/* 打字指示器 */}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-none shadow-sm flex items-center space-x-2 border border-gray-100 dark:border-gray-700">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      
      {/* 输入区 - 统一输入框 */}
      <div className="flex-shrink-0 p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
        <div className="flex items-center space-x-2">
          {/* 录音中状态 - 全屏覆盖 */}
          {isRecording ? (
            <div 
              className={`flex-1 py-3.5 rounded-2xl text-center select-none transition-all ${
                isCancelling
                  ? 'bg-red-100 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-700'
                  : 'bg-green-100 dark:bg-green-900/30 border-2 border-green-300 dark:border-green-700'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                {/* 录音动画 */}
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 3, 2, 1].map((h, i) => (
                    <div
                      key={i}
                      className={`w-1 rounded-full transition-all ${
                        isCancelling ? 'bg-red-500' : 'bg-green-500'
                      }`}
                      style={{
                        height: `${h * 4 + 4}px`,
                        animation: isCancelling ? 'none' : `pulse 0.5s ease-in-out ${i * 0.1}s infinite alternate`
                      }}
                    />
                  ))}
                </div>
                <span className={`text-sm font-medium ${
                  isCancelling ? 'text-red-500' : 'text-green-600 dark:text-green-400'
                }`}>
                  {isCancelling ? '↑ 松开取消' : (voiceText || '正在识别...')}
                </span>
              </div>
            </div>
          ) : isKeyboardMode ? (
            /* 键盘输入模式 */
            <>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                onBlur={() => {
                  // 失去焦点时，如果没有内容则退出键盘模式
                  if (!input.trim()) {
                    setTimeout(() => setIsKeyboardMode(false), 100);
                  }
                }}
                placeholder="输入消息..."
                autoFocus
                className="flex-1 py-2.5 px-4 bg-gray-100 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-800 dark:text-white placeholder-gray-400 text-base" 
              />
              {/* 发送按钮 */}
              <button 
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className={`p-2.5 rounded-full transition-all ${
                  input.trim() && !isStreaming
                    ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700 active:scale-95' 
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                }`}
              >
                <Send size={18} />
              </button>
            </>
          ) : (
            /* 默认模式 - 点击输入/长按说话 */
            <>
              <div 
                className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 text-center select-none cursor-pointer active:bg-gray-200 dark:active:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                onClick={handleInputClick}
                onTouchStart={(e) => handlePressStart(e.touches[0].clientY)}
                onMouseDown={(e) => handlePressStart(e.clientY)}
              >
                <Mic size={18} className="text-gray-400" />
                <span className="text-gray-400 text-sm">发消息或按住说话</span>
              </div>
              {/* 发送按钮占位 */}
              <button 
                className="p-2.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400"
                disabled
              >
                <Send size={18} />
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* 录音动画 CSS */}
      <style>{`
        @keyframes pulse {
          from { transform: scaleY(0.6); }
          to { transform: scaleY(1.2); }
        }
      `}</style>

      {/* 设置面板 */}
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-black/50" onClick={() => setShowSettings(false)}>
          <div 
            className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl max-h-[85vh] overflow-hidden animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white">AI 设置</h3>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* 设置内容 */}
            <div className="p-4 space-y-6 overflow-y-auto max-h-[70vh]">
              {/* Provider 选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  AI 服务商
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {providers.map(([id, meta]) => (
                    <button
                      key={id}
                      onClick={() => setConfig({ 
                        provider: id, 
                        model: meta.models[0]?.id || '',
                        baseUrl: meta.defaultBaseUrl 
                      })}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        config.provider === id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-sm text-gray-800 dark:text-white">{meta.label}</div>
                      <div className="text-xs text-gray-500 truncate">{meta.description}</div>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              
              {/* 模型选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  模型
                </label>
                <select
                  value={config.model}
                  onChange={(e) => setConfig({ model: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {PROVIDER_REGISTRY[config.provider]?.models.map(model => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Base URL (可选) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Base URL <span className="text-gray-400">(可选)</span>
                </label>
                <input
                  type="text"
                  value={config.baseUrl || ''}
                  onChange={(e) => setConfig({ baseUrl: e.target.value })}
                  placeholder={PROVIDER_REGISTRY[config.provider]?.defaultBaseUrl || 'https://api.example.com'}
                  className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              
              {/* 字号调整 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  字号大小 <span className="text-gray-400">({mobileFontSize}px)</span>
                </label>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-400">小</span>
                  <input
                    type="range"
                    min={12}
                    max={24}
                    step={1}
                    value={mobileFontSize}
                    onChange={(e) => setMobileFontSize(Number(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                  <span className="text-xs text-gray-400">大</span>
                </div>
                <div 
                  className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-700 dark:text-gray-300"
                  style={{ fontSize: `${mobileFontSize}px` }}
                >
                  这是字号预览效果
                </div>
              </div>
              
              {/* 保存状态指示 */}
              <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400">
                <Check size={16} />
                <span>设置会自动保存</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// 导出侧栏组件供 MobileLayout 使用
export interface ChatSidebarProps {
  onClose: () => void;
}

export function ChatSidebar({ onClose }: ChatSidebarProps) {
  const { 
    sessions,
    currentSessionId,
    createSession,
    switchSession,
    deleteSession,
  } = useAIStore();
  
  const [longPressSession, setLongPressSession] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('chat-favorites');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    localStorage.setItem('chat-favorites', JSON.stringify([...favorites]));
  }, [favorites]);

  const handleTouchStart = useCallback((sessionId: string) => {
    longPressTimer.current = setTimeout(() => {
      setLongPressSession(sessionId);
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const toggleFavorite = useCallback((sessionId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
    setLongPressSession(null);
  }, []);

  const handleDelete = useCallback((sessionId: string) => {
    deleteSession(sessionId);
    setLongPressSession(null);
  }, [deleteSession]);

  return (
    <div className="w-[280px] h-full bg-white dark:bg-gray-900 flex flex-col relative">
      {/* 侧栏头部 */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 safe-area-top">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3">对话</h3>
        
        {/* 新建对话按钮 */}
        <button 
          onClick={() => {
            createSession();
            onClose();
          }}
          className="w-full flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 active:scale-[0.98] transition-all"
        >
          <Plus size={20} />
          <span className="font-medium">新建对话</span>
        </button>
      </div>
      
      {/* 收藏夹 */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">收藏夹</h4>
        {sessions.filter(s => favorites.has(s.id)).length === 0 ? (
          <div className="text-center py-3 text-gray-300 dark:text-gray-600">
            <p className="text-xs">长按对话可收藏</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.filter(s => favorites.has(s.id)).map(session => (
              <div
                key={session.id}
                className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                  session.id === currentSessionId
                    ? 'bg-yellow-50 dark:bg-yellow-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => {
                  switchSession(session.id);
                  onClose();
                }}
                onTouchStart={() => handleTouchStart(session.id)}
                onTouchEnd={handleTouchEnd}
                onMouseDown={() => handleTouchStart(session.id)}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
              >
                <Star size={16} className="flex-shrink-0 text-yellow-500 fill-yellow-500" />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {session.title || '新对话'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* 历史对话 */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">历史对话</h4>
        </div>
        {sessions.filter(s => !favorites.has(s.id)).length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无历史对话</p>
          </div>
        ) : (
          <div className="px-2 pb-4 space-y-1">
            {sessions.filter(s => !favorites.has(s.id)).map(session => (
              <div
                key={session.id}
                className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all select-none ${
                  session.id === currentSessionId
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => {
                  if (!longPressSession) {
                    switchSession(session.id);
                    onClose();
                  }
                }}
                onTouchStart={() => handleTouchStart(session.id)}
                onTouchEnd={handleTouchEnd}
                onMouseDown={() => handleTouchStart(session.id)}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
              >
                <MessageSquare size={18} className={`flex-shrink-0 ${
                  session.id === currentSessionId ? 'text-blue-600' : 'text-gray-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${
                    session.id === currentSessionId 
                      ? 'text-blue-600 dark:text-blue-400' 
                      : 'text-gray-800 dark:text-gray-200'
                  }`}>
                    {session.title || '新对话'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {session.messages.length} 条消息
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* 长按操作菜单 */}
      {longPressSession && (
        <div 
          className="absolute inset-0 bg-black/30 flex items-center justify-center z-10"
          onClick={() => setLongPressSession(null)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden w-48 animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => toggleFavorite(longPressSession)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Star size={18} className={favorites.has(longPressSession) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'} />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {favorites.has(longPressSession) ? '取消收藏' : '收藏'}
              </span>
            </button>
            <div className="h-px bg-gray-100 dark:bg-gray-700" />
            <button
              onClick={() => handleDelete(longPressSession)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              <Trash2 size={18} className="text-red-500" />
              <span className="text-sm font-medium text-red-500">删除</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
