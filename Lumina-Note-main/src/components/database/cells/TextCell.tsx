import { useState, useRef, useEffect } from "react";
import type { DatabaseColumn } from "@/types/database";
import { useLocaleStore } from "@/stores/useLocaleStore";
import type { CellCommitAction } from "./types";

interface TextCellProps {
  value: string | null;
  onChange: (value: string) => Promise<boolean>;
  isEditing: boolean;
  onBlur: (action?: CellCommitAction) => void;
  column: DatabaseColumn;
}

export function TextCell({ value, onChange, isEditing, onBlur }: TextCellProps) {
  const { t } = useLocaleStore();
  const [editValue, setEditValue] = useState(value || '');
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);
  
  useEffect(() => {
    setEditValue(value || '');
  }, [value]);
  
  const handleCommit = async (action?: CellCommitAction) => {
    if (editValue !== value) {
      const ok = await onChange(editValue);
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
      setEditValue(value || '');
      onBlur();
    }
  };
  
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={() => void handleCommit()}
        onKeyDown={handleKeyDown}
        className="db-input h-9 border-transparent bg-transparent px-2 focus-visible:border-transparent focus-visible:shadow-none"
      />
    );
  }
  
  return (
    <div className="h-9 px-2 flex items-center text-sm truncate">
      {value || <span className="text-muted-foreground">{t.common.empty}</span>}
    </div>
  );
}
