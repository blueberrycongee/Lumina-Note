import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, RefreshCcw } from "lucide-react";
import { listAgentSkills } from "@/lib/host";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import {
  Dialog,
  DialogBody,
  DialogHeader,
  SectionHeader,
} from "@/components/ui";
import type { SkillInfo } from "@/types/skills";

interface SkillManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SOURCE_ORDER = ["workspace", "user", "builtin", "unknown"];

export function SkillManagerModal({ isOpen, onClose }: SkillManagerModalProps) {
  const { t } = useLocaleStore();
  const { vaultPath } = useFileStore();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceLabels = useMemo(
    () => ({
      workspace: t.ai.skillsManagerSourceWorkspace,
      user: t.ai.skillsManagerSourceUser,
      builtin: t.ai.skillsManagerSourceBuiltin,
      unknown: t.ai.skillsManagerSourceUnknown,
    }),
    [t],
  );

  const grouped = useMemo(() => {
    const groups: Record<string, SkillInfo[]> = {};
    for (const skill of skills) {
      const key = skill.source || "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(skill);
    }
    return groups;
  }, [skills]);

  const loadSkills = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const items = await listAgentSkills(vaultPath || undefined);
      setSkills(items);
    } catch (err) {
      console.warn("[Skills] Failed to load skills:", err);
      setError(t.ai.skillsManagerError);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [isOpen, vaultPath, t]);

  useEffect(() => {
    if (isOpen) {
      loadSkills();
    }
  }, [isOpen, loadSkills]);

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()} width={560}>
      <DialogHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles size={16} className="text-muted-foreground" />
            {t.ai.skillsManagerTitle}
          </span>
        }
        description={t.ai.skillsManagerDesc}
        badge={
          <button
            onClick={loadSkills}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-ui-sm px-2 h-7 text-xs text-muted-foreground transition-colors duration-fast ease-out-subtle hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover disabled:opacity-50"
            title={t.ai.skillsManagerRefresh}
          >
            <RefreshCcw size={12} className={loading ? "animate-spin" : ""} />
            {loading ? t.ai.skillsManagerLoading : t.ai.skillsManagerRefresh}
          </button>
        }
      />
      <DialogBody>
        {error && (
          <div className="mb-4 rounded-ui-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {!loading && skills.length === 0 && !error && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {t.ai.skillsManagerEmpty}
          </div>
        )}

        <div className="space-y-6">
          {SOURCE_ORDER.map((source) => {
            const items = grouped[source];
            if (!items || items.length === 0) return null;
            return (
              <div key={source} className="space-y-2">
                <SectionHeader
                  title={
                    sourceLabels[source as keyof typeof sourceLabels] ?? source
                  }
                  action={
                    <span className="text-xs text-muted-foreground">
                      {items.length}
                    </span>
                  }
                />
                <div className="space-y-2">
                  {items.map((skill) => (
                    <div
                      key={`${skill.source ?? "skill"}:${skill.name}`}
                      className="rounded-ui-md border border-border bg-muted/30 p-3 transition-colors duration-fast ease-out-subtle hover:border-border hover:bg-muted/60"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-sm font-medium text-foreground">
                          {skill.title}
                        </div>
                        <code className="shrink-0 font-mono text-xs text-muted-foreground">
                          {skill.name}
                        </code>
                      </div>
                      {skill.description && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {skill.description}
                        </p>
                      )}
                      {skill.tags && skill.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {skill.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-ui-sm border border-border/60 bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogBody>
    </Dialog>
  );
}
