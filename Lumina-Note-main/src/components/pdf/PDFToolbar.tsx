import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  Maximize,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface PDFToolbarProps {
  currentPage: number;
  totalPages: number;
  scale: number;
  onPageChange: (page: number) => void;
  onScaleChange: (scale: number) => void;
  onFitWidth?: () => void;
  searchSlot?: React.ReactNode;
  onToggleSidebar?: () => void;
  sidebarVisible?: boolean;
  className?: string;
}

const SCALE_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PDFToolbar({
  currentPage,
  totalPages,
  scale,
  onPageChange,
  onScaleChange,
  onFitWidth,
  searchSlot,
  className,
}: PDFToolbarProps) {
  const { t } = useLocaleStore();
  const handlePrevPage = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const handleZoomIn = () => {
    const nextScale = SCALE_PRESETS.find(s => s > scale) || scale * 1.25;
    onScaleChange(Math.min(3, nextScale));
  };

  const handleZoomOut = () => {
    const nextScale = [...SCALE_PRESETS].reverse().find(s => s < scale) || scale * 0.75;
    onScaleChange(Math.max(0.25, nextScale));
  };

  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1 && value <= totalPages) {
      onPageChange(value);
    }
  };

  return (
    <div className={cn(
      "h-10 flex items-center justify-between px-3 border-b border-border bg-muted/50",
      className
    )}>
      {/* 翻页控制 */}
      <div className="flex items-center gap-1">
        <button
          onClick={handlePrevPage}
          disabled={currentPage <= 1}
          className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={t.pdfViewer.toolbar.prevPage}
        >
          <ChevronLeft size={18} />
        </button>
        
        <div className="flex items-center gap-1 text-sm">
          <input
            type="text"
            value={currentPage}
            onChange={handlePageInput}
            className="w-10 text-center bg-background border border-border rounded px-1 py-0.5 text-sm"
          />
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{totalPages}</span>
        </div>
        
        <button
          onClick={handleNextPage}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={t.pdfViewer.toolbar.nextPage}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* 缩放控制 */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleZoomOut}
          disabled={scale <= 0.25}
          className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={t.pdfViewer.toolbar.zoomOut}
        >
          <ZoomOut size={18} />
        </button>
        
        <select
          value={scale}
          onChange={(e) => onScaleChange(parseFloat(e.target.value))}
          className="bg-background border border-border rounded px-2 py-1 text-sm min-w-[80px]"
        >
          {SCALE_PRESETS.map(s => (
            <option key={s} value={s}>{Math.round(s * 100)}%</option>
          ))}
        </select>
        
        <button
          onClick={handleZoomIn}
          disabled={scale >= 3}
          className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={t.pdfViewer.toolbar.zoomIn}
        >
          <ZoomIn size={18} />
        </button>
        
        {onFitWidth && (
          <button
            onClick={onFitWidth}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            title={t.pdfViewer.toolbar.fitWidth}
          >
            <Maximize size={18} />
          </button>
        )}
      </div>

      {/* 搜索和其他操作 */}
      <div className="flex items-center gap-2">
        {searchSlot}
        {searchSlot && <div className="w-px h-4 bg-border" />}
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors"
          title={t.pdfViewer.toolbar.rotate}
        >
          <RotateCw size={18} />
        </button>
      </div>
    </div>
  );
}
