import { useState, useCallback } from 'react';
import { FileText, MessageSquare, Sparkles } from 'lucide-react';
import { MobileFileBrowser } from './MobileFileBrowser';
import { MobileEditor } from './MobileEditor';
import { MobileChat, ChatSidebar } from './MobileChat';
import { useFileStore } from '@/stores/useFileStore';

// 主 Tab: chat | files
// 文件 Tab 内部: list | editor
export type MainTab = 'chat' | 'files';
export type FilesView = 'list' | 'editor';

interface MobileLayoutProps {
  onOpenVault: () => void;
}

export function MobileLayout({ onOpenVault }: MobileLayoutProps) {
  const [activeTab, setActiveTab] = useState<MainTab>('chat');
  const [filesView, setFilesView] = useState<FilesView>('list');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { vaultPath, currentFile, createNewFile } = useFileStore();
  
  // 打开文件时切换到编辑器视图
  const handleFileSelect = useCallback(() => {
    setFilesView('editor');
  }, []);
  
  // 新建文件
  const handleCreateNote = useCallback(async () => {
    if (vaultPath) {
      await createNewFile();
      setFilesView('editor');
      if (activeTab !== 'files') setActiveTab('files');
    }
  }, [vaultPath, createNewFile, activeTab]);
  
  // 返回列表
  const handleBackToList = useCallback(() => {
    setFilesView('list');
  }, []);

  // 切换到文件 Tab
  const handleFilesTab = useCallback(() => {
    setActiveTab('files');
    // 如果没有打开文件，显示列表
    if (!currentFile) setFilesView('list');
  }, [currentFile]);

  return (
    <div className="h-full bg-gray-50 dark:bg-gray-900 relative overflow-hidden flex">
      {/* 侧栏 - 固定宽度 */}
      <div 
        className={`flex-shrink-0 h-full transition-all duration-300 ease-out overflow-hidden ${
          sidebarOpen ? 'w-[280px]' : 'w-0'
        }`}
      >
        <ChatSidebar onClose={() => setSidebarOpen(false)} />
      </div>
      
      {/* 整体内容容器 */}
      <div className="flex-1 h-full flex flex-col min-w-0">
        {/* 主内容区 */}
        <main className="flex-1 overflow-hidden relative">
          {/* Chat View */}
          {activeTab === 'chat' && (
            <MobileChat 
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            />
          )}
          
          {/* Files Tab - 内部切换 list/editor */}
          {activeTab === 'files' && (
            <>
              {filesView === 'list' ? (
                <MobileFileBrowser 
                  onFileSelect={handleFileSelect}
                  onOpenVault={onOpenVault}
                  onCreateNote={handleCreateNote}
                />
              ) : (
                <MobileEditor onBack={handleBackToList} />
              )}
            </>
          )}
        </main>
        
        {/* 底部导航栏 - 2 Tab + 中心按钮 */}
        <nav className="flex-shrink-0 h-[75px] bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex justify-around items-start pt-3 px-6 w-full z-10 shadow-[0_-5px_20px_rgba(0,0,0,0.03)] safe-area-bottom">
          {/* 对话 Tab */}
          <button 
            onClick={() => setActiveTab('chat')}
            className={`flex flex-col items-center space-y-1 w-16 transition-all ${
              activeTab === 'chat' 
                ? 'text-blue-600 dark:text-blue-400 scale-105' 
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <MessageSquare size={24} strokeWidth={activeTab === 'chat' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">对话</span>
          </button>
          
          {/* 中心 AI 按钮占位 */}
          <div className="w-14" />
          
          {/* 文件 Tab */}
          <button 
            onClick={handleFilesTab}
            className={`flex flex-col items-center space-y-1 w-16 transition-all ${
              activeTab === 'files' 
                ? 'text-blue-600 dark:text-blue-400 scale-105' 
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <FileText size={24} strokeWidth={activeTab === 'files' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">文件</span>
          </button>
        </nav>
        
        {/* 中心 AI 浮动按钮 */}
        <div className="absolute bottom-[38px] left-1/2 transform -translate-x-1/2 z-20 safe-area-bottom">
          <button 
            onClick={handleCreateNote}
            className="w-14 h-14 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-full shadow-lg shadow-blue-500/30 flex items-center justify-center border-4 border-white dark:border-gray-900 hover:scale-105 active:scale-95 transition-transform"
          >
            <Sparkles size={24} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
