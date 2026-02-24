import { useState, useRef, useEffect } from "react";
import { Calendar } from "lucide-react";
import type { DatabaseColumn, DateValue } from "@/types/database";
import { useLocaleStore } from "@/stores/useLocaleStore";
import type { CellCommitAction } from "./types";

interface DateCellProps {
  value: DateValue | null;
  onChange: (value: DateValue | null) => Promise<boolean>;
  isEditing: boolean;
  onBlur: (action?: CellCommitAction) => void;
  column: DatabaseColumn;
}

export function DateCell({ value, onChange, isEditing, onBlur, column }: DateCellProps) {
  const { t, locale } = useLocaleStore();
  const [editValue, setEditValue] = useState(value?.start || '');
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);
  
  useEffect(() => {
    setEditValue(value?.start || '');
  }, [value]);
  
  const handleCommit = async (action?: CellCommitAction) => {
    if (editValue !== value?.start) {
      const ok = await onChange(editValue ? { start: editValue } : null);
      if (!ok) {
        inputRef.current?.focus();
        return;
      }
    }
    onBlur(action);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleCommit('down');
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      void handleCommit(e.shiftKey ? 'prev' : 'next');
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditValue(value?.start || '');
      onBlur();
    }
  };
  
  // 格式化日期显示
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    
    const date = new Date(dateStr);
    const format = column.dateFormat || 'date';
    
    switch (format) {
      case 'full':
        return date.toLocaleString(locale);
      case 'time':
        return date.toLocaleTimeString(locale);
      case 'relative':
        return getRelativeTime(date, t, locale);
      default:
        return date.toLocaleDateString(locale);
    }
  };
  
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type={column.includeTime ? 'datetime-local' : 'date'}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={() => void handleCommit()}
        onKeyDown={handleKeyDown}
        className="db-input h-9 border-transparent bg-transparent px-2 focus-visible:border-transparent focus-visible:shadow-none"
      />
    );
  }
  
  if (!value?.start) {
    return (
      <div className="h-9 px-2 flex items-center text-sm text-muted-foreground">
        <Calendar className="w-4 h-4 mr-1" />
        {t.common.empty}
      </div>
    );
  }
  
  return (
    <div className="h-9 px-2 flex items-center text-sm">
      <Calendar className="w-4 h-4 mr-1 text-muted-foreground" />
      {formatDate(value.start)}
      {value.end && ` → ${formatDate(value.end)}`}
    </div>
  );
}

function getRelativeTime(date: Date, t: ReturnType<typeof useLocaleStore.getState>['t'], locale: string): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return t.common.today;
  if (days === 1) return t.common.yesterday;
  if (days === -1) return t.common.tomorrow;
  if (days > 0 && days < 7) return t.common.daysAgo.replace("{count}", String(days));
  if (days < 0 && days > -7) return t.common.daysLater.replace("{count}", String(-days));
  
  return date.toLocaleDateString(locale);
}
