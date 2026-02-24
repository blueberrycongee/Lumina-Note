import { useState, useRef, useEffect } from "react";
import { useDatabaseStore } from "@/stores/useDatabaseStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import type { DatabaseColumn, ColumnType } from "@/types/database";
import { DatabaseIconButton, DatabaseMenuSurface } from "./primitives";
import {
  Type,
  Hash,
  List,
  Calendar,
  CheckSquare,
  Link,
  Calculator,
  GitBranch,
  ChevronDown,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  EyeOff,
  Copy,
} from "lucide-react";

interface ColumnHeaderProps {
  dbId: string;
  column: DatabaseColumn;
  onDragStart: () => void;
  onDragEnd: () => void;
}

const typeIcons: Record<ColumnType, React.ReactNode> = {
  'text': <Type className="w-4 h-4" />,
  'number': <Hash className="w-4 h-4" />,
  'select': <List className="w-4 h-4" />,
  'multi-select': <List className="w-4 h-4" />,
  'date': <Calendar className="w-4 h-4" />,
  'checkbox': <CheckSquare className="w-4 h-4" />,
  'url': <Link className="w-4 h-4" />,
  'formula': <Calculator className="w-4 h-4" />,
  'relation': <GitBranch className="w-4 h-4" />,
};

export function ColumnHeader({ dbId, column, onDragStart, onDragEnd }: ColumnHeaderProps) {
  const { t } = useLocaleStore();
  const { updateColumn, deleteColumn, addColumn } = useDatabaseStore();
  const typeLabels = t.database.columnTypes;
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(column.name);
  const [formulaInput, setFormulaInput] = useState(column.formula || "");
  const [showMenu, setShowMenu] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowTypeMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // 编辑名称时聚焦
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setFormulaInput(column.formula || "");
  }, [column.formula]);
  
  const handleNameSubmit = () => {
    if (editName.trim() && editName !== column.name) {
      updateColumn(dbId, column.id, { name: editName.trim() });
    } else {
      setEditName(column.name);
    }
    setIsEditing(false);
  };
  
  const handleTypeChange = (type: ColumnType) => {
    updateColumn(dbId, column.id, { type });
    setShowTypeMenu(false);
    setShowMenu(false);
  };

  const handleFormulaSubmit = () => {
    const normalized = formulaInput.trim();
    updateColumn(dbId, column.id, { formula: normalized || undefined });
  };
  
  const handleDelete = () => {
    if (confirm(t.database.confirmDeleteColumn.replace("{name}", column.name))) {
      deleteColumn(dbId, column.id);
    }
    setShowMenu(false);
  };
  
  const handleDuplicate = () => {
    addColumn(dbId, {
      name: `${column.name} ${t.database.copySuffix}`,
      type: column.type,
      options: column.options ? [...column.options] : undefined,
    });
    setShowMenu(false);
  };
  
  return (
    <th
      className="p-0 border-b border-r border-border relative group"
      style={{ width: column.width || 180, minWidth: 100 }}
    >
      <div className="flex items-center h-9 px-2 gap-1">
        {/* 拖拽手柄 */}
        <div
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="w-3 h-3 text-muted-foreground" />
        </div>
        
        {/* 类型图标 */}
        <span className="text-muted-foreground flex-shrink-0">
          {typeIcons[column.type]}
        </span>
        
        {/* 列名 */}
        {isEditing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSubmit();
              if (e.key === 'Escape') {
                setEditName(column.name);
                setIsEditing(false);
              }
            }}
            className="db-input h-7 min-w-0 flex-1 border-transparent bg-transparent px-1 focus-visible:border-transparent focus-visible:shadow-none"
          />
        ) : (
          <span
            className="flex-1 min-w-0 truncate text-sm font-medium cursor-pointer"
            onClick={() => setIsEditing(true)}
          >
            {column.name}
          </span>
        )}
        
        {/* 下拉菜单 */}
        <div className="relative" ref={menuRef}>
          <DatabaseIconButton
            onClick={() => setShowMenu(!showMenu)}
            className="h-6 w-6 opacity-0 group-hover:opacity-100"
            aria-label={t.common.settings}
            title={t.common.settings}
          >
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </DatabaseIconButton>
          
          {showMenu && (
            <DatabaseMenuSurface className="absolute right-0 top-full mt-1 py-1 min-w-[172px] z-50">
              {/* 类型选择 */}
              <div className="relative">
                <button
                  onClick={() => setShowTypeMenu(!showTypeMenu)}
                  className="db-menu-item justify-between"
                >
                  <span className="flex items-center gap-2">
                    {typeIcons[column.type]}
                    {typeLabels[column.type]}
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </button>
                
                {showTypeMenu && (
                  <DatabaseMenuSurface className="absolute left-full top-0 ml-1 py-1 min-w-[146px]">
                    {(Object.keys(typeIcons) as ColumnType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => handleTypeChange(type)}
                        className={`db-menu-item ${
                          column.type === type ? 'bg-accent' : ''
                        }`}
                      >
                        {typeIcons[type]}
                        {typeLabels[type]}
                      </button>
                    ))}
                  </DatabaseMenuSurface>
                )}
              </div>

              {column.type === "formula" && (
                <>
                  <div className="my-1 border-t border-border/70" />
                  <div className="px-2 pb-2">
                    <label className="text-[11px] text-muted-foreground" htmlFor={`formula-input-${column.id}`}>
                      {t.database.formula.expression}
                    </label>
                    <input
                      id={`formula-input-${column.id}`}
                      value={formulaInput}
                      onChange={(event) => setFormulaInput(event.target.value)}
                      onBlur={handleFormulaSubmit}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleFormulaSubmit();
                          setShowMenu(false);
                        }
                        if (event.key === "Escape") {
                          setFormulaInput(column.formula || "");
                        }
                      }}
                      placeholder={t.database.formula.expressionPlaceholder}
                      aria-label={t.database.formula.expression}
                      className="db-input mt-1 h-8 w-full px-2 text-xs"
                    />
                  </div>
                </>
              )}
              
              <div className="my-1 border-t border-border/70" />
              
              {/* 排序 */}
              <button className="db-menu-item">
                <ArrowUp className="w-4 h-4" /> {t.database.sortAsc}
              </button>
              <button className="db-menu-item">
                <ArrowDown className="w-4 h-4" /> {t.database.sortDesc}
              </button>
              
              <div className="my-1 border-t border-border/70" />
              
              {/* 操作 */}
              <button
                onClick={handleDuplicate}
                className="db-menu-item"
              >
                <Copy className="w-4 h-4" /> {t.database.duplicateColumn}
              </button>
              <button className="db-menu-item">
                <EyeOff className="w-4 h-4" /> {t.database.hideColumn}
              </button>
              <button
                onClick={handleDelete}
                className="db-menu-item db-menu-item-danger"
              >
                <Trash2 className="w-4 h-4" /> {t.database.deleteColumn}
              </button>
            </DatabaseMenuSurface>
          )}
        </div>
      </div>
      
      {/* 调整列宽手柄 */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = column.width || 180;
          
          const onMouseMove = (e: MouseEvent) => {
            const newWidth = Math.max(100, startWidth + e.clientX - startX);
            updateColumn(dbId, column.id, { width: newWidth });
          };
          
          const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          };
          
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        }}
      />
    </th>
  );
}
