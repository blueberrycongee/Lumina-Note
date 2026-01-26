import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore } from "@/stores/useUIStore";
import { useBrowserStore } from "@/stores/useBrowserStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { FileEntry } from "@/lib/tauri";
import { cn, getFileName } from "@/lib/utils";
import {
  Search,
  FolderOpen,
  Plus,
  Sun,
  Moon,
  Sidebar,
  MessageSquare,
  Network,
  Command,
  FileText,
  User,
} from "lucide-react";

export type PaletteMode = "command" | "file" | "search";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

interface FileItem {
  path: string;
  name: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  mode: PaletteMode;
  onClose: () => void;
  onModeChange: (mode: PaletteMode) => void;
}

export function CommandPalette({ isOpen, mode, onClose, onModeChange }: CommandPaletteProps) {
  const { t } = useLocaleStore();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { 
    fileTree, 
    openFile, 
    createNewFile,
    vaultPath,
    openGraphTab,
    openTypesettingPreviewTab,
    openProfilePreviewTab,
    tabs,
    clearVault,
  } = useFileStore();

  const {
    toggleLeftSidebar,
    toggleRightSidebar,
    toggleTheme,
    isDarkMode,
  } = useUIStore();

  const { hideAllWebViews, showAllWebViews } = useBrowserStore();
  
  // Check if graph tab is open
  const isGraphOpen = tabs.some(tab => tab.type === "graph");

  // 弹窗打开时隐藏 WebView，关闭时恢复
  useEffect(() => {
    if (isOpen) {
      hideAllWebViews();
    } else {
      showAllWebViews();
    }
  }, [isOpen, hideAllWebViews, showAllWebViews]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, mode]);

  // Flatten file tree
  const allFiles = useMemo(() => {
    const result: FileItem[] = [];
    const flatten = (entries: FileEntry[]) => {
      for (const entry of entries) {
        if (entry.is_dir && entry.children) {
          flatten(entry.children);
        } else if (!entry.is_dir) {
          result.push({ path: entry.path, name: getFileName(entry.name) });
        }
      }
    };
    flatten(fileTree);
    return result;
  }, [fileTree]);

  // Commands list
  const commands = useMemo<CommandItem[]>(() => [
    {
      id: "new-file",
      label: t.commandPalette.newNote,
      description: t.commandPalette.newNoteDesc,
      icon: <Plus size={16} />,
      shortcut: "Ctrl+N",
      action: () => {
        onClose();
        createNewFile();
      },
    },
    {
      id: "quick-open",
      label: t.commandPalette.quickOpen,
      description: t.commandPalette.quickOpenDesc,
      icon: <Search size={16} />,
      shortcut: "Ctrl+O",
      action: () => onModeChange("file"),
    },
    {
      id: "toggle-left-sidebar",
      label: t.commandPalette.toggleLeftSidebar,
      description: t.commandPalette.toggleLeftSidebarDesc,
      icon: <Sidebar size={16} />,
      action: () => {
        onClose();
        toggleLeftSidebar();
      },
    },
    {
      id: "toggle-right-sidebar",
      label: t.commandPalette.toggleRightSidebar,
      description: t.commandPalette.toggleRightSidebarDesc,
      icon: <MessageSquare size={16} />,
      action: () => {
        onClose();
        toggleRightSidebar();
      },
    },
    {
      id: "toggle-theme",
      label: isDarkMode ? t.commandPalette.toggleToLight : t.commandPalette.toggleToDark,
      description: t.commandPalette.toggleThemeDesc,
      icon: isDarkMode ? <Sun size={16} /> : <Moon size={16} />,
      action: () => {
        onClose();
        toggleTheme();
      },
    },
    {
      id: "show-graph",
      label: isGraphOpen ? t.commandPalette.switchToGraph : t.commandPalette.openGraph,
      description: t.commandPalette.graphDesc,
      icon: <Network size={16} />,
      action: () => {
        onClose();
        openGraphTab();
      },
    },
    {
      id: "typesetting-preview",
      label: "Typesetting Preview",
      description: "Open the paged typesetting preview (placeholder)",
      icon: <FileText size={16} />,
      action: () => {
        onClose();
        openTypesettingPreviewTab();
      },
    },
    {
      id: "profile-preview",
      label: t.commandPalette.openProfilePreview,
      description: t.commandPalette.openProfilePreviewDesc,
      icon: <User size={16} />,
      action: () => {
        onClose();
        openProfilePreviewTab();
      },
    },
    {
      id: "switch-workspace",
      label: t.commandPalette.switchWorkspace,
      description: `${t.commandPalette.current}: ${vaultPath ? vaultPath.split(/[\/\\]/).pop() : t.commandPalette.notSelected}`,
      icon: <FolderOpen size={16} />,
      action: () => {
        onClose();
        clearVault();
      },
    },
    {
      id: "global-search",
      label: t.commandPalette.globalSearch,
      description: t.commandPalette.globalSearchDesc,
      icon: <Search size={16} />,
      shortcut: "Ctrl+Shift+F",
      action: () => {
        onClose();
        window.dispatchEvent(new CustomEvent("open-global-search"));
      },
    },
  ], [t, onClose, createNewFile, onModeChange, toggleLeftSidebar, toggleRightSidebar, toggleTheme, isDarkMode, openGraphTab, isGraphOpen, vaultPath, openTypesettingPreviewTab, openProfilePreviewTab]);

  // Filter items based on query and mode
  const filteredItems = useMemo(() => {
    const q = query.toLowerCase().trim();
    
    if (mode === "command") {
      if (!q) return commands;
      return commands.filter(cmd => 
        cmd.label.toLowerCase().includes(q) || 
        cmd.description?.toLowerCase().includes(q)
      );
    }
    
    if (mode === "file") {
      if (!q) return allFiles.slice(0, 20);
      return allFiles.filter(f => 
        f.name.toLowerCase().includes(q) ||
        f.path.toLowerCase().includes(q)
      ).slice(0, 20);
    }
    
    return [];
  }, [mode, query, commands, allFiles]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, mode]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Execute selected item
  const executeItem = useCallback((index: number) => {
    if (mode === "command") {
      const cmd = filteredItems[index] as CommandItem;
      cmd?.action();
    } else if (mode === "file") {
      const file = filteredItems[index] as FileItem;
      if (file) {
        onClose();
        openFile(file.path);
      }
    }
  }, [mode, filteredItems, onClose, openFile]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredItems.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        executeItem(selectedIndex);
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      case "Tab":
        e.preventDefault();
        // Switch between modes
        if (mode === "command") {
          onModeChange("file");
        } else {
          onModeChange("command");
        }
        break;
    }
  }, [filteredItems.length, selectedIndex, executeItem, onClose, mode, onModeChange]);

  if (!isOpen) return null;

  const placeholder = mode === "command" 
    ? t.commandPalette.commandPlaceholder 
    : mode === "file"
    ? t.commandPalette.filePlaceholder
    : t.commandPalette.searchPlaceholder;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />
      
      {/* Palette */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50">
        <div className="bg-background border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Input area */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Command size={16} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 bg-transparent outline-none text-sm"
            />
            {/* Mode tabs */}
            <div className="flex gap-1 text-xs">
              <button
                onClick={() => onModeChange("command")}
                className={cn(
                  "px-2 py-1 rounded transition-colors",
                  mode === "command" 
                    ? "bg-primary/20 text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.commandPalette.commands}
              </button>
              <button
                onClick={() => onModeChange("file")}
                className={cn(
                  "px-2 py-1 rounded transition-colors",
                  mode === "file" 
                    ? "bg-primary/20 text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.commandPalette.files}
              </button>
            </div>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                {t.commandPalette.noResults}
              </div>
            ) : (
              filteredItems.map((item, index) => {
                if (mode === "command") {
                  const cmd = item as CommandItem;
                  return (
                    <button
                      key={cmd.id}
                      data-index={index}
                      onClick={() => executeItem(index)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        index === selectedIndex 
                          ? "bg-accent text-accent-foreground" 
                          : "hover:bg-muted"
                      )}
                    >
                      <span className="text-muted-foreground">{cmd.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{cmd.label}</div>
                        {cmd.description && (
                          <div className="text-xs text-muted-foreground truncate">
                            {cmd.description}
                          </div>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <kbd className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                } else {
                  const file = item as FileItem;
                  return (
                    <button
                      key={file.path}
                      data-index={index}
                      onClick={() => executeItem(index)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        index === selectedIndex 
                          ? "bg-accent text-accent-foreground" 
                          : "hover:bg-muted"
                      )}
                    >
                      <FileText size={16} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{file.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {file.path}
                        </div>
                      </div>
                    </button>
                  );
                }
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-4">
            <span>
              <kbd className="bg-muted px-1 rounded">↑↓</kbd> {t.commandPalette.select}
            </span>
            <span>
              <kbd className="bg-muted px-1 rounded">Enter</kbd> {t.commandPalette.confirm}
            </span>
            <span>
              <kbd className="bg-muted px-1 rounded">Tab</kbd> {t.commandPalette.switchMode}
            </span>
            <span>
              <kbd className="bg-muted px-1 rounded">Esc</kbd> {t.commandPalette.close}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
