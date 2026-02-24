import { useState, useMemo, useRef, useEffect } from 'react';
import { useFileStore } from '@/stores/useFileStore';
import { NoteCard } from './NoteCard';
import { useNoteCards, NoteCardData } from './useNoteCards';
import { Search, Filter, Loader2 } from 'lucide-react';
import { useLocaleStore } from '@/stores/useLocaleStore';

// 保存滚动位置（组件外部，跨挂载保持）
let savedScrollTop = 0;

// 动态列数 Hook
function useColumnCount() {
  const [columns, setColumns] = useState(1);
  
  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      // 考虑侧栏宽度，适当调整断点
      if (width >= 1536) setColumns(4);      // 2xl
      else if (width >= 1280) setColumns(4); // xl
      else if (width >= 1024) setColumns(3); // lg
      else if (width >= 640) setColumns(2);  // sm
      else setColumns(1);
    };
    
    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);
  
  return columns;
}

export function CardFlowView() {
  const { openFile, openPDFTab } = useFileStore();
  const { t } = useLocaleStore();
  const { 
    cards, 
    loading, 
    isPending,
    totalFiles, 
    loadedCount,
    hasMore, 
    loadMore, 
    allFolders,
  } = useNoteCards();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const columnCount = useColumnCount();

  // 过滤卡片
  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const matchesSearch = card.entry.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            card.content.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesFolder = true;
      if (selectedFolder !== 'all') {
         const pathParts = card.entry.path.replace(/\\/g, '/').split('/');
         const folder = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Root';
         matchesFolder = folder === selectedFolder;
      }

      return matchesSearch && matchesFolder;
    });
  }, [cards, searchQuery, selectedFolder]);

  // 稳定分列：基于索引取模，每个卡片始终在固定的列
  // 避免滚动时因贪心算法重新分配导致的抖动
  const noteColumns = useMemo(() => {
    const cols: NoteCardData[][] = Array.from({ length: columnCount }, () => []);
    
    filteredCards.forEach((card, index) => {
      // 简单取模分配，保证同一个卡片始终在同一列
      const colIndex = index % columnCount;
      cols[colIndex].push(card);
    });
    
    return cols;
  }, [filteredCards, columnCount]);

  // 恢复滚动位置（等待卡片加载后）
  const hasRestoredScroll = useRef(false);
  useEffect(() => {
    const container = scrollContainerRef.current;
    // 只在有卡片且未恢复过时执行
    if (!container || savedScrollTop === 0 || hasRestoredScroll.current) return;
    if (filteredCards.length === 0) return;
    
    // 等待 DOM 更新后恢复位置
    requestAnimationFrame(() => {
      container.scrollTop = savedScrollTop;
      hasRestoredScroll.current = true;
    });
  }, [filteredCards.length]);

  // 滚动监听 - 滚动到 50% 时预加载 + 保存位置
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let ticking = false;
    
    const handleScroll = () => {
      if (ticking) return;
      
      ticking = true;
      requestAnimationFrame(() => {
        const { scrollTop, scrollHeight, clientHeight } = container;
        
        // 保存滚动位置
        savedScrollTop = scrollTop;
        
        const scrollPercent = scrollTop / (scrollHeight - clientHeight);
        
        // 滚动到 50% 时就开始加载更多
        if (scrollPercent > 0.5 && hasMore && !loading && !isPending) {
          loadMore();
        }
        
        ticking = false;
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, loading, isPending, loadMore]);

  const loadedSummary = t.cardFlow.loadedSummary
    .replace("{loaded}", String(loadedCount))
    .replace("{total}", String(totalFiles))
    .replace("{shown}", String(cards.length));

  return (
    <div className="h-full flex flex-col bg-background">
      {/* 顶部工具栏 */}
      <div className="p-4 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-muted/20">
        <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold flex items-center gap-2">
                {t.cardFlow.title}
                {(loading || isPending) && <Loader2 size={16} className="animate-spin text-primary" />}
            </h2>
            <p className="text-xs text-muted-foreground">
                {loadedSummary}
            </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 flex-1 sm:flex-initial min-w-[200px] bg-background border border-input rounded-md px-3 py-1.5 focus-within:ring-2 focus-within:ring-ring">
            <Search size={16} className="text-muted-foreground" />
            <input 
                type="text" 
                placeholder={t.cardFlow.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground min-w-0"
            />
            </div>

            <div className="flex items-center gap-2">
                <Filter size={16} className="text-muted-foreground" />
                <select 
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="bg-background border border-input rounded-md text-sm px-2 py-1.5 outline-none focus:ring-2 focus:ring-ring max-w-[150px]"
                >
                <option value="all">{t.cardFlow.allFolders}</option>
                {allFolders.map(f => (
                    <option key={f} value={f}>{f}</option>
                ))}
                </select>
            </div>
        </div>
      </div>

      {/* 卡片流区域 */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent scroll-smooth"
      >
        {cards.length === 0 && loading ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p>{t.cardFlow.loadingNotes}</p>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-2xl">
            <Filter size={48} className="mb-4 opacity-50" />
            <p>{t.cardFlow.noResults}</p>
          </div>
        ) : (
          <>
            {/* Flex 分列布局 */}
            <div className="flex items-start gap-6 max-w-7xl mx-auto pb-4">
              {noteColumns.map((columnCards, colIndex) => (
                <div key={colIndex} className="flex-1 flex flex-col gap-6 min-w-0">
                  {columnCards.map(card => (
                    <NoteCard 
                      key={card.entry.path} 
                      entry={card.entry} 
                      content={card.content}
                      fileType={card.fileType}
                      onClick={() => {
                        if (card.fileType === 'pdf') {
                          openPDFTab(card.entry.path);
                        } else {
                          openFile(card.entry.path);
                        }
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
            
            {/* 底部状态 */}
            <div className="py-8 flex justify-center items-center w-full min-h-[50px]">
              {(loading || isPending) && hasMore ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">{t.cardFlow.loadMore}</span>
                </div>
              ) : !hasMore && loadedCount > 0 ? (
                <span className="text-xs text-muted-foreground/50">
                  {t.cardFlow.allLoaded.replace("{total}", String(totalFiles))}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
