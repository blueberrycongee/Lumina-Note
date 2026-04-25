import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Regex,
  Search,
  CaseSensitive,
  X,
} from "lucide-react";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { readFile, type FileEntry } from "@/lib/host";
import { cn, getFileName } from "@/lib/utils";
import { reportOperationError } from "@/lib/reportError";

interface SearchMatch {
  line: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}

interface SearchResult {
  path: string;
  name: string;
  matches: SearchMatch[];
}

const DEBOUNCE_MS = 250;
const PREVIEW_CONTEXT = 24;

function flattenFiles(tree: FileEntry[]): { path: string; name: string }[] {
  const out: { path: string; name: string }[] = [];
  const walk = (entries: FileEntry[]) => {
    for (const entry of entries) {
      if (entry.is_dir) {
        if (entry.children) walk(entry.children);
      } else {
        out.push({ path: entry.path, name: getFileName(entry.name) });
      }
    }
  };
  walk(tree);
  return out;
}

function highlightLine(content: string, start: number, end: number) {
  const previewStart = Math.max(0, start - PREVIEW_CONTEXT);
  const before = (previewStart > 0 ? "…" : "") + content.slice(previewStart, start);
  const matched = content.slice(start, end);
  const after = content.slice(end);
  return { before, matched, after };
}

interface SearchSidebarProps {
  /** Optional ref-callback to receive the input element for external focus calls */
  inputRef?: (el: HTMLInputElement | null) => void;
}

export function SearchSidebar({ inputRef }: SearchSidebarProps) {
  const { t } = useLocaleStore();
  const { fileTree, openFile } = useFileStore();
  const [query, setQuery] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const fileLinesCache = useRef<Map<string, string[]>>(new Map());
  const searchRunIdRef = useRef(0);

  const focusInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      if (el) el.focus();
      if (inputRef) inputRef(el);
    },
    [inputRef],
  );

  const allFiles = useMemo(() => flattenFiles(fileTree), [fileTree]);

  const performSearch = useCallback(async () => {
    const trimmed = query.trim();
    const runId = ++searchRunIdRef.current;

    if (!trimmed) {
      setIsSearching(false);
      setResults([]);
      return;
    }

    setIsSearching(true);
    let pattern: RegExp;
    try {
      const flags = caseSensitive ? "g" : "gi";
      pattern = useRegex
        ? new RegExp(trimmed, flags)
        : new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    } catch (error) {
      reportOperationError({
        source: "SearchSidebar.performSearch",
        action: "Compile search pattern",
        error,
        level: "warning",
        context: { query: trimmed, useRegex, caseSensitive },
      });
      setIsSearching(false);
      return;
    }

    const found: SearchResult[] = [];
    for (const file of allFiles) {
      if (runId !== searchRunIdRef.current) return;
      try {
        const cacheKey = file.path.replace(/\\/g, "/");
        let lines = fileLinesCache.current.get(cacheKey);
        if (!lines) {
          const content = await readFile(file.path);
          lines = content.split("\n");
          fileLinesCache.current.set(cacheKey, lines);
        }
        const matches: SearchMatch[] = [];
        lines.forEach((line, lineIndex) => {
          pattern.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = pattern.exec(line)) !== null) {
            matches.push({
              line: lineIndex + 1,
              content: line,
              matchStart: m.index,
              matchEnd: m.index + m[0].length,
            });
            if (m[0].length === 0) break;
          }
        });
        if (matches.length > 0) {
          found.push({ path: file.path, name: file.name, matches });
        }
      } catch {
        // Skip files we can't read; common for binary files etc.
      }
    }

    if (runId !== searchRunIdRef.current) return;
    setResults(found);
    setIsSearching(false);
  }, [query, allFiles, useRegex, caseSensitive]);

  useEffect(() => {
    const timer = setTimeout(performSearch, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [performSearch]);

  // Clear cached file contents when the file tree mutates so renames/edits show up
  useEffect(() => {
    fileLinesCache.current.clear();
  }, [fileTree]);

  const toggleFile = useCallback((path: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const jumpTo = useCallback(
    (result: SearchResult, match: SearchMatch) => {
      void openFile(result.path);
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("search-jump-to", { detail: { line: match.line } }),
        );
      }, 80);
    },
    [openFile],
  );

  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search input + filters */}
      <div className="flex flex-col gap-2 px-2 py-2">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={focusInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.globalSearch.searchPlaceholder}
            className="ui-input h-8 w-full pl-7 pr-7 text-[13px]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-ui-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t.common.clear ?? "Clear"}
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCaseSensitive((v) => !v)}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-ui-sm transition-colors",
              caseSensitive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            title={t.globalSearch.caseSensitive}
          >
            <CaseSensitive size={14} />
          </button>
          <button
            onClick={() => setUseRegex((v) => !v)}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-ui-sm transition-colors",
              useRegex
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            title={t.globalSearch.useRegex}
          >
            <Regex size={14} />
          </button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {isSearching
              ? null
              : query.trim() && results.length === 0
                ? t.globalSearch.noMatches
                : totalMatches > 0
                  ? t.globalSearch.summary
                      .replace("{files}", String(results.length))
                      .replace("{matches}", String(totalMatches))
                  : null}
          </span>
        </div>
      </div>

      {/* Results */}
      <div className="sidebar-file-tree-scroll min-h-0 flex-1 overflow-auto pb-2">
        {isSearching && results.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            {t.globalSearch.searching ?? "Searching..."}
          </div>
        ) : results.length === 0 && query.trim() ? (
          <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
            {t.globalSearch.noMatches}
          </div>
        ) : results.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
            {t.globalSearch.searchPlaceholder}
          </div>
        ) : (
          results.map((result) => {
            const collapsed = collapsedFiles.has(result.path);
            return (
              <div key={result.path} className="px-1">
                <button
                  onClick={() => toggleFile(result.path)}
                  className="flex w-full items-center gap-1 rounded-ui-sm px-1.5 py-1 text-left text-[13px] hover:bg-accent"
                >
                  {collapsed ? (
                    <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
                  )}
                  <FileText size={12} className="shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{result.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {result.matches.length}
                  </span>
                </button>
                {!collapsed && (
                  <div className="space-y-0.5">
                    {result.matches.map((m, idx) => {
                      const { before, matched, after } = highlightLine(
                        m.content,
                        m.matchStart,
                        m.matchEnd,
                      );
                      return (
                        <button
                          key={idx}
                          onClick={() => jumpTo(result, m)}
                          className="flex w-full items-baseline gap-1.5 rounded-ui-sm px-2 py-0.5 pl-7 text-left text-[12px] hover:bg-accent"
                          title={m.content.trim()}
                        >
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                            {m.line}
                          </span>
                          <span className="truncate text-muted-foreground">
                            {before}
                            <mark className="rounded-sm bg-primary/20 px-0.5 text-foreground">
                              {matched}
                            </mark>
                            {after}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
