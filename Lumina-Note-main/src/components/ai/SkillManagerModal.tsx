import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, RefreshCcw, X } from "lucide-react";
import { listAgentSkills } from "@/lib/tauri";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
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
    [t]
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[560px] max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden border border-border bg-background/95 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/60">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles size={16} />
            <span>{t.ai.skillsManagerTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadSkills}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors flex items-center gap-1"
              disabled={loading}
            >
              <RefreshCcw size={12} className={loading ? "animate-spin" : ""} />
              {loading ? t.ai.skillsManagerLoading : t.ai.skillsManagerRefresh}
            </button>
            <button
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors flex items-center gap-1"
            >
              <X size={12} />
              {t.ai.skillsManagerClose}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div className="text-xs text-muted-foreground">{t.ai.skillsManagerDesc}</div>

          {error && (
            <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-2">
              {error}
            </div>
          )}

          {!loading && skills.length === 0 && !error && (
            <div className="text-xs text-muted-foreground text-center py-6">
              {t.ai.skillsManagerEmpty}
            </div>
          )}

          {SOURCE_ORDER.map((source) => {
            const items = grouped[source];
            if (!items || items.length === 0) return null;
            return (
              <div key={source} className="space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-foreground">
                  <span>{sourceLabels[source as keyof typeof sourceLabels] ?? source}</span>
                  <span className="text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((skill) => (
                    <div
                      key={`${skill.source ?? "skill"}:${skill.name}`}
                      className="border border-border rounded-lg p-3 bg-background/60"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-foreground">{skill.title}</div>
                        <div className="text-[10px] text-muted-foreground">{skill.name}</div>
                      </div>
                      {skill.description && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {skill.description}
                        </div>
                      )}
                      {skill.tags && skill.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {skill.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground"
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
      </div>
    </div>
  );
}
