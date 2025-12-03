import { useRef, useCallback, useState, useEffect } from 'react';
import { Bold, Italic, List, ListOrdered, Link, Image, Code, Heading1, Heading2, Save, MoreHorizontal, ChevronLeft } from 'lucide-react';
import { useFileStore } from '@/stores/useFileStore';

interface MobileEditorProps {
  onBack?: () => void;
}

export function MobileEditor({ onBack }: MobileEditorProps) {
  const { currentFile, currentContent, save, isDirty, updateContent } = useFileStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localContent, setLocalContent] = useState(currentContent);
  const [showMoreTools, setShowMoreTools] = useState(false);
  
  // 同步内容
  useEffect(() => {
    setLocalContent(currentContent);
  }, [currentContent, currentFile]);
  
  // 内容变化时更新 store
  const handleContentChange = useCallback((newContent: string) => {
    setLocalContent(newContent);
    updateContent(newContent, 'user');
  }, [updateContent]);
  
  // 插入文本的辅助函数
  const insertText = useCallback((before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = localContent.substring(start, end);
    const newContent = localContent.substring(0, start) + before + selectedText + after + localContent.substring(end);
    
    handleContentChange(newContent);
    
    // 设置光标位置
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 0);
  }, [localContent, handleContentChange]);
  
  // 工具栏操作
  const tools = [
    { icon: <Bold className="w-5 h-5" />, action: () => insertText('**', '**'), label: '粗体' },
    { icon: <Italic className="w-5 h-5" />, action: () => insertText('*', '*'), label: '斜体' },
    { icon: <Heading1 className="w-5 h-5" />, action: () => insertText('# '), label: '标题1' },
    { icon: <Heading2 className="w-5 h-5" />, action: () => insertText('## '), label: '标题2' },
    { icon: <List className="w-5 h-5" />, action: () => insertText('- '), label: '列表' },
    { icon: <ListOrdered className="w-5 h-5" />, action: () => insertText('1. '), label: '有序列表' },
  ];
  
  const moreTools = [
    { icon: <Code className="w-5 h-5" />, action: () => insertText('`', '`'), label: '代码' },
    { icon: <Link className="w-5 h-5" />, action: () => insertText('[', '](url)'), label: '链接' },
    { icon: <Image className="w-5 h-5" />, action: () => insertText('![', '](url)'), label: '图片' },
  ];
  
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
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            isDirty 
              ? 'bg-blue-600 text-white' 
              : 'text-gray-400'
          }`}
        >
          保存
        </button>
      </div>
      
      {/* 编辑区 */}
      <textarea
        ref={textareaRef}
        value={localContent}
        onChange={(e) => handleContentChange(e.target.value)}
        onClick={() => setShowMoreTools(false)}
        className="flex-1 w-full px-5 py-4 bg-transparent text-gray-800 dark:text-gray-200 resize-none focus:outline-none font-mono text-base leading-relaxed"
        placeholder="开始输入 markdown 内容..."
      />
      
      {/* 工具栏 */}
      <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur safe-area-bottom">
          <div className="flex items-center justify-between px-2 py-2">
            {/* 主要工具 */}
            <div className="flex items-center gap-1">
              {tools.map((tool, i) => (
                <button
                  key={i}
                  onClick={tool.action}
                  className="p-2 rounded-lg hover:bg-accent active:bg-accent/80"
                  title={tool.label}
                >
                  {tool.icon}
                </button>
              ))}
              
              {/* 更多工具 */}
              <div className="relative">
                <button
                  onClick={() => setShowMoreTools(!showMoreTools)}
                  className={`p-2 rounded-lg hover:bg-accent ${showMoreTools ? 'bg-accent' : ''}`}
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
                
                {showMoreTools && (
                  <div className="absolute bottom-full left-0 mb-2 bg-popover rounded-lg shadow-xl border border-border overflow-hidden">
                    {moreTools.map((tool, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          tool.action();
                          setShowMoreTools(false);
                        }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-accent w-full"
                      >
                        {tool.icon}
                        <span>{tool.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* 保存按钮 */}
            <button
              onClick={() => save()}
              disabled={!isDirty}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isDirty 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>保存</span>
            </button>
          </div>
        </div>
    </div>
  );
}
