import { useState, useCallback } from 'react';
import { FileText, MessageSquare } from 'lucide-react';
import { MobileFileBrowser } from './MobileFileBrowser';
import { MobileEditor } from './MobileEditor';
import { MobileChat, ChatSidebar } from './MobileChat';
import { useFileStore } from '@/stores/useFileStore';

// 主 Tab: chat | files
// 文件 Tab 内部: list | editor
export type MainTab = 'chat' | 'files';
export type FilesView = 'list' | 'editor';

export function MobileLayout() {
  const [activeTab, setActiveTab] = useState<MainTab>('chat');
  const [filesView, setFilesView] = useState<FilesView>('list');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentFile } = useFileStore();
  
  // 打开文件时切换到编辑器视图
  const handleFileSelect = useCallback(() => {
    setFilesView('editor');
  }, []);
  
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
    <div className="h-full bg-gray-50 dark:bg-gray-900 relative overflow-hidden">
      {/* 侧栏遮罩层 - 点击关闭 */}
      {sidebarOpen && (
        <div 
          className="absolute inset-0 bg-black/30 z-40 transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* 侧栏 - 绝对定位浮在上层 */}
      <div 
        className={`absolute left-0 top-0 h-full z-50 transition-transform duration-300 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <ChatSidebar onClose={() => setSidebarOpen(false)} />
      </div>
      
      {/* 整体内容容器 - 始终占满全屏 */}
      <div className="h-full flex flex-col">
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
      </div>
    </div>
  );
}
