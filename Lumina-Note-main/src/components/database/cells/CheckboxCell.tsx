import { Check } from "lucide-react";
import type { DatabaseColumn } from "@/types/database";
import type { CellCommitAction } from "./types";

interface CheckboxCellProps {
  value: boolean | null;
  onChange: (value: boolean) => Promise<boolean>;
  isEditing: boolean;
  onBlur: (action?: CellCommitAction) => void;
  column: DatabaseColumn;
}

export function CheckboxCell({ value, onChange }: CheckboxCellProps) {
  const isChecked = value === true;
  
  return (
    <div className="h-9 px-2 flex items-center justify-center">
      <button
        onClick={(e) => {
          e.stopPropagation();
          void onChange(!isChecked);
        }}
        className={`db-focus-ring w-5 h-5 rounded border-2 flex items-center justify-center transition-[background-color,border-color,transform] duration-120 ease-out ${
          isChecked
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-muted-foreground/30 hover:border-primary/50'
        }`}
        aria-label="Toggle checkbox value"
      >
        {isChecked && <Check className="w-3 h-3" />}
      </button>
    </div>
  );
}
