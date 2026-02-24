import { useState, useRef, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import type { DatabaseColumn } from "@/types/database";
import { useLocaleStore } from "@/stores/useLocaleStore";
import type { CellCommitAction } from "./types";

interface UrlCellProps {
  value: string | null;
  onChange: (value: string) => Promise<boolean>;
  isEditing: boolean;
  onBlur: (action?: CellCommitAction) => void;
  column: DatabaseColumn;
}

export function UrlCell({ value, onChange, isEditing, onBlur }: UrlCellProps) {
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
  
  const handleOpenUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (value) {
      window.open(value, '_blank');
    }
  };
  
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="url"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={() => void handleCommit()}
        onKeyDown={handleKeyDown}
        placeholder="https://"
        className="db-input h-9 border-transparent bg-transparent px-2 focus-visible:border-transparent focus-visible:shadow-none"
      />
    );
  }
  
  if (!value) {
    return (
      <div className="h-9 px-2 flex items-center text-sm text-muted-foreground">
        {t.common.empty}
      </div>
    );
  }
  
  return (
    <div className="h-9 px-2 flex items-center gap-1 text-sm group">
      <span className="truncate text-slate-500 hover:underline cursor-pointer" onClick={handleOpenUrl}>
        {value.replace(/^https?:\/\//, '')}
      </span>
      <button
        onClick={handleOpenUrl}
        className="db-icon-btn h-6 w-6 opacity-0 group-hover:opacity-100"
        aria-label={t.common.open}
        title={t.common.open}
      >
        <ExternalLink className="w-3 h-3 text-muted-foreground" />
      </button>
    </div>
  );
}
