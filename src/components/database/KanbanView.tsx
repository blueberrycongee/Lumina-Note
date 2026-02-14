import { useEffect, useMemo, useState } from "react";
import { useDatabaseStore } from "@/stores/useDatabaseStore";
import { useFileStore } from "@/stores/useFileStore";
import type { DatabaseRow } from "@/types/database";
import { DatabaseIconButton, DatabasePanel, DatabaseTextInput } from "./primitives";
import { DatabaseScaledContent } from "./ViewScaleControl";
import { Plus, MoreHorizontal, GripVertical, Pencil } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { resolveKanbanGroupColumnId } from "./kanbanUtils";
import { normalizeDatabaseViewScale } from "./viewScale";
import { getSelectColorClasses, normalizeSelectOptions } from "@/features/database/selectOptions";
import { formatDatabaseActionError } from "./actionErrors";

interface KanbanViewProps {
  dbId: string;
}

export function KanbanView({ dbId }: KanbanViewProps) {
  const { t } = useLocaleStore();
  const {
    databases,
    addRow,
    updateCell,
    updateView,
    getFilteredSortedRows,
  } = useDatabaseStore();
  const openFile = useFileStore((state) => state.openFile);
  
  const db = databases[dbId];
  const rows = useMemo(() => getFilteredSortedRows(dbId), [dbId, getFilteredSortedRows, db?.rows, db?.views]);
  
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  
  if (!db) return null;
  
  const activeView = db.views.find(v => v.id === db.activeViewId);
  const groupByColumnId = activeView ? resolveKanbanGroupColumnId(db.columns, activeView.groupBy) : null;
  const viewScale = normalizeDatabaseViewScale(activeView?.scale);
  
  useEffect(() => {
    if (!activeView || activeView.type !== "kanban") return;
    if (!groupByColumnId) return;
    if (activeView.groupBy === groupByColumnId) return;
    updateView(dbId, activeView.id, { groupBy: groupByColumnId });
  }, [activeView, dbId, groupByColumnId, updateView]);
  
  // 找到分组列
  const groupColumn = db.columns.find(c => c.id === groupByColumnId);
  
  if (!groupColumn || (groupColumn.type !== 'select' && groupColumn.type !== 'multi-select')) {
    return (
      <div className="flex items-center justify-center h-full p-6 text-muted-foreground">
        <div className="db-empty-state w-full max-w-lg">
          <p>{t.database.kanbanMissingGroupTitle}</p>
          <p className="text-sm mt-1">{t.database.kanbanMissingGroupDesc}</p>
        </div>
      </div>
    );
  }
  
  const options = normalizeSelectOptions(groupColumn.options);
  
  // 按分组整理数据
  const groupedRows: Record<string, DatabaseRow[]> = {};
  const ungroupedRows: DatabaseRow[] = [];
  
  // 初始化所有分组
  options.forEach(opt => {
    groupedRows[opt.id] = [];
  });
  
  // 分配行到分组
  rows.forEach(row => {
    const cellValue = row.cells[groupByColumnId!];
    if (typeof cellValue === 'string' && groupedRows[cellValue]) {
      groupedRows[cellValue].push(row);
    } else {
      ungroupedRows.push(row);
    }
  });
  
  // 拖放处理
  const handleDragStart = (e: React.DragEvent, rowId: string) => {
    setDraggedCard(rowId);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroup(groupId);
  };
  
  const handleDragLeave = () => {
    setDragOverGroup(null);
  };
  
  const handleDrop = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    if (draggedCard && groupByColumnId) {
      updateCell(dbId, draggedCard, groupByColumnId, groupId);
    }
    setDraggedCard(null);
    setDragOverGroup(null);
  };
  
  const handleAddCardToGroup = async (groupId: string) => {
    if (!groupByColumnId) return;
    try {
      await addRow(dbId, { [groupByColumnId]: groupId });
    } catch (error) {
      alert(formatDatabaseActionError(t, t.database.newCard, error));
    }
  };
  
  // 获取卡片标题（第一个 text 列）
  const titleColumn = db.columns.find(c => c.type === 'text');
  
  return (
    <div className="h-full overflow-x-auto p-4 bg-background">
      <DatabaseScaledContent scale={viewScale} className="h-full">
        <div className="flex gap-4 h-full min-w-max">
          {/* 各分组列 */}
          {options.map((option) => {
            const colors = getSelectColorClasses(option.color);
            const groupRows = groupedRows[option.id] || [];
            
            return (
              <DatabasePanel
                key={option.id}
                className={`flex flex-col w-72 ${
                  dragOverGroup === option.id ? 'border-primary/45 bg-accent' : ''
                }`}
                onDragOver={(e) => handleDragOver(e, option.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, option.id)}
              >
                {/* 分组头部 */}
                <div className="flex items-center gap-2 p-3">
                  <span className={`px-2 py-0.5 rounded text-sm font-medium ${colors.bg} ${colors.text}`}>
                    {option.name}
                  </span>
                  <span className="text-sm text-muted-foreground">{groupRows.length}</span>
                  <div className="flex-1" />
                  <DatabaseIconButton aria-label={t.common.settings} title={t.common.settings}>
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                  </DatabaseIconButton>
                </div>
                
                {/* 卡片列表 */}
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                  {groupRows.map((row) => (
                    <KanbanCard
                      key={row.id}
                      row={row}
                      titleColumnId={titleColumn?.id}
                      isDragging={draggedCard === row.id}
                      onDragStart={(e) => handleDragStart(e, row.id)}
                      onOpenNote={() => void openFile(row.notePath)}
                      onRenameTitle={
                        titleColumn
                          ? (nextTitle: string) => updateCell(dbId, row.id, titleColumn.id, nextTitle)
                          : undefined
                      }
                    />
                  ))}
                  
                  {/* 新建卡片 */}
                  <button
                    onClick={() => {
                      void handleAddCardToGroup(option.id);
                    }}
                    className="db-toggle-btn w-full h-9 justify-center border-dashed"
                  >
                    <Plus className="w-4 h-4" /> {t.database.newCard}
                  </button>
                </div>
              </DatabasePanel>
            );
          })}
          
          {/* 未分组 */}
          {ungroupedRows.length > 0 && (
            <DatabasePanel
              className={`flex flex-col w-72 ${
                dragOverGroup === 'ungrouped' ? 'border-primary/45 bg-accent' : ''
              }`}
              onDragOver={(e) => handleDragOver(e, 'ungrouped')}
              onDragLeave={handleDragLeave}
            >
              <div className="flex items-center gap-2 p-3">
                <span className="px-2 py-0.5 rounded text-sm font-medium bg-muted text-muted-foreground">
                  {t.database.ungrouped}
                </span>
                <span className="text-sm text-muted-foreground">{ungroupedRows.length}</span>
              </div>
              
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                {ungroupedRows.map((row) => (
                  <KanbanCard
                    key={row.id}
                    row={row}
                    titleColumnId={titleColumn?.id}
                    isDragging={draggedCard === row.id}
                    onDragStart={(e) => handleDragStart(e, row.id)}
                    onOpenNote={() => void openFile(row.notePath)}
                    onRenameTitle={
                      titleColumn
                        ? (nextTitle: string) => updateCell(dbId, row.id, titleColumn.id, nextTitle)
                        : undefined
                    }
                  />
                ))}
              </div>
            </DatabasePanel>
          )}
        </div>
      </DatabaseScaledContent>
    </div>
  );
}

// 看板卡片组件
interface KanbanCardProps {
  row: DatabaseRow;
  titleColumnId?: string;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onOpenNote: () => void;
  onRenameTitle?: (nextTitle: string) => Promise<boolean>;
}

function KanbanCard({
  row,
  titleColumnId,
  isDragging,
  onDragStart,
  onOpenNote,
  onRenameTitle,
}: KanbanCardProps) {
  const { t } = useLocaleStore();
  const titleFromCell =
    typeof titleColumnId === "string" ? String(row.cells[titleColumnId] || "").trim() : "";
  const displayTitle = titleFromCell || row.noteTitle || t.database.noTitle;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(displayTitle);

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(displayTitle);
    }
  }, [displayTitle, isEditingTitle]);

  const commitTitleEdit = () => {
    const nextTitle = draftTitle.trim();
    setIsEditingTitle(false);
    if (!onRenameTitle || !nextTitle || nextTitle === displayTitle) return;
    void onRenameTitle(nextTitle);
  };
  
  return (
    <div
      draggable={!isEditingTitle}
      onDragStart={onDragStart}
      className={`db-focus-ring group db-surface w-full p-3 text-left cursor-grab active:cursor-grabbing transition-[transform,opacity] duration-150 ease-out ${
        isDragging ? 'opacity-50 scale-95' : 'hover:-translate-y-[1px]'
      }`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100" />
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <DatabaseTextInput
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={commitTitleEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTitleEdit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraftTitle(displayTitle);
                  setIsEditingTitle(false);
                }
              }}
              aria-label={`${t.common.edit}: ${displayTitle}`}
              className="h-8 px-2 text-sm font-medium"
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="db-focus-ring w-full rounded-sm text-left"
              onClick={onOpenNote}
              aria-label={`${t.common.open}: ${displayTitle}`}
              title={t.common.open}
            >
              <p className="font-medium truncate">{displayTitle}</p>
            </button>
          )}
        </div>
        {onRenameTitle && !isEditingTitle && (
          <DatabaseIconButton
            aria-label={`${t.common.edit}: ${displayTitle}`}
            title={t.common.edit}
            variant="subtle"
            onClick={(event) => {
              event.stopPropagation();
              setDraftTitle(displayTitle);
              setIsEditingTitle(true);
            }}
          >
            <Pencil className="w-4 h-4" />
          </DatabaseIconButton>
        )}
      </div>
    </div>
  );
}
