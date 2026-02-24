import { useMemo, useState } from "react";
import { Check, X, FileText, Code, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseMarkdown } from "@/services/markdown/markdown";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface DiffLine {
  type: "unchanged" | "added" | "removed";
  content: string;
  lineNumber: { old?: number; new?: number };
}

interface DiffViewProps {
  fileName: string;
  original: string;
  modified: string;
  description?: string;
  onAccept: () => void;
  onReject: () => void;
}

// Compute line-based diff
function computeDiff(original: string, modified: string): DiffLine[] {
  const oldLines = original.split("\n");
  const newLines = modified.split("\n");
  const lcs = computeLCS(oldLines, newLines);
  const diff: DiffLine[] = [];
  
  let oldIdx = 0, newIdx = 0, oldLineNum = 1, newLineNum = 1;
  
  for (const match of lcs) {
    while (oldIdx < match.oldIndex) {
      diff.push({ type: "removed", content: oldLines[oldIdx++], lineNumber: { old: oldLineNum++ } });
    }
    while (newIdx < match.newIndex) {
      diff.push({ type: "added", content: newLines[newIdx++], lineNumber: { new: newLineNum++ } });
    }
    diff.push({ type: "unchanged", content: oldLines[oldIdx++], lineNumber: { old: oldLineNum++, new: newLineNum++ } });
    newIdx++;
  }
  
  while (oldIdx < oldLines.length) {
    diff.push({ type: "removed", content: oldLines[oldIdx++], lineNumber: { old: oldLineNum++ } });
  }
  while (newIdx < newLines.length) {
    diff.push({ type: "added", content: newLines[newIdx++], lineNumber: { new: newLineNum++ } });
  }
  
  return diff;
}

function computeLCS(oldLines: string[], newLines: string[]): { oldIndex: number; newIndex: number }[] {
  const m = oldLines.length, n = newLines.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i-1] === newLines[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }
  
  const matches: { oldIndex: number; newIndex: number }[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (oldLines[i-1] === newLines[j-1]) {
      matches.unshift({ oldIndex: i-1, newIndex: j-1 });
      i--; j--;
    } else if (dp[i-1][j] > dp[i][j-1]) i--;
    else j--;
  }
  return matches;
}

// Preview mode component - shows rendered markdown with inline diff markers
function PreviewDiffView({ diffLines }: { diffLines: DiffLine[] }) {
  const { t } = useLocaleStore();
  // Group consecutive lines by type for better rendering
  const groups: { type: "unchanged" | "added" | "removed"; lines: string[] }[] = [];
  
  for (const line of diffLines) {
    const last = groups[groups.length - 1];
    if (last && last.type === line.type) {
      last.lines.push(line.content);
    } else {
      groups.push({ type: line.type, lines: [line.content] });
    }
  }
  
  // Safe markdown parsing
  const safeParseMarkdown = (content: string): string => {
    try {
      return parseMarkdown(content);
    } catch (e) {
      console.error("Markdown parse error:", e);
      return `<pre>${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
    }
  };
  
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none p-6">
      {groups.map((group, idx) => {
        const content = group.lines.join("\n");
        // Skip empty groups
        if (!content.trim()) {
          return <div key={idx} className="h-4" />;
        }
        
        const html = safeParseMarkdown(content);
        
        if (group.type === "unchanged") {
          return (
            <div key={idx} dangerouslySetInnerHTML={{ __html: html }} />
          );
        }
        
        if (group.type === "removed") {
          return (
            <div 
              key={idx}
              className="relative bg-[hsl(var(--diff-remove-bg)/0.15)] border-l-4 border-[hsl(var(--diff-remove-text)/0.5)] pl-4 py-2 my-2 rounded-r"
            >
              <span className="absolute left-0 top-0 text-xs bg-[hsl(var(--diff-remove-text))] text-white px-1.5 py-0.5 rounded-br">
                {t.ai.diffView.removedLabel}
              </span>
              <div 
                className="line-through opacity-60 text-[hsl(var(--diff-remove-text))] pt-4"
                dangerouslySetInnerHTML={{ __html: html }} 
              />
            </div>
          );
        }
        
        if (group.type === "added") {
          return (
            <div 
              key={idx}
              className="relative bg-[hsl(var(--diff-add-bg)/0.15)] border-l-4 border-[hsl(var(--diff-add-text)/0.5)] pl-4 py-2 my-2 rounded-r"
            >
              <span className="absolute left-0 top-0 text-xs bg-[hsl(var(--diff-add-text))] text-white px-1.5 py-0.5 rounded-br">
                {t.ai.diffView.addedLabel}
              </span>
              <div 
                className="text-[hsl(var(--diff-add-text))] pt-4"
                dangerouslySetInnerHTML={{ __html: html }} 
              />
            </div>
          );
        }
        
        return null;
      })}
    </div>
  );
}

// Source code diff view
function SourceDiffView({ diffLines }: { diffLines: DiffLine[] }) {
  return (
    <div className="font-mono text-sm">
      <table className="w-full border-collapse">
        <tbody>
          {diffLines.map((line, idx) => (
            <tr
              key={idx}
              className={cn(
                "border-b border-border/30",
                line.type === "added" && "bg-[hsl(var(--diff-add-bg)/0.15)]",
                line.type === "removed" && "bg-[hsl(var(--diff-remove-bg)/0.15)]"
              )}
            >
              <td className="w-12 px-2 py-0.5 text-right text-muted-foreground/50 select-none border-r border-border/30">
                {line.lineNumber.old || ""}
              </td>
              <td className="w-12 px-2 py-0.5 text-right text-muted-foreground/50 select-none border-r border-border/30">
                {line.lineNumber.new || ""}
              </td>
              <td className={cn(
                "w-6 px-1 text-center select-none",
                line.type === "added" && "text-[hsl(var(--diff-add-text))]",
                line.type === "removed" && "text-[hsl(var(--diff-remove-text))]"
              )}>
                {line.type === "added" && "+"}
                {line.type === "removed" && "-"}
              </td>
              <td className={cn(
                "px-2 py-0.5 whitespace-pre-wrap",
                line.type === "added" && "text-[hsl(var(--diff-add-text))]",
                line.type === "removed" && "text-[hsl(var(--diff-remove-text))] line-through opacity-60"
              )}>
                {line.content || " "}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DiffView({ 
  fileName, 
  original, 
  modified, 
  description,
  onAccept, 
  onReject 
}: DiffViewProps) {
  const { t } = useLocaleStore();
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview"); // Default to preview
  
  // Safety check for inputs
  const safeOriginal = original || "";
  const safeModified = modified || "";
  
  const diffLines = useMemo(() => {
    try {
      return computeDiff(safeOriginal, safeModified);
    } catch (e) {
      console.error("Diff computation error:", e);
      return [];
    }
  }, [safeOriginal, safeModified]);
  
  // If no diff lines, show a message
  if (diffLines.length === 0) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-yellow-500/10">
          <div className="flex items-center gap-3">
            <FileText size={16} className="text-yellow-600" />
            <span className="font-medium text-sm">{t.ai.diffView.title}</span>
            <span className="text-xs text-muted-foreground">{fileName}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onReject} className="px-3 py-1.5 text-sm rounded-md bg-muted hover:bg-red-500/20">
              <X size={14} className="inline mr-1" />
              {t.common.close}
            </button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>{t.ai.diffView.noDiff}</p>
        </div>
      </div>
    );
  }
  
  const stats = useMemo(() => {
    let added = 0, removed = 0;
    for (const line of diffLines) {
      if (line.type === "added") added++;
      if (line.type === "removed") removed++;
    }
    return { added, removed };
  }, [diffLines]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-yellow-500/10">
        <div className="flex items-center gap-3">
          <FileText size={16} className="text-yellow-600" />
          <span className="font-medium text-sm">{t.ai.diffView.title}</span>
          <span className="text-xs text-muted-foreground">{fileName}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-[hsl(var(--diff-add-bg)/0.3)] text-[hsl(var(--diff-add-text))]">+{stats.added}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-[hsl(var(--diff-remove-bg)/0.3)] text-[hsl(var(--diff-remove-text))]">-{stats.removed}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex bg-muted rounded-md p-0.5 mr-2">
            <button
              onClick={() => setViewMode("preview")}
              className={cn(
                "px-2 py-1 text-xs rounded transition-colors flex items-center gap-1",
                viewMode === "preview" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              title={t.ai.diffView.previewMode}
            >
              <Eye size={12} />
              {t.ai.diffView.preview}
            </button>
            <button
              onClick={() => setViewMode("source")}
              className={cn(
                "px-2 py-1 text-xs rounded transition-colors flex items-center gap-1",
                viewMode === "source" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              title={t.ai.diffView.sourceMode}
            >
              <Code size={12} />
              {t.ai.diffView.source}
            </button>
          </div>
          
          <button
            onClick={onReject}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-muted hover:bg-red-500/20 hover:text-red-600 transition-colors"
          >
            <X size={14} />
            {t.ai.diffView.reject}
          </button>
          <button
            onClick={onAccept}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Check size={14} />
            {t.ai.diffView.acceptChanges}
          </button>
        </div>
      </div>
      
      {/* Description */}
      {description && (
        <div className="px-4 py-2 border-b border-border bg-muted/30 text-sm text-muted-foreground">
          📝 {description}
        </div>
      )}
      
      {/* Diff content */}
      <div className="flex-1 overflow-auto">
        {viewMode === "preview" ? (
          <PreviewDiffView diffLines={diffLines} />
        ) : (
          <SourceDiffView diffLines={diffLines} />
        )}
      </div>
    </div>
  );
}
