import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useBrowserStore } from "@/stores/useBrowserStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { FileEntry, readFile } from "@/lib/tauri";
import { cn, getFileName } from "@/lib/utils";
import { reportOperationError } from "@/lib/reportError";
import { Search, X, FileText, Loader2, Replace, ChevronDown, ChevronRight } from "lucide-react";

interface SearchResult {
  path: string;
  name: string;
  matches: SearchMatch[];
}

interface SearchMatch {
  line: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const { t } = useLocaleStore();
  const [query, setQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { fileTree, openFile } = useFileStore();
  const { hideAllWebViews, showAllWebViews } = useBrowserStore();

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
      setReplaceQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Flatten file tree to get all file paths
  const allFiles = useMemo(() => {
    const files: { path: string; name: string }[] = [];
    const flatten = (entries: FileEntry[]) => {
      for (const entry of entries) {
        if (entry.is_dir && entry.children) {
          flatten(entry.children);
        } else if (!entry.is_dir) {
          files.push({ path: entry.path, name: getFileName(entry.name) });
        }
      }
    };
    flatten(fileTree);
    return files;
  }, [fileTree]);

  // Search function
  const performSearch = useCallback(async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const searchResults: SearchResult[] = [];
    const failedFiles: string[] = [];

    try {
      // Build search pattern
      let pattern: RegExp;
      try {
        if (useRegex) {
          pattern = new RegExp(query, caseSensitive ? "g" : "gi");
        } else {
          const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          pattern = new RegExp(escaped, caseSensitive ? "g" : "gi");
        }
      } catch (error) {
        reportOperationError({
          source: "GlobalSearch.performSearch",
          action: "Compile search pattern",
          error,
          level: "warning",
          context: { query, useRegex, caseSensitive },
        });
        setIsSearching(false);
        return;
      }

      // Search through all files
      for (const file of allFiles) {
        try {
          const content = await readFile(file.path);
          const lines = content.split("\n");
          const matches: SearchMatch[] = [];

          lines.forEach((line, lineIndex) => {
            let match;
            pattern.lastIndex = 0;
            while ((match = pattern.exec(line)) !== null) {
              matches.push({
                line: lineIndex + 1,
                content: line.trim(),
                matchStart: match.index,
                matchEnd: match.index + match[0].length,
              });
              // Prevent infinite loop for zero-length matches
              if (match[0].length === 0) break;
            }
          });

          if (matches.length > 0) {
            searchResults.push({
              path: file.path,
              name: file.name,
              matches,
            });
            // Auto-expand files with matches
            setExpandedFiles(prev => new Set([...prev, file.path]));
          }
        } catch {
          failedFiles.push(file.path);
        }
      }

      setResults(searchResults);
      if (failedFiles.length > 0) {
        reportOperationError({
          source: "GlobalSearch.performSearch",
          action: "Read files for search",
          error: `${failedFiles.length} files could not be read`,
          level: "warning",
          context: {
            failedCount: failedFiles.length,
            samplePaths: failedFiles.slice(0, 5),
          },
        });
      }
    } finally {
      setIsSearching(false);
    }
  }, [query, allFiles, useRegex, caseSensitive]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [performSearch]);

  // Toggle file expansion
  const toggleFile = useCallback((path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Jump to match
  const jumpToMatch = useCallback((result: SearchResult, match: SearchMatch) => {
    onClose();
    openFile(result.path);
    // Dispatch event for editor to scroll to line
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("search-jump-to", { detail: { line: match.line } })
      );
    }, 100);
  }, [onClose, openFile]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      performSearch();
    }
  }, [onClose, performSearch]);

  // Total match count
  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Search Panel */}
      <div className="fixed top-0 right-0 w-96 h-full bg-background border-l border-border z-50 flex flex-col shadow-xl">
        {/* Header */}
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="font-medium text-sm flex items-center gap-2">
            <Search size={16} />
            {t.globalSearch.title}
          </span>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Search inputs */}
        <div className="p-3 border-b border-border space-y-2">
          {/* Search input */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.globalSearch.searchPlaceholder}
              className="w-full pl-8 pr-3 py-2 bg-muted/50 border border-border rounded-md text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Replace input (optional) */}
          {showReplace && (
            <div className="relative">
              <Replace size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder={t.globalSearch.replacePlaceholder}
                className="w-full pl-8 pr-3 py-2 bg-muted/50 border border-border rounded-md text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          {/* Options */}
          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={() => setShowReplace(!showReplace)}
              className={cn(
                "px-2 py-1 rounded transition-colors",
                showReplace ? "bg-primary/20 text-primary" : "hover:bg-muted text-muted-foreground"
              )}
            >
              {t.globalSearch.replace}
            </button>
            <button
              onClick={() => setCaseSensitive(!caseSensitive)}
              className={cn(
                "px-2 py-1 rounded transition-colors font-mono",
                caseSensitive ? "bg-primary/20 text-primary" : "hover:bg-muted text-muted-foreground"
              )}
              title={t.globalSearch.caseSensitive}
            >
              Aa
            </button>
            <button
              onClick={() => setUseRegex(!useRegex)}
              className={cn(
                "px-2 py-1 rounded transition-colors font-mono",
                useRegex ? "bg-primary/20 text-primary" : "hover:bg-muted text-muted-foreground"
              )}
              title={t.globalSearch.useRegex}
            >
              .*
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {isSearching ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 size={20} className="animate-spin mr-2" />
              {t.globalSearch.searching}
            </div>
          ) : query && results.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              {t.globalSearch.noMatches}
            </div>
          ) : (
            <div className="py-2">
              {results.map((result) => (
                <div key={result.path} className="border-b border-border last:border-b-0">
                  {/* File header */}
                  <button
                    onClick={() => toggleFile(result.path)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors"
                  >
                    {expandedFiles.has(result.path) ? (
                      <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                    )}
                    <FileText size={14} className="text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate flex-1 text-left">
                      {result.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {result.matches.length}
                    </span>
                  </button>

                  {/* Matches */}
                  {expandedFiles.has(result.path) && (
                    <div className="bg-muted/30">
                      {result.matches.slice(0, 10).map((match, idx) => {
                        // Highlight the matched text
                        const before = match.content.slice(0, match.matchStart);
                        const matched = match.content.slice(match.matchStart, match.matchEnd);
                        const after = match.content.slice(match.matchEnd);
                        
                        return (
                          <button
                            key={idx}
                            onClick={() => jumpToMatch(result, match)}
                            className="w-full flex items-start gap-2 px-3 py-2 hover:bg-muted transition-colors text-left group"
                          >
                            <span className="text-xs text-muted-foreground w-8 shrink-0 text-right font-mono">
                              {match.line}
                            </span>
                            <span className="text-xs font-mono truncate flex-1">
                              <span className="text-muted-foreground">{before.slice(-30)}</span>
                              <span className="bg-yellow-400/40 text-foreground font-semibold px-0.5 rounded">{matched}</span>
                              <span className="text-muted-foreground">{after.slice(0, 30)}</span>
                            </span>
                          </button>
                        );
                      })}
                      {result.matches.length > 10 && (
                        <div className="px-3 py-1.5 text-xs text-muted-foreground italic">
                          {t.globalSearch.moreMatches.replace("{count}", String(result.matches.length - 10))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-border text-xs text-muted-foreground">
          {results.length > 0 ? (
            <span>{t.globalSearch.summary.replace("{files}", String(results.length)).replace("{matches}", String(totalMatches))}</span>
          ) : (
            <span>{t.globalSearch.shortcutHint}</span>
          )}
        </div>
      </div>
    </>
  );
}
