import { useState, useRef, useEffect, useMemo } from "react";
import { useDatabaseStore } from "@/stores/useDatabaseStore";
import type { DatabaseColumn, SelectColor } from "@/types/database";
import { ChevronDown, Plus, X } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import type { CellCommitAction } from "./types";
import { getSelectColorClasses, normalizeSelectOptions } from "@/features/database/selectOptions";

interface SelectCellProps {
  value: string | null;
  onChange: (value: string | null) => Promise<boolean>;
  isEditing: boolean;
  onBlur: (action?: CellCommitAction) => void;
  column: DatabaseColumn;
  dbId: string;
}

export function SelectCell({ value, onChange, isEditing, onBlur, column, dbId }: SelectCellProps) {
  const { t } = useLocaleStore();
  const { addSelectOption } = useDatabaseStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [newOptionName, setNewOptionName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const options = useMemo(() => normalizeSelectOptions(column.options), [column.options]);
  const selectedOption = options.find(opt => opt.id === value);
  const selectedOptionColors = selectedOption ? getSelectColorClasses(selectedOption.color) : null;
  
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
  
  const handleSelect = async (optionId: string) => {
    const ok = await onChange(optionId);
    if (!ok) return;
    setShowDropdown(false);
    onBlur();
  };
  
  const handleClear = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onChange(null);
  };
  
  const handleAddOption = () => {
    if (newOptionName.trim()) {
      const colors: SelectColor[] = ['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink'];
      const color = colors[options.length % colors.length];
      const optionId = addSelectOption(dbId, column.id, { name: newOptionName.trim(), color });
      void onChange(optionId);
      setNewOptionName('');
      setShowDropdown(false);
      onBlur();
    }
  };
  
  return (
    <div className="relative h-9" ref={dropdownRef}>
      <div
        className="h-full px-2 flex items-center gap-1 cursor-pointer"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        {selectedOption ? (
          <>
            <span
              className={`px-2 py-0.5 rounded text-sm ${selectedOptionColors?.bg} ${selectedOptionColors?.text}`}
            >
              {selectedOption.name}
            </span>
            <button
              onClick={handleClear}
              className="db-icon-btn h-5 w-5 opacity-0 group-hover:opacity-100"
              aria-label={t.common.clear}
              title={t.common.clear}
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">{t.database.selectPlaceholder}</span>
        )}
        <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
      </div>
      
      {showDropdown && (
        <div className="db-menu absolute left-0 top-full mt-1 w-48 py-1 z-50">
          {options.map((option) => {
            const optionColors = getSelectColorClasses(option.color);
            return (
              <button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className={`db-menu-item ${
                  value === option.id ? 'bg-accent' : ''
                }`}
              >
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
