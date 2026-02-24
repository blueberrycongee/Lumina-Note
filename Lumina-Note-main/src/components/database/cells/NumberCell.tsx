import { useState, useRef, useEffect } from "react";
import type { DatabaseColumn } from "@/types/database";
import type { CellCommitAction } from "./types";

interface NumberCellProps {
  value: number | null;
  onChange: (value: number | null) => Promise<boolean>;
  isEditing: boolean;
  onBlur: (action?: CellCommitAction) => void;
  column: DatabaseColumn;
}

export function NumberCell({ value, onChange, isEditing, onBlur, column }: NumberCellProps) {
  const [editValue, setEditValue] = useState(value?.toString() || '');
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  
  useEffect(() => {
    setEditValue(value?.toString() || '');
  }, [value]);
  
  const handleCommit = async (action?: CellCommitAction) => {
    const numValue = editValue === '' ? null : parseFloat(editValue);
    if (!isNaN(numValue as number) && numValue !== value) {
      const ok = await onChange(numValue);
      if (!ok) {
        inputRef.current?.focus();
        inputRef.current?.select();
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
      setEditValue(value?.toString() || '');
      onBlur();
    }
  };
  
  // 格式化显示值
  const formatValue = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return '';
    
    switch (column.numberFormat) {
      case 'percent':
        return `${(val * 100).toFixed(0)}%`;
      case 'currency':
        return `¥${val.toLocaleString()}`;
      default:
        return val.toLocaleString();
    }
  };
  
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={() => void handleCommit()}
        onKeyDown={handleKeyDown}
        className="db-input h-9 border-transparent bg-transparent px-2 text-right focus-visible:border-transparent focus-visible:shadow-none"
      />
    );
  }
  
  return (
    <div className="h-9 px-2 flex items-center justify-end text-sm">
      {value != null ? formatValue(value) : <span className="text-muted-foreground">-</span>}
    </div>
  );
}
