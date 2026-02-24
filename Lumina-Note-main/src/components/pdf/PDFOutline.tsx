import "@/pdfWorker";
import { useState, useEffect, useCallback } from "react";
import { pdfjs } from "react-pdf";
import { ChevronRight, ChevronDown, BookOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface OutlineItem {
  title: string;
  dest: string | any[] | null;
  items?: OutlineItem[];
}

interface PDFOutlineProps {
  pdfData: Uint8Array | null;
  onPageClick: (page: number) => void;
  className?: string;
}

interface OutlineNodeProps {
  item: OutlineItem;
  level: number;
  onNavigate: (dest: string | any[] | null) => void;
}

function OutlineNode({ item, level, onNavigate }: OutlineNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = item.items && item.items.length > 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 rounded cursor-pointer hover:bg-accent transition-colors text-sm",
          "text-foreground/80 hover:text-foreground"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => {
          if (hasChildren) {
            setExpanded(!expanded);
          }
          onNavigate(item.dest);
        }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-accent rounded"
          >
            {expanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="truncate flex-1">{item.title}</span>
      </div>
      
      {hasChildren && expanded && (
        <div>
          {item.items!.map((child, index) => (
            <OutlineNode
              key={index}
              item={child}
              level={level + 1}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PDFOutline({
  pdfData,
  onPageClick,
  className,
}: PDFOutlineProps) {
  const { t } = useLocaleStore();
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);

  // 加载 PDF 文档以获取大纲
  useEffect(() => {
    if (!pdfData) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadOutline = async () => {
      try {
        setLoading(true);
        
        // 使用独立副本加载 PDF
        const copy = pdfData.slice();
        const loadingTask = pdfjs.getDocument({ data: copy });
        const doc = await loadingTask.promise;
        
        if (cancelled) return;
        
        setPdfDoc(doc);
        const outlineData = await doc.getOutline();
        
        if (!cancelled) {
          setOutline(outlineData as OutlineItem[] | null);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load PDF outline:", err);
        if (!cancelled) {
          setOutline(null);
          setLoading(false);
        }
      }
    };

    loadOutline();
    return () => { cancelled = true; };
  }, [pdfData]);

  // 导航到目标位置
  const handleNavigate = useCallback(async (dest: string | any[] | null) => {
    if (!dest || !pdfDoc) return;

    try {
      let pageIndex: number;
      
      if (typeof dest === "string") {
        // 命名目标
        const destObj = await pdfDoc.getDestination(dest);
        if (!destObj) return;
        const ref = destObj[0];
        pageIndex = await pdfDoc.getPageIndex(ref);
      } else if (Array.isArray(dest)) {
        // 显式目标数组
        const ref = dest[0];
        pageIndex = await pdfDoc.getPageIndex(ref);
      } else {
        return;
      }

      onPageClick(pageIndex + 1); // PDF.js 使用 0-indexed
    } catch (err) {
      console.error("Failed to navigate to destination:", err);
    }
  }, [pdfDoc, onPageClick]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="animate-spin" size={16} />
      </div>
    );
  }

  if (!outline || outline.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8 text-muted-foreground", className)}>
        <BookOpen size={24} className="mb-2 opacity-50" />
        <span className="text-sm">{t.pdfViewer.outlineEmpty}</span>
      </div>
    );
  }

  return (
    <div className={cn("py-2", className)}>
      {outline.map((item, index) => (
        <OutlineNode
          key={index}
          item={item}
          level={0}
          onNavigate={handleNavigate}
        />
      ))}
    </div>
  );
}
