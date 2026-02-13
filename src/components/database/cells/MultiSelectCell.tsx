import { useState, useRef, useEffect, useMemo } from "react";
import { useDatabaseStore } from "@/stores/useDatabaseStore";
import type { DatabaseColumn, SelectColor } from "@/types/database";
import { ChevronDown, Plus, X, Check } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import type { CellCommitAction } from "./types";
import { getSelectColorClasses, normalizeSelectOptions } from "@/features/database/selectOptions";

interface MultiSelectCellProps {
  value: string[] | null;
  onChange: (value: string[]) => Promise<boolean>;
  isEditing: boolean;
  onBlur: (action?: CellCommitAction) => void;
  column: DatabaseColumn;
  dbId: string;
}

export function MultiSelectCell({ value, onChange, isEditing, onBlur, column, dbId }: MultiSelectCellProps) {
  const { t } = useLocaleStore();
  const { addSelectOption } = useDatabaseStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [newOptionName, setNewOptionName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const options = useMemo(() => normalizeSelectOptions(column.options), [column.options]);
  const selectedIds = value || [];
  const selectedOptions = options.filter(opt => selectedIds.includes(opt.id));
  
  useEffect(() => {
    if (isEditing) {
      setShowDropdown(true);
    }
  }, [isEditing]);
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        onBlur();
      }
    };
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown, onBlur]);
  
  const handleToggle = (optionId: string) => {
    if (selectedIds.includes(optionId)) {
      void onChange(selectedIds.filter(id => id !== optionId));
    } else {
      void onChange([...selectedIds, optionId]);
    }
  };
  
  const handleRemove = (e: React.MouseEvent, optionId: string) => {
    e.stopPropagation();
    void onChange(selectedIds.filter(id => id !== optionId));
  };
  
  const handleAddOption = () => {
    if (newOptionName.trim()) {
      const colors: SelectColor[] = ['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink'];
      const color = colors[options.length % colors.length];
      const optionId = addSelectOption(dbId, column.id, { name: newOptionName.trim(), color });
      void onChange([...selectedIds, optionId]);
      setNewOptionName('');
    }
  };
  
  return (
    <div className="relative min-h-9" ref={dropdownRef}>
      <div
        className="min-h-9 px-2 py-1 flex items-center gap-1 flex-wrap cursor-pointer"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        {selectedOptions.length > 0 ? (
          selectedOptions.map((option) => {
            const optionColors = getSelectColorClasses(option.color);
            return (
              <span
                key={option.id}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm ${optionColors.bg} ${optionColors.text}`}
              >
                {option.name}
                <button
                  onClick={(e) => handleRemove(e, option.id)}
                  className="db-icon-btn h-4 w-4 border-0 bg-transparent"
                  aria-label={t.common.delete}
                  title={t.common.delete}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })
        ) : (
          <span className="text-sm text-muted-foreground">{t.database.selectPlaceholder}</span>
        )}
        <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto flex-shrink-0" />
      </div>
      
      {showDropdown && (
        <div className="db-menu absolute left-0 top-full mt-1 w-56 py-1 z-50 max-h-64 overflow-y-auto">
          {options.map((option) => {
            const isSelected = selectedIds.includes(option.id);
            const optionColors = getSelectColorClasses(option.color);
            return (
              <button
                key={option.id}
                onClick={() => handleToggle(option.id)}
                className="db-menu-item"
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                  isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'
                }`}>
                  {isSelected && <Check className="w-3 h-3" />}
                </span>
                <span className={`px-2 py-0.5 rounded ${optionColors.bg} ${optionColors.text}`}>
                  {option.name}
                </span>
              </button>
            );
          })}
          
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {t.database.noOptions}
            </div>
          )}
          
          <div className="border-t border-border/70 mt-1 pt-1 px-2">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newOptionName}
                onChange={(e) => setNewOptionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddOption();
                }}
                placeholder={t.database.newOption}
                className="db-input h-8 flex-1 border-transparent bg-transparent px-2 focus-visible:border-transparent focus-visible:shadow-none"
              />
              <button
                onClick={handleAddOption}
                disabled={!newOptionName.trim()}
                className="db-icon-btn h-7 w-7 disabled:opacity-50"
                aria-label={t.common.add}
                title={t.common.add}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
