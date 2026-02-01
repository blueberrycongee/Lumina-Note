import "@/pdfWorker";
import { useState, useEffect, useCallback, useRef } from "react";
import { pdfjs } from "react-pdf";
import { Search, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  pageIndex: number;
  matchIndex: number;
  text: string;
}

interface PDFSearchProps {
  pdfData: Uint8Array | null;
  onNavigate: (page: number) => void;
  className?: string;
}

export function PDFSearch({
  pdfData,
  onNavigate,
  className,
}: PDFSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 加载 PDF 文档
  useEffect(() => {
    if (!pdfData) return;

    let cancelled = false;

    const loadDoc = async () => {
      try {
        // 创建独立副本避免 ArrayBuffer detached
        // 使用 slice 创建真正独立的副本
        const copy = pdfData.slice(0);
        
        const loadingTask = pdfjs.getDocument({ data: copy });
        const doc = await loadingTask.promise;
        if (!cancelled) {
          setPdfDoc(doc);
        }
      } catch (err) {
        console.error("Failed to load PDF for search:", err);
      }
    };

    loadDoc();
    return () => { cancelled = true; };
  }, [pdfData]);

  // 执行搜索
  const doSearch = useCallback(async () => {
    if (!pdfDoc || !query.trim()) {
      setResults([]);
      return;
    }

    setSearching(true);
    const searchResults: SearchResult[] = [];
    const searchQuery = query.toLowerCase();

    try {
      const numPages = pdfDoc.numPages;

      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        
        let pageText = "";
        textContent.items.forEach((item: any) => {
          if (item.str) {
            pageText += item.str;
          }
        });

        const lowerPageText = pageText.toLowerCase();
        let matchIndex = 0;
        let startPos = 0;

        while ((startPos = lowerPageText.indexOf(searchQuery, startPos)) !== -1) {
          // 提取匹配周围的文本作为预览
          const previewStart = Math.max(0, startPos - 20);
          const previewEnd = Math.min(pageText.length, startPos + query.length + 20);
          const preview = (previewStart > 0 ? "..." : "") +
            pageText.slice(previewStart, previewEnd) +
            (previewEnd < pageText.length ? "..." : "");

          searchResults.push({
            pageIndex: i,
            matchIndex: matchIndex++,
            text: preview,
          });

          startPos += query.length;
        }
      }

      setResults(searchResults);
      setCurrentIndex(0);
      
      // 如果有结果，跳转到第一个
      if (searchResults.length > 0) {
        onNavigate(searchResults[0].pageIndex);
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
    }
  }, [pdfDoc, query, onNavigate]);

  // 键盘快捷键
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        // Shift+Enter: 上一个
        navigatePrev();
      } else {
        // Enter: 下一个或开始搜索
        if (results.length > 0) {
          navigateNext();
        } else {
          doSearch();
        }
      }
    } else if (e.key === "Escape") {
      setQuery("");
      setResults([]);
    }
  }, [results, doSearch]);

  const navigateNext = useCallback(() => {
    if (results.length === 0) return;
    const nextIndex = (currentIndex + 1) % results.length;
    setCurrentIndex(nextIndex);
    onNavigate(results[nextIndex].pageIndex);
  }, [results, currentIndex, onNavigate]);

  const navigatePrev = useCallback(() => {
    if (results.length === 0) return;
    const prevIndex = (currentIndex - 1 + results.length) % results.length;
    setCurrentIndex(prevIndex);
    onNavigate(results[prevIndex].pageIndex);
  }, [results, currentIndex, onNavigate]);

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults([]);
    setCurrentIndex(0);
    inputRef.current?.focus();
  }, []);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* 搜索输入框 */}
      <div className="relative flex items-center">
        <Search size={14} className="absolute left-2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="搜索..."
          className="w-40 pl-7 pr-7 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {query && (
          <button
            onClick={clearSearch}
            className="absolute right-2 text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* 搜索按钮 */}
      <button
        onClick={doSearch}
        disabled={searching || !query.trim()}
        className="p-1.5 rounded hover:bg-accent disabled:opacity-50 transition-colors"
        title="搜索"
      >
        {searching ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Search size={14} />
        )}
      </button>

      {/* 结果导航 */}
      {results.length > 0 && (
        <>
          <span className="text-xs text-muted-foreground">
            {currentIndex + 1} / {results.length}
          </span>
          <button
            onClick={navigatePrev}
            className="p-1 rounded hover:bg-accent transition-colors"
            title="上一个 (Shift+Enter)"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={navigateNext}
            className="p-1 rounded hover:bg-accent transition-colors"
            title="下一个 (Enter)"
          >
            <ChevronDown size={14} />
          </button>
        </>
      )}

      {/* 无结果提示 */}
      {!searching && query && results.length === 0 && (
        <span className="text-xs text-muted-foreground">无结果</span>
      )}
    </div>
  );
}
