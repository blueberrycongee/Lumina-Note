import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Pencil,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  classifySkill,
  deleteSkill,
  listOpencodeSkills,
  writeSkill,
  type ClassifiedSkill,
  type OpencodeSkillInfo,
  type SkillSource,
} from "@/services/opencode/skills";
import { reportOperationError } from "@/lib/reportError";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import {
  Dialog,
  DialogBody,
  DialogHeader,
  Field,
  SectionHeader,
  TextInput,
} from "@/components/ui";

interface SkillManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type View =
  | { kind: "list" }
  | { kind: "editor"; mode: "create" }
  | { kind: "editor"; mode: "edit"; original: ClassifiedSkill };

const SOURCE_ORDER: SkillSource[] = ["vault", "builtin", "external"];

export function SkillManagerModal({ isOpen, onClose }: SkillManagerModalProps) {
  const { t } = useLocaleStore();
  const { vaultPath } = useFileStore();
  const tSk = (t.ai as Record<string, unknown>).skillsManager as
    | SkillsManagerStrings
    | undefined;

  const [skills, setSkills] = useState<ClassifiedSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await listOpencodeSkills();
      const classified = raw
        .map((s: OpencodeSkillInfo) => classifySkill(s, vaultPath))
        .sort((a, b) => {
          // Group by source first (vault → builtin → external), then by name.
          const sa = SOURCE_ORDER.indexOf(a.source);
          const sb = SOURCE_ORDER.indexOf(b.source);
          if (sa !== sb) return sa - sb;
          return a.name.localeCompare(b.name);
        });
      setSkills(classified);
    } catch (err) {
      reportOperationError({
        source: "SkillManagerModal.refresh",
        action: "List skills",
        error: err,
        level: "warning",
      });
      setError(tSk?.error ?? "Failed to load skills");
    } finally {
      setLoading(false);
    }
  }, [vaultPath, tSk]);

  useEffect(() => {
    if (isOpen) {
      void refresh();
      setView({ kind: "list" });
    }
  }, [isOpen, refresh]);

  const grouped = useMemo(() => {
    const map = new Map<SkillSource, ClassifiedSkill[]>();
    for (const skill of skills) {
      const list = map.get(skill.source) ?? [];
      list.push(skill);
      map.set(skill.source, list);
    }
    return map;
  }, [skills]);

  const sourceLabel = (source: SkillSource): string => {
    if (source === "vault") return tSk?.sourceVault ?? "In your vault";
    if (source === "builtin") return tSk?.sourceBuiltin ?? "Built-in";
    return tSk?.sourceExternal ?? "External";
  };

  const handleDelete = useCallback(
    async (skill: ClassifiedSkill) => {
      if (!vaultPath) return;
      const confirmed = window.confirm(
        (tSk?.deleteConfirm ?? "Delete the skill '{name}'?").replace(
          "{name}",
          skill.name,
        ),
      );
      if (!confirmed) return;
      try {
        await deleteSkill({ vaultPath, name: skill.name });
        await refresh();
      } catch (err) {
        reportOperationError({
          source: "SkillManagerModal.handleDelete",
          action: "Delete skill",
          error: err,
          level: "warning",
          context: { name: skill.name },
        });
        setError(String(err));
      }
    },
    [vaultPath, tSk, refresh],
  );

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()} width={600}>
      <DialogHeader
        title={
          <span className="flex items-center gap-2">
            {view.kind === "editor" ? (
              <button
                onClick={() => setView({ kind: "list" })}
                className="rounded-ui-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-fast ease-out-subtle"
                aria-label={tSk?.backToList ?? "Back"}
              >
                <ArrowLeft size={14} />
              </button>
            ) : (
              <Sparkles size={16} className="text-muted-foreground" />
            )}
            {view.kind === "editor"
              ? view.mode === "create"
                ? (tSk?.editorTitleNew ?? "New skill")
                : `${tSk?.editorTitleEdit ?? "Edit skill"} · ${view.original.name}`
              : (tSk?.title ?? "Skills")}
          </span>
        }
        description={view.kind === "list" ? tSk?.desc : undefined}
        badge={
          view.kind === "list" ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => void refresh()}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-ui-sm px-2 h-7 text-xs text-muted-foreground transition-colors duration-fast ease-out-subtle hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover disabled:opacity-50"
                title={tSk?.refresh ?? "Refresh"}
              >
                <RefreshCcw size={12} className={loading ? "animate-spin" : ""} />
                {loading ? (tSk?.loading ?? "Loading…") : (tSk?.refresh ?? "Refresh")}
              </button>
              <button
                onClick={() => setView({ kind: "editor", mode: "create" })}
                disabled={!vaultPath}
                title={!vaultPath ? (tSk?.noVaultOpen ?? "Open a vault first") : undefined}
                className="flex items-center gap-1.5 rounded-ui-md border border-border bg-background px-2.5 h-7 text-xs text-foreground transition-colors duration-fast ease-out-subtle hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={12} />
                {tSk?.new ?? "New"}
              </button>
            </div>
          ) : null
        }
      />
      <DialogBody>
        {view.kind === "list" ? (
          <SkillsList
            grouped={grouped}
            sourceLabel={sourceLabel}
            sourceOrder={SOURCE_ORDER}
            loading={loading}
            error={error}
            tSk={tSk}
            vaultPath={vaultPath}
            onEdit={(skill) => setView({ kind: "editor", mode: "edit", original: skill })}
            onDelete={handleDelete}
          />
        ) : (
          <SkillEditor
            mode={view.mode}
            original={view.mode === "edit" ? view.original : undefined}
            existingNames={new Set(skills.map((s) => s.name))}
            vaultPath={vaultPath}
            tSk={tSk}
            onCancel={() => setView({ kind: "list" })}
            onSaved={async () => {
              await refresh();
              setView({ kind: "list" });
            }}
          />
        )}
      </DialogBody>
    </Dialog>
  );
}

type SkillsManagerStrings = {
  title: string;
  desc: string;
  refresh: string;
  loading: string;
  empty: string;
  error: string;
  sourceVault: string;
  sourceBuiltin: string;
  sourceExternal: string;
  new: string;
  edit: string;
  delete: string;
  deleteConfirm: string;
  backToList: string;
  editorTitleNew: string;
  editorTitleEdit: string;
  nameLabel: string;
  nameHint: string;
  descriptionLabel: string;
  descriptionHint: string;
  bodyLabel: string;
  bodyHint: string;
  saveButton: string;
  cancelButton: string;
  nameInvalid: string;
  descriptionRequired: string;
  bodyRequired: string;
  nameDuplicate: string;
  savingError: string;
  noVaultOpen: string;
};

interface SkillsListProps {
  grouped: Map<SkillSource, ClassifiedSkill[]>;
  sourceLabel: (s: SkillSource) => string;
  sourceOrder: SkillSource[];
  loading: boolean;
  error: string | null;
  tSk: SkillsManagerStrings | undefined;
  vaultPath: string | null;
  onEdit: (skill: ClassifiedSkill) => void;
  onDelete: (skill: ClassifiedSkill) => void;
}

function SkillsList({
  grouped,
  sourceLabel,
  sourceOrder,
  loading,
  error,
  tSk,
  vaultPath,
  onEdit,
  onDelete,
}: SkillsListProps) {
  const totalCount = Array.from(grouped.values()).reduce(
    (sum, list) => sum + list.length,
    0,
  );

  return (
    <>
      {error && (
        <div className="mb-4 rounded-ui-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {!vaultPath && (
        <div className="mb-4 rounded-ui-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          {tSk?.noVaultOpen ??
            "Open a vault to create or edit skills."}
        </div>
      )}
      {!loading && totalCount === 0 && !error && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {tSk?.empty ?? "No skills yet."}
        </div>
      )}
      <div className="space-y-6">
        {sourceOrder.map((source) => {
          const items = grouped.get(source);
          if (!items || items.length === 0) return null;
          return (
            <div key={source} className="space-y-2">
              <SectionHeader
                title={sourceLabel(source)}
                action={
                  <span className="text-xs text-muted-foreground">
                    {items.length}
                  </span>
                }
              />
              <div className="space-y-2">
                {items.map((skill) => (
                  <div
                    key={`${skill.source}:${skill.name}`}
                    className="group rounded-ui-md border border-border bg-muted/30 p-3 transition-colors duration-fast ease-out-subtle hover:border-border hover:bg-muted/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {skill.name}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {skill.description}
                        </p>
                      </div>
                      {skill.editable && (
                        <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-fast ease-out-subtle">
                          <button
                            onClick={() => onEdit(skill)}
                            className="rounded-ui-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-fast ease-out-subtle"
                            title={tSk?.edit ?? "Edit"}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => onDelete(skill)}
                            className="rounded-ui-sm p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-fast ease-out-subtle"
                            title={tSk?.delete ?? "Delete"}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground/70">
                      {skill.location}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

interface SkillEditorProps {
  mode: "create" | "edit";
  original?: ClassifiedSkill;
  existingNames: Set<string>;
  vaultPath: string | null;
  tSk: SkillsListProps["tSk"];
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const NEW_BODY_TEMPLATE = `# Use this skill when…

Describe the trigger condition here — when should the agent invoke this skill?

# Steps

1. First step
2. Second step

# Don't

- Pitfalls to avoid
`;

function SkillEditor({
  mode,
  original,
  existingNames,
  vaultPath,
  tSk,
  onCancel,
  onSaved,
}: SkillEditorProps) {
  const [name, setName] = useState(original?.name ?? "");
  const [description, setDescription] = useState(original?.description ?? "");
  const [body, setBody] = useState(
    original ? extractBodyFromContent(original.content) : NEW_BODY_TEMPLATE,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback((): string | null => {
    if (!NAME_RE.test(name)) {
      return tSk?.nameInvalid ??
        "Name must be lowercase a-z, digits and hyphens (1–64 chars).";
    }
    if (
      mode === "create" &&
      (existingNames.has(name) ||
        Array.from(existingNames).some(
          (n) => n.toLowerCase() === name.toLowerCase(),
        ))
    ) {
      return tSk?.nameDuplicate ??
        "A skill with this name already exists.";
    }
    if (description.trim().length === 0) {
      return tSk?.descriptionRequired ??
        "Description is required.";
    }
    if (body.trim().length === 0) {
      return tSk?.bodyRequired ??
        "Body is required.";
    }
    return null;
  }, [name, description, body, existingNames, mode, tSk]);

  const handleSave = useCallback(async () => {
    if (!vaultPath) return;
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await writeSkill({
        vaultPath,
        name,
        frontmatter: {
          name,
          description: description.trim(),
        },
        body,
      });
      await onSaved();
    } catch (e) {
      setError(
        tSk?.savingError ??
          `Failed to save: ${e instanceof Error ? e.message : String(e)}`,
      );
      reportOperationError({
        source: "SkillEditor.handleSave",
        action: "Write skill",
        error: e,
        level: "warning",
        context: { name },
      });
    } finally {
      setSaving(false);
    }
  }, [vaultPath, name, description, body, validate, onSaved, tSk]);

  // Save on cmd/ctrl+enter for keyboard-first flow.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-ui-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <Field
        label={tSk?.nameLabel ?? "Name"}
        hint={
          tSk?.nameHint ??
          "Lowercase, hyphens only. Used as the skill id."
        }
      >
        {(id) => (
          <TextInput
            id={id}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.trim().toLowerCase())}
            disabled={mode === "edit"}
            placeholder="my-skill"
            invalid={name.length > 0 && !NAME_RE.test(name)}
            autoFocus={mode === "create"}
          />
        )}
      </Field>

      <Field
        label={
          tSk?.descriptionLabel ??
          "Description"
        }
        hint={
          tSk?.descriptionHint ??
          "One sentence the agent reads to decide whether to invoke this skill. Make it specific."
        }
      >
        {(id) => (
          <textarea
            id={id}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Summarize the user's note in 3 bullets."
            className="w-full rounded-ui-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/60 transition-colors duration-fast ease-out-subtle resize-y min-h-[64px]"
          />
        )}
      </Field>

      <Field
        label={tSk?.bodyLabel ?? "Body"}
        hint={
          tSk?.bodyHint ??
          "Markdown playbook the agent loads when invoking this skill. Cover triggers, steps, and pitfalls."
        }
      >
        {(id) => (
          <textarea
            id={id}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            spellCheck={false}
            className="w-full rounded-ui-md border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/60 transition-colors duration-fast ease-out-subtle resize-y min-h-[280px]"
          />
        )}
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-ui-md border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors duration-fast ease-out-subtle hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
        >
          {tSk?.cancelButton ?? "Cancel"}
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving || !vaultPath}
          className="rounded-ui-md border border-primary bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors duration-fast ease-out-subtle hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
        >
          {saving
            ? "…"
            : (tSk?.saveButton ?? "Save")}
        </button>
      </div>
    </div>
  );
}

/**
 * Opencode's `content` field comes back already stripped of frontmatter
 * (see opencode/src/skill/index.ts:add → md.content). So we use it as-is
 * for the body editor. This helper exists as a single point of change in
 * case the contract changes.
 */
function extractBodyFromContent(content: string): string {
  return content;
}
