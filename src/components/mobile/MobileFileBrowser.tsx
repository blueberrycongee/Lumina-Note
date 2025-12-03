import { useCallback } from 'react';
import { FileText, FolderOpen, Search, Sparkles } from 'lucide-react';
import { useFileStore } from '@/stores/useFileStore';
import { FileEntry } from '@/lib/tauri';

interface MobileFileBrowserProps {
  onFileSelect: () => void;
}

export function MobileFileBrowser({ onFileSelect }: MobileFileBrowserProps) {
  const { vaultPath, fileTree, openFile, isLoadingTree } = useFileStore();
  
  const handleFileClick = useCallback(async (entry: FileEntry) => {
    if (!entry.is_dir && entry.path.endsWith('.md')) {
      await openFile(entry.path);
      onFileSelect();
    }
  }, [openFile, onFileSelect]);

  // 获取所有笔记（扁平化）
  const getAllNotes = useCallback((entries: FileEntry[]): FileEntry[] => {
    const notes: FileEntry[] = [];
    for (const entry of entries) {
      if (!entry.is_dir && entry.path.endsWith('.md')) {
        notes.push(entry);
      }
      if (entry.is_dir && entry.children) {
        notes.push(...getAllNotes(entry.children));
      }
    }
    return notes;
  }, []);

  const notes = getAllNotes(fileTree);

  
  // 正在初始化或加载中
  if (!vaultPath || isLoadingTree) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-900">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-6 shadow-xl shadow-blue-500/20 animate-pulse">
          <FolderOpen className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">欢迎使用 Lumina Note</h2>
        <p className="text-gray-500 dark:text-gray-400 text-center">
          正在初始化笔记目录...
        </p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 relative">
      {/* 顶部标题栏 */}
      <div className="flex-shrink-0 p-4 pt-12 pb-2 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-md sticky top-0 z-10 safe-area-top">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
          <FileText className="mr-2 text-blue-500" size={20}/> 
          笔记 
          <span className="ml-2 text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
            {notes.length}
          </span>
        </h2>
        <button className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
          <Search size={20} />
        </button>
      </div>
      
      {/* 笔记卡片列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <Sparkles size={32} className="text-gray-300" />
            </div>
            <p className="text-gray-500">空空如也</p>
            <p className="mt-2 text-gray-400 text-sm">通过对话让 AI 创建笔记</p>
          </div>
        ) : (
          notes.map(note => (
            <NoteCard 
              key={note.path} 
              note={note} 
              onClick={() => handleFileClick(note)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// 笔记卡片组件
interface NoteCardProps {
  note: FileEntry;
  onClick: () => void;
}

function NoteCard({ note, onClick }: NoteCardProps) {
  const title = note.name.replace('.md', '');
  // 从路径获取文件夹名作为标签
  const pathParts = note.path.split(/[/\\]/);
  const folderName = pathParts.length > 2 ? pathParts[pathParts.length - 2] : null;
  
  return (
    <button 
      onClick={onClick}
      className="w-full bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all active:scale-[0.98] text-left"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate pr-4 text-[15px]">
          {title || '无标题'}
        </h3>
        <span className="text-[10px] text-gray-400 whitespace-nowrap bg-gray-50 dark:bg-gray-700 px-1.5 py-0.5 rounded">
          刚刚
        </span>
      </div>
      <p className="text-gray-500 dark:text-gray-400 text-xs line-clamp-2 h-8 leading-relaxed">
        点击查看笔记内容...
      </p>
      {folderName && (
        <div className="flex mt-3 space-x-2">
          <span className="text-[10px] text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
            #{folderName}
          </span>
        </div>
      )}
    </button>
  );
}
