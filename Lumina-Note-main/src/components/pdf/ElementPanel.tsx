import { X, Copy, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PDFElement } from "@/types/pdf";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface ElementPanelProps {
  elements: PDFElement[];
  onRemove: (elementId: string) => void;
  onClear: () => void;
  onCopyAsReference: () => void;
  onChatWithAI: () => void;
  className?: string;
}

export function ElementPanel({
  elements,
  onRemove,
  onClear,
  onCopyAsReference,
  onChatWithAI,
  className,
}: ElementPanelProps) {
  const { t } = useLocaleStore();
  if (elements.length === 0) {
    return null;
  }

  return (
    <div className={cn("bg-background border-l border-border flex flex-col h-full", className)}>
      {/* 头部 */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{t.pdfViewer.elementPanel.selectedElements}</span>
          <span className="text-xs text-muted-foreground">({elements.length})</span>
        </div>
        <button
          onClick={onClear}
          className="p-1 hover:bg-accent rounded transition-colors"
          title={t.pdfViewer.elementPanel.clearAll}
        >
          <X size={14} />
        </button>
      </div>

      {/* 元素列表 - 限制高度，确保按钮可见 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0" style={{ maxHeight: 'calc(100vh - 300px)' }}>
        {elements.map((element) => (
          <div
            key={element.id}
            className="p-2 rounded border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    element.type === "text" && "bg-blue-500/20 text-blue-600",
                    element.type === "image" && "bg-green-500/20 text-green-600",
                    element.type === "table" && "bg-purple-500/20 text-purple-600",
                    element.type === "equation" && "bg-orange-500/20 text-orange-600"
                  )}>
                    {(t.pdfViewer.elementTypes as Record<string, string>)?.[element.type] || element.type}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    P.{element.pageIndex}
                  </span>
                </div>
                {element.content && (
                  <p className="text-xs text-foreground/80 line-clamp-2">
                    {element.content}
                  </p>
                )}
                {element.caption && (
                  <p className="text-xs text-muted-foreground italic">
                    {element.caption}
                  </p>
                )}
              </div>
              <button
                onClick={() => onRemove(element.id)}
                className="p-1 hover:bg-accent rounded transition-colors shrink-0"
                title={t.pdfViewer.elementPanel.remove}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 操作按钮 - 固定在底部 */}
      <div className="p-4 pb-8 border-t border-border space-y-2 shrink-0 bg-background">
        <button
          onClick={onCopyAsReference}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm bg-accent hover:bg-accent/80 rounded transition-colors"
        >
          <Copy size={14} />
          <span>{t.pdfViewer.elementPanel.copyAsReference}</span>
        </button>
        <button
          onClick={onChatWithAI}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium bg-primary text-white hover:bg-primary/90 rounded transition-colors"
        >
          <MessageSquare size={14} />
          <span>{t.pdfViewer.elementPanel.chatWithAi}</span>
        </button>
      </div>
    </div>
  );
}
