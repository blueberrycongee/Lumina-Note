import { useRef, useCallback, useState, useEffect } from 'react';
import { ChevronLeft, Save, Send, Mic } from 'lucide-react';
import { useFileStore } from '@/stores/useFileStore';
import { useAgentStore } from '@/stores/useAgentStore';
import { useUIStore } from '@/stores/useUIStore';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { 
  startListening, 
  cancelListening, 
  onPartialResult, 
  isNativeSpeechAvailable 
} from '@/lib/speech';

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

// 配置 turndown
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

interface MobileEditorProps {
  onBack?: () => void;
}

export function MobileEditor({ onBack }: MobileEditorProps) {
  const { currentFile, currentContent, save, isDirty, updateContent, vaultPath } = useFileStore();
  const { startTask, status } = useAgentStore();
  const { mobileFontSize } = useUIStore();
  const editorRef = useRef<HTMLDivElement>(null);
  const [renderedHtml, setRenderedHtml] = useState('');
  const isComposing = useRef(false); // 输入法组合状态
  
  // AI 输入框状态
  const [aiInput, setAiInput] = useState('');
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const aiInputRef = useRef<HTMLInputElement>(null);
  const touchStartY = useRef<number>(0);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPressing = useRef(false);
  const didLongPress = useRef(false);
  const voiceTextRef = useRef('');
  const unlistenPartialRef = useRef<(() => void) | null>(null);
  
  const isStreaming = status === 'running';
  
  // 同步 voiceText 到 ref
  useEffect(() => {
    voiceTextRef.current = voiceText;
  }, [voiceText]);
  
  // 开始录音 - 使用 Android 原生 API
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
      isLongPressing.current = false;
      setIsRecording(false);
      
      unlistenPartialRef.current?.();
      unlistenPartialRef.current = null;
      
      if (result.success && result.text) {
        setVoiceText(result.text);
        voiceTextRef.current = result.text;
        await startTask(result.text, {
          workspacePath: vaultPath || '',
          activeNote: currentFile || undefined,
          activeNoteContent: currentContent || undefined,
        });
        setVoiceText('');
      }
    }
  }, [startTask, vaultPath, currentFile, currentContent]);
  
  // 停止录音并发送给 AI
  const stopRecording = useCallback(async (cancel: boolean) => {
    isLongPressing.current = false;
    setIsRecording(false);
    
    unlistenPartialRef.current?.();
    unlistenPartialRef.current = null;
    
    if (cancel) {
      await cancelListening();
      setVoiceText('');
    } else {
      const text = voiceTextRef.current.trim();
      if (text) {
        await startTask(text, {
          workspacePath: vaultPath || '',
          activeNote: currentFile || undefined,
          activeNoteContent: currentContent || undefined,
        });
      }
    }
    
    setVoiceText('');
    setIsCancelling(false);
  }, [startTask, vaultPath, currentFile, currentContent]);
  
  // 全局触摸事件监听
  useEffect(() => {
    const handleGlobalUp = (e: MouseEvent | TouchEvent) => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (isLongPressing.current) {
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
    didLongPress.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      startRecording();
    }, 500);
  }, [startRecording]);
  
  // 点击输入框
  const handleAiInputClick = useCallback(() => {
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsKeyboardMode(true);
    setTimeout(() => aiInputRef.current?.focus(), 50);
  }, []);
  
  // 发送 AI 消息
  const handleAiSend = useCallback(async () => {
    if (!aiInput.trim() || isStreaming) return;
    const message = aiInput.trim();
    setAiInput('');
    setIsKeyboardMode(false);
    
    await startTask(message, {
      workspacePath: vaultPath || '',
      activeNote: currentFile || undefined,
      activeNoteContent: currentContent || undefined,
    });
  }, [aiInput, isStreaming, startTask, vaultPath, currentFile, currentContent]);
  
  // Markdown 渲染为 HTML
  useEffect(() => {
    const html = marked.parse(currentContent || '') as string;
    setRenderedHtml(html);
  }, [currentContent, currentFile]);
  
  // 编辑内容变化时，转换回 Markdown
  const handleInput = useCallback(() => {
    if (isComposing.current) return; // 输入法组合中不处理
    
    const editor = editorRef.current;
    if (!editor) return;
    
    const html = editor.innerHTML;
    const markdown = turndown.turndown(html);
    updateContent(markdown, 'user');
  }, [updateContent]);
  
  // 获取标题
  const fileName = currentFile?.split(/[/\\]/).pop()?.replace('.md', '') || '无标题';

  // 无文件打开
  if (!currentFile) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-white dark:bg-gray-900">
        <div className="text-center text-gray-500">
          <p className="text-lg mb-2">没有打开的文件</p>
          <p className="text-sm">从文件列表中选择一个笔记</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* 顶部导航栏 */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-gray-900 safe-area-top">
        <button 
          onClick={onBack}
          className="flex items-center text-blue-600 font-medium transition-colors"
        >
          <ChevronLeft size={22} className="mr-0.5"/> 列表
        </button>
        <span className="text-sm text-gray-500 truncate max-w-[40%]">{fileName}</span>
        <button 
          onClick={() => save()}
          disabled={!isDirty}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isDirty 
              ? 'bg-blue-600 text-white' 
              : 'text-gray-400'
          }`}
        >
          <Save size={16} />
          保存
        </button>
      </div>
      
      {/* 所见即所得编辑区 */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="flex-1 w-full px-5 py-4 overflow-y-auto bg-transparent text-gray-800 dark:text-gray-200 focus:outline-none prose dark:prose-invert max-w-none"
        style={{ fontSize: `${mobileFontSize}px` }}
        onInput={handleInput}
        onCompositionStart={() => { isComposing.current = true; }}
        onCompositionEnd={() => { 
          isComposing.current = false; 
          handleInput(); 
        }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
      
      {/* AI 输入框 */}
      <div className="flex-shrink-0 p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
        <div className="flex items-center space-x-2">
          {isRecording ? (
            <div className={`flex-1 py-3.5 rounded-2xl text-center select-none transition-all ${
              isCancelling
                ? 'bg-red-100 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-700'
                : 'bg-green-100 dark:bg-green-900/30 border-2 border-green-300 dark:border-green-700'
            }`}>
              <div className="flex items-center justify-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 3, 2, 1].map((h, i) => (
                    <div key={i} className={`w-1 rounded-full transition-all ${isCancelling ? 'bg-red-500' : 'bg-green-500'}`}
                      style={{ height: `${h * 4 + 4}px`, animation: isCancelling ? 'none' : `pulse 0.5s ease-in-out ${i * 0.1}s infinite alternate` }} />
                  ))}
                </div>
                <span className={`text-sm font-medium ${isCancelling ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                  {isCancelling ? '↑ 松开取消' : (voiceText || '正在识别...')}
                </span>
              </div>
            </div>
          ) : isKeyboardMode ? (
            <>
              <input
                ref={aiInputRef}
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSend(); } }}
                onBlur={() => { if (!aiInput.trim()) setTimeout(() => setIsKeyboardMode(false), 100); }}
                placeholder="对当前笔记说点什么..."
                autoFocus
                className="flex-1 py-2.5 px-4 bg-gray-100 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-800 dark:text-white placeholder-gray-400 text-base"
              />
              <button onClick={handleAiSend} disabled={!aiInput.trim() || isStreaming}
                className={`p-2.5 rounded-full transition-all ${aiInput.trim() && !isStreaming ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}>
                <Send size={18} />
              </button>
            </>
          ) : (
            <>
              <div className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 text-center select-none cursor-pointer active:bg-gray-200 dark:active:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                onClick={handleAiInputClick}
                onTouchStart={(e) => handlePressStart(e.touches[0].clientY)}
                onMouseDown={(e) => handlePressStart(e.clientY)}>
                <Mic size={18} className="text-gray-400" />
                <span className="text-gray-400 text-sm">对当前笔记说点什么...</span>
              </div>
              <button className="p-2.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400" disabled>
                <Send size={18} />
              </button>
            </>
          )}
        </div>
      </div>
      
      <style>{`
        @keyframes pulse {
          from { transform: scaleY(0.6); }
          to { transform: scaleY(1.2); }
        }
      `}</style>
    </div>
  );
}
