import { useVaultStore, type LintReport } from "@/stores/useVaultStore";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";

function HealthBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: "default" | "warning" | "error";
}) {
  const textColor =
    variant === "error"
      ? "text-red-500"
      : variant === "warning"
        ? "text-yellow-500"
        : "text-foreground";
  return (
    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/50 border border-border/50">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold ${textColor}`}>{value}</span>
    </div>
  );
}

function IssueList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        {title}
      </h3>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li
            key={i}
            className="text-sm px-2 py-1 rounded bg-muted/30 text-foreground"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BrokenLinkList({ report }: { report: LintReport }) {
  if (report.broken_links.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        Broken Links
      </h3>
      <ul className="space-y-1">
        {report.broken_links.map((link, i) => (
          <li
            key={i}
            className="text-sm px-2 py-1 rounded bg-red-500/10 text-red-400"
          >
            <span className="font-mono">{link.from_page}</span>
            {" → "}
            <span className="font-mono">{link.target}</span>
            <span className="text-muted-foreground ml-1">
              ([[{link.link_text}]])
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LintDashboard() {
  const vaultPath = useFileStore((s) => s.vaultPath);
  const { lintReport, isLinting, runLint } = useVaultStore();

  const handleRunLint = () => {
    if (vaultPath) {
      runLint(vaultPath);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Wiki Health</h2>
          <button
            onClick={handleRunLint}
            disabled={isLinting || !vaultPath}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isLinting ? "Linting..." : "Run Lint"}
          </button>
        </div>

        {lintReport ? (
          <>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">
                  Overall Health
                </span>
                <span className="text-sm font-medium">
                  {Math.round(lintReport.overall_health * 100)}%
                </span>
              </div>
              <HealthBar value={lintReport.overall_health} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Pages Checked" value={lintReport.checked_pages} />
              <StatCard
                label="Broken Links"
                value={lintReport.broken_links.length}
                variant={
                  lintReport.broken_links.length > 0 ? "error" : "default"
                }
              />
              <StatCard
                label="Orphaned Pages"
                value={lintReport.orphaned_pages.length}
                variant={
                  lintReport.orphaned_pages.length > 0 ? "warning" : "default"
                }
              />
              <StatCard
                label="Stale Pages"
                value={lintReport.stale_pages.length}
                variant={
                  lintReport.stale_pages.length > 0 ? "warning" : "default"
                }
              />
            </div>

            <BrokenLinkList report={lintReport} />
            <IssueList title="Orphaned Pages" items={lintReport.orphaned_pages} />
            <IssueList title="Stale Pages" items={lintReport.stale_pages} />
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Run lint to check wiki health
          </div>
        )}
      </div>
    </div>
  );
}
