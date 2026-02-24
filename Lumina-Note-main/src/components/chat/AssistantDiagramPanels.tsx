import { lazy, Suspense, useMemo } from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";

const InlineDiagramView = lazy(async () => {
  const mod = await import("../diagram/DiagramView");
  return { default: mod.DiagramView };
});

interface AssistantDiagramPanelsProps {
  filePaths: string[];
  className?: string;
}

export function AssistantDiagramPanels({ filePaths, className }: AssistantDiagramPanelsProps) {
  const { t } = useLocaleStore();

  const uniquePaths = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    filePaths.forEach((path) => {
      const key = path.replace(/\\/g, "/").toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(path);
    });
    return result;
  }, [filePaths]);

  if (uniquePaths.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        <Bot className="h-3 w-3" />
        <span>{t.diagramView.assistantLiveTitle}</span>
      </div>
      {uniquePaths.map((filePath) => (
        <div
          key={filePath}
          className="overflow-hidden rounded-ui-lg border border-border/60 bg-background/70"
        >
          <div className="h-[360px] min-h-[260px]">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  {t.diagramView.loadingEditor}
                </div>
              }
            >
              <InlineDiagramView
                filePath={filePath}
                className="h-full"
                saveMode="manual"
                showSendToChatButton={false}
                liveSync
                viewModeEnabled
              />
            </Suspense>
          </div>
        </div>
      ))}
    </div>
  );
}
