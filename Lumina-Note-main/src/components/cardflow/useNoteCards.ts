import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import { useFileStore } from '@/stores/useFileStore';
import { FileEntry, readFile } from '@/lib/tauri';

export interface NoteCardData {
  entry: FileEntry;
  content: string;
  fileType: 'md' | 'pdf';
}

const BATCH_SIZE = 50; // 激进策略：大批量加载，构建厚实缓冲区

export function useNoteCards() {
  const { fileTree, vaultPath } = useFileStore();
  const [allCards, setAllCards] = useState<NoteCardData[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayCount, setDisplayCount] = useState(BATCH_SIZE);
  const [isPending, startTransition] = useTransition();

  // 扁平化文件树
  const allFiles = useMemo(() => {
    const files: FileEntry[] = [];
    if (!fileTree) return files;
    
    const traverse = (entries: FileEntry[]) => {
      for (const entry of entries) {
        if (entry.is_dir) {
          if (entry.children) traverse(entry.children);
        } else if (entry.name.endsWith('.md') || entry.name.endsWith('.pdf')) {
          files.push(entry);
        }
      }
    };
    traverse(fileTree);
    return files;
  }, [fileTree]);

  // 从完整文件树获取所有文件夹
  const allFolders = useMemo(() => {
    const folderSet = new Set<string>();
    allFiles.forEach(file => {
      const pathParts = file.path.replace(/\\/g, '/').split('/');
      if (pathParts.length > 1) {
        folderSet.add(pathParts[pathParts.length - 2]);
      }
    });
    return Array.from(folderSet).sort();
  }, [allFiles]);

  // 可见卡片（根据 displayCount 截取）
  const cards = useMemo(() => {
    return allCards.slice(0, displayCount);
  }, [allCards, displayCount]);

  const hasMore = displayCount < allCards.length;

  // 加载更多（只增加显示数量）
  const loadMore = useCallback(() => {
    if (isPending || !hasMore) return;
    
    startTransition(() => {
      setDisplayCount(prev => Math.min(prev + BATCH_SIZE, allCards.length));
    });
  }, [isPending, hasMore, allCards.length]);

  // 初始加载所有文件内容
  useEffect(() => {
    let mounted = true;
    
    const loadAllContent = async () => {
      if (allFiles.length === 0) return;
      
      setLoading(true);
      const loadedCards: NoteCardData[] = [];
      
      // 并发加载，每次 10 个
      const concurrency = 10;
      for (let i = 0; i < allFiles.length; i += concurrency) {
        if (!mounted) return;
        
        const chunk = allFiles.slice(i, i + concurrency);
        const results = await Promise.allSettled(
          chunk.map(async (file) => {
            const isPdf = file.name.endsWith('.pdf');
            // PDF 文件不需要读取内容，只记录类型
            const content = isPdf ? '' : await readFile(file.path);
            return { entry: file, content, fileType: isPdf ? 'pdf' : 'md' } as NoteCardData;
          })
        );
        
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            loadedCards.push(result.value);
          }
        });

        // 每加载 50 个更新一次 UI
        if (mounted && loadedCards.length % 50 === 0) {
          setAllCards([...loadedCards]);
        }
      }

      if (mounted) {
        setAllCards(loadedCards);
        setLoading(false);
      }
    };

    if (vaultPath) {
      setAllCards([]);
      setDisplayCount(BATCH_SIZE);
      loadAllContent();
    }

    return () => { mounted = false; };
  }, [allFiles, vaultPath]);

  return { 
    cards, 
    allCards,
    loading,
    isPending,
    totalFiles: allFiles.length,
    loadedCount: allCards.length,
    hasMore,
    loadMore,
    allFolders,
  };
}
