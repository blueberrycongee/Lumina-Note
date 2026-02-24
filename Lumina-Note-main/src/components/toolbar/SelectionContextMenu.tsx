/**
 * 选中文本右键上下文菜单
 * 提供格式化、链接、段落设置等操作
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Link,
  ExternalLink,
  Type,
  List,
  ListOrdered,
  CheckSquare,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Quote,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Highlighter,
  Scissors,
  Copy,
  Clipboard,
  ChevronRight,
  FileText,
} from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { cn } from "@/lib/utils";

interface SelectionContextMenuProps {
  containerRef: React.RefObject<HTMLElement>;
  onFormatText?: (format: string, selectedText: string) => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  action?: () => void;
  submenu?: MenuItem[];
  divider?: boolean;
}

export function SelectionContextMenu({ containerRef, onFormatText }: SelectionContextMenuProps) {
  const { t } = useLocaleStore();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 格式化文本
  const formatText = useCallback((format: string) => {
    if (!selectedText || !onFormatText) return;
    onFormatText(format, selectedText);
    setPosition(null);
  }, [selectedText, onFormatText]);

  // 剪切
  const handleCut = useCallback(() => {
    document.execCommand('cut');
    setPosition(null);
  }, []);

  // 复制
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(selectedText);
    setPosition(null);
  }, [selectedText]);

  // 粘贴
  const handlePaste = useCallback(async () => {
    const text = await navigator.clipboard.readText();
    document.execCommand('insertText', false, text);
    setPosition(null);
  }, []);

  // 菜单项定义
  const menuItems: MenuItem[] = [
    {
      id: "link",
      label: t.contextMenu.addLink,
      icon: <Link size={14} />,
      action: () => formatText("wikilink"),
    },
    {
      id: "external-link",
      label: t.contextMenu.addExternalLink,
      icon: <ExternalLink size={14} />,
      action: () => formatText("link"),
    },
    { id: "divider1", label: "", divider: true },
    {
      id: "format",
      label: t.contextMenu.textFormat,
      icon: <Type size={14} />,
      submenu: [
        { id: "bold", label: t.contextMenu.bold, icon: <Bold size={14} />, shortcut: "Ctrl+B", action: () => formatText("bold") },
        { id: "italic", label: t.contextMenu.italic, icon: <Italic size={14} />, shortcut: "Ctrl+I", action: () => formatText("italic") },
        { id: "strikethrough", label: t.contextMenu.strikethrough, icon: <Strikethrough size={14} />, action: () => formatText("strikethrough") },
        { id: "highlight", label: t.contextMenu.highlight, icon: <Highlighter size={14} />, action: () => formatText("highlight") },
        { id: "code", label: t.contextMenu.inlineCode, icon: <Code size={14} />, shortcut: "Ctrl+`", action: () => formatText("code") },
      ],
    },
    {
      id: "paragraph",
      label: t.contextMenu.paragraphSettings,
      icon: <FileText size={14} />,
      submenu: [
        { id: "ul", label: t.contextMenu.bulletList, icon: <List size={14} />, action: () => formatText("ul") },
        { id: "ol", label: t.contextMenu.numberedList, icon: <ListOrdered size={14} />, action: () => formatText("ol") },
        { id: "task", label: t.contextMenu.taskList, icon: <CheckSquare size={14} />, action: () => formatText("task") },
        { id: "divider-p1", label: "", divider: true },
        { id: "h1", label: t.contextMenu.heading1, icon: <Heading1 size={14} />, action: () => formatText("h1") },
        { id: "h2", label: t.contextMenu.heading2, icon: <Heading2 size={14} />, action: () => formatText("h2") },
        { id: "h3", label: t.contextMenu.heading3, icon: <Heading3 size={14} />, action: () => formatText("h3") },
        { id: "h4", label: t.contextMenu.heading4, icon: <Heading4 size={14} />, action: () => formatText("h4") },
        { id: "h5", label: t.contextMenu.heading5, icon: <Heading5 size={14} />, action: () => formatText("h5") },
        { id: "h6", label: t.contextMenu.heading6, icon: <Heading6 size={14} />, action: () => formatText("h6") },
        { id: "divider-p2", label: "", divider: true },
        { id: "quote", label: t.contextMenu.quote, icon: <Quote size={14} />, action: () => formatText("quote") },
      ],
    },
    { id: "divider2", label: "", divider: true },
    {
      id: "cut",
      label: t.contextMenu.cut,
      icon: <Scissors size={14} />,
      shortcut: "Ctrl+X",
      action: handleCut,
    },
    {
      id: "copy",
      label: t.contextMenu.copy,
      icon: <Copy size={14} />,
      shortcut: "Ctrl+C",
      action: handleCopy,
    },
    {
      id: "paste",
      label: t.contextMenu.paste,
      icon: <Clipboard size={14} />,
      shortcut: "Ctrl+V",
      action: handlePaste,
    },
  ];

  // 右键事件处理
  const handleContextMenu = useCallback((e: MouseEvent) => {
    const container = containerRef.current;
    if (!container || !container.contains(e.target as Node)) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text) return;

    e.preventDefault();
    setSelectedText(text);
    setActiveSubmenu(null);

    // 计算菜单位置，确保不超出视口
    const menuWidth = 220;
    const menuHeight = 350;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }

    setPosition({ x, y });
  }, [containerRef]);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setPosition(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPosition(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // 绑定右键事件
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("contextmenu", handleContextMenu);
    return () => container.removeEventListener("contextmenu", handleContextMenu);
  }, [containerRef, handleContextMenu]);

  if (!position) return null;

  const renderMenuItem = (item: MenuItem, _isSubmenu = false) => {
    if (item.divider) {
      return <div key={item.id} className="h-px bg-border my-1" />;
    }

    const hasSubmenu = item.submenu && item.submenu.length > 0;

    return (
      <div
        key={item.id}
        className="relative"
        onMouseEnter={() => hasSubmenu && setActiveSubmenu(item.id)}
        onMouseLeave={() => hasSubmenu && setActiveSubmenu(null)}
      >
        <button
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent rounded-sm transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          onClick={() => {
            if (item.action && !hasSubmenu) {
              item.action();
            }
          }}
        >
          <span className="w-4 h-4 flex items-center justify-center text-muted-foreground">
            {item.icon}
          </span>
          <span className="flex-1 text-left">{item.label}</span>
          {item.shortcut && (
            <span className="text-xs text-muted-foreground">{item.shortcut}</span>
          )}
          {hasSubmenu && (
            <ChevronRight size={14} className="text-muted-foreground" />
          )}
        </button>

        {/* 子菜单 */}
        {hasSubmenu && activeSubmenu === item.id && (
          <div
            className="absolute left-full top-0 ml-1 min-w-[180px] bg-background border border-border rounded-lg shadow-lg py-1 z-[60]"
            onMouseEnter={() => setActiveSubmenu(item.id)}
          >
            {item.submenu!.map((subItem) => renderMenuItem(subItem, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] bg-background border border-border rounded-lg shadow-xl py-1"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {menuItems.map((item) => renderMenuItem(item))}
    </div>
  );
}
