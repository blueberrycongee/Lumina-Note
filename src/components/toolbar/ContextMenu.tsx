import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  Trash2,
  Pencil,
  Copy,
  FolderOpen,
  FilePlus,
  FolderPlus,
} from "lucide-react";

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  const content = (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] bg-background border border-border rounded-lg shadow-lg py-1 animate-fade-scale-in"
      style={{ left: x, top: y }}
    >
      {items.map((item, index) => (
        <div key={index}>
          {item.divider && <div className="my-1 border-t border-border" />}
          <button
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors text-left",
              item.danger
                ? "text-red-500 hover:bg-red-500/10"
                : "text-foreground hover:bg-accent"
            )}
          >
            {item.icon && <span className="w-4 h-4">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}

// Pre-built menu item creators
export const menuItems = {
  rename: (onClick: () => void): MenuItem => ({
    label: "重命名",
    icon: <Pencil size={14} />,
    onClick,
  }),
  delete: (onClick: () => void): MenuItem => ({
    label: "删除",
    icon: <Trash2 size={14} />,
    onClick,
    danger: true,
    divider: true,
  }),
  copyPath: (onClick: () => void): MenuItem => ({
    label: "复制路径",
    icon: <Copy size={14} />,
    onClick,
  }),
  showInExplorer: (onClick: () => void): MenuItem => ({
    label: "在资源管理器中显示",
    icon: <FolderOpen size={14} />,
    onClick,
  }),
  newFile: (onClick: () => void): MenuItem => ({
    label: "新建文件",
    icon: <FilePlus size={14} />,
    onClick,
  }),
  newFolder: (onClick: () => void): MenuItem => ({
    label: "新建文件夹",
    icon: <FolderPlus size={14} />,
    onClick,
  }),
};
