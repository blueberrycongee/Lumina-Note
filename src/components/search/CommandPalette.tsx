import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore } from "@/stores/useUIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { pluginRuntime } from "@/services/plugins/runtime";
import { FileEntry } from "@/lib/host";
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
  Sparkles,
  Clock,
} from "lucide-react";
import {
  FEATURED_COMMAND_IDS,
  readUsage,
  writeUsage,
  type UsageMap,
} from "@/lib/commandPaletteUsage";

export type PaletteMode = "command" | "file" | "search";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  groupTitle?: string;
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
  const [pluginCommandVersion, setPluginCommandVersion] = useState(0);
  const [usage, setUsage] = useState<UsageMap>(() => readUsage());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const {
    fileTree,
    openFile,
    createNewFile,
    vaultPath,
    openGraphTab,
    tabs,
    clearVault,
  } = useFileStore();

  const {
    toggleLeftSidebar,
    toggleRightSidebar,
    toggleTheme,
    isDarkMode,
  } = useUIStore();

  // Check if graph tab is open
  const isGraphOpen = tabs.some(tab => tab.type === "graph");

  // Focus input when opened, refresh usage from storage in case other panes wrote
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setUsage(readUsage());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, mode]);

  useEffect(() => {
    const onUpdate = () => setPluginCommandVersion((value) => value + 1);
    window.addEventListener("lumina-plugin-commands-updated", onUpdate);
    return () => window.removeEventListener("lumina-plugin-commands-updated", onUpdate);
  }, []);

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
    ...pluginRuntime.getRegisteredCommands().map((cmd) => ({
      id: cmd.id,
      label: cmd.title,
      description: cmd.description || `Plugin command from ${cmd.pluginId}`,
      groupTitle: cmd.groupTitle,
      icon: <Command size={16} />,
      shortcut: cmd.hotkey,
      action: () => {
        onClose();
        pluginRuntime.executeCommand(cmd.id);
      },
    })),
  ], [
    t,
    onClose,
    createNewFile,
    onModeChange,
    toggleLeftSidebar,
    toggleRightSidebar,
    toggleTheme,
    isDarkMode,
    openGraphTab,
    isGraphOpen,
    vaultPath,
    fileTree,
    pluginCommandVersion,
  ]);

  // Filter items based on query and mode
  const filteredItems = useMemo(() => {
    const q = query.toLowerCase().trim();

    if (mode === "command") {
      if (!q) {
        // Empty-query command mode renders sectioned (Discover/Recent/All).
        // Build a flat order that mirrors visual order so keyboard nav stays in sync.
        const featuredSet = new Set<string>(FEATURED_COMMAND_IDS);
        const featured = commands.filter((c) => featuredSet.has(c.id));
        const recent = [...commands]
          .filter((c) => !featuredSet.has(c.id) && (usage[c.id]?.count ?? 0) > 0)
          .sort((a, b) => (usage[b.id]?.lastUsed ?? 0) - (usage[a.id]?.lastUsed ?? 0))
          .slice(0, 4);
        const recentIds = new Set(recent.map((c) => c.id));
        const rest = commands.filter((c) => !featuredSet.has(c.id) && !recentIds.has(c.id));
        return [...featured, ...recent, ...rest];
      }
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
  }, [mode, query, commands, allFiles, usage]);

  // Sectioning metadata for the empty-query command view.
  // Maps the visual section header to the index of its first item in `filteredItems`,
  // so we can splat headers into the existing flat render loop without rewriting nav.
  const sectionHeaders = useMemo(() => {
    if (mode !== "command" || query.trim()) return new Map<number, string>();
    const featuredSet = new Set<string>(FEATURED_COMMAND_IDS);
    const featuredCount = commands.filter((c) => featuredSet.has(c.id)).length;
    const recentCount = commands
      .filter((c) => !featuredSet.has(c.id) && (usage[c.id]?.count ?? 0) > 0)
      .slice(0, 4).length;
    const headers = new Map<number, string>();
    if (featuredCount > 0) headers.set(0, "discover");
    if (recentCount > 0) headers.set(featuredCount, "recent");
    if (filteredItems.length > featuredCount + recentCount) {
      headers.set(featuredCount + recentCount, "all");
    }
    return headers;
  }, [mode, query, commands, usage, filteredItems.length]);

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
      if (!cmd) return;
      const next: UsageMap = {
        ...usage,
        [cmd.id]: {
          count: (usage[cmd.id]?.count ?? 0) + 1,
          lastUsed: Date.now(),
        },
      };
      setUsage(next);
      writeUsage(next);
      cmd.action();
    } else if (mode === "file") {
      const file = filteredItems[index] as FileItem;
      if (file) {
        onClose();
        openFile(file.path);
      }
    }
  }, [mode, filteredItems, onClose, openFile, usage]);

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
        className="fixed inset-0 bg-black/50 z-50 animate-spotlight-overlay"
        onClick={onClose}
      />
      
      {/* Palette */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50">
        <div className="bg-background border border-border/60 rounded-xl shadow-2xl overflow-hidden animate-spotlight-in">
          {/* Input area */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
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
                  const headerKey = sectionHeaders.get(index);
                  const isFeatured = (FEATURED_COMMAND_IDS as readonly string[]).includes(cmd.id);
                  const showNewBadge = isFeatured && !usage[cmd.id];
                  const headerLabel =
                    headerKey === "discover"
                      ? t.commandPalette.discoverSection
                      : headerKey === "recent"
                      ? t.commandPalette.recentSection
                      : headerKey === "all"
                      ? t.commandPalette.allCommandsSection
                      : null;
                  const HeaderIcon =
                    headerKey === "discover" ? Sparkles : headerKey === "recent" ? Clock : null;
                  return (
                    <div key={cmd.id}>
                      {headerLabel && (
                        <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/80">
                          {HeaderIcon ? <HeaderIcon size={11} className="opacity-70" /> : null}
                          <span>{headerLabel}</span>
                        </div>
                      )}
                      <button
                        data-index={index}
                        onClick={() => executeItem(index)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                          index === selectedIndex
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted"
                        )}
                      >
                        <span className={cn("text-muted-foreground", isFeatured && "text-primary/80")}>
                          {cmd.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium flex items-center gap-2">
                            <span className="truncate">{cmd.label}</span>
                            {showNewBadge && (
                              <span className="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                                {t.commandPalette.newBadge}
                              </span>
                            )}
                          </div>
                          {cmd.description && (
                            <div className="text-xs text-muted-foreground truncate">
                              {cmd.description}
                            </div>
                          )}
                          {cmd.groupTitle && (
                            <div className="text-xs text-primary/80 truncate">{cmd.groupTitle}</div>
                          )}
                        </div>
                        {cmd.shortcut && (
                          <kbd className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </button>
                    </div>
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
          <div className="px-4 py-2 border-t border-border/60 text-xs text-muted-foreground flex items-center gap-4">
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
