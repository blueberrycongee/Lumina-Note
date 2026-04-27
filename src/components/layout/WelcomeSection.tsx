import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  FileText,
  Zap,
  Bot,
  Lightbulb,
  MessageSquare,
  PenLine,
  BookOpen,
} from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import type { FileEntry } from "@/lib/host";

// Emoji array removed — the welcome screen now uses a clean text-only
// greeting without the random emoji avatar disc.

// ── Types ──

interface QuickAction {
  icon: React.ElementType;
  label: string;
  desc: string;
  prompt: string;
}

type ActionType = "polish" | "summarize" | "write" | "study";

interface ScoredFile {
  path: string;
  name: string;
  recencyScore: number;
  freshnessScore: number;
}

// ── Recommendation Engine ──

function extractName(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() ?? "";
  return name.replace(/\.md$/, "") || name;
}

function collectFiles(
  fileTree: FileEntry[],
): { path: string; modified_at?: number | null }[] {
  const result: { path: string; modified_at?: number | null }[] = [];
  const walk = (entries: FileEntry[]) => {
    for (const entry of entries) {
      if (!entry.is_dir && entry.name.endsWith(".md")) {
        result.push({ path: entry.path, modified_at: entry.modified_at });
      }
      if (entry.children) walk(entry.children);
    }
  };
  walk(fileTree);
  return result;
}

function scoreFiles(
  fileTree: FileEntry[],
  recentFiles: string[],
  currentFile: string | null,
): ScoredFile[] {
  const treeFiles = collectFiles(fileTree);
  const recentSet = new Map(recentFiles.map((path, i) => [path, i]));
  const now = Date.now();

  const scored: ScoredFile[] = treeFiles.map((f) => {
    const recentIdx = recentSet.get(f.path);
    // Recency: higher score for more recently accessed files (0-1)
    const recencyScore =
      recentIdx !== undefined
        ? 1 - recentIdx / Math.max(recentFiles.length, 1)
        : 0;
    // Freshness: higher score for recently modified files (exponential decay over 7 days)
    const age = f.modified_at ? now - f.modified_at : Infinity;
    const freshnessScore =
      age === Infinity ? 0 : Math.exp(-age / (7 * 24 * 60 * 60 * 1000));

    return {
      path: f.path,
      name: extractName(f.path),
      recencyScore,
      freshnessScore,
    };
  });

  // Exclude current file (user already sees it), sort by combined score
  return scored
    .filter((f) => f.path !== currentFile)
    .sort((a, b) => {
      const scoreA = a.recencyScore * 0.6 + a.freshnessScore * 0.4;
      const scoreB = b.recencyScore * 0.6 + b.freshnessScore * 0.4;
      return scoreB - scoreA;
    });
}

/** Pick top N files with slight randomness to keep recommendations fresh. */
function pickDiverseFiles(ranked: ScoredFile[], count: number): ScoredFile[] {
  // Take top candidates (2x what we need), then shuffle and pick
  const pool = ranked.slice(0, Math.max(count * 2, 6));
  // Fisher-Yates partial shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

const ACTION_TYPES: ActionType[] = ["polish", "summarize", "write", "study"];

const ACTION_ICONS: Record<ActionType, React.ElementType> = {
  polish: Sparkles,
  summarize: FileText,
  write: Zap,
  study: Bot,
};

const GENERIC_ICONS: Record<string, React.ElementType> = {
  brainstorm: Lightbulb,
  chat: MessageSquare,
  write: PenLine,
  learn: BookOpen,
};

type Translations = ReturnType<typeof useLocaleStore.getState>["t"];

function buildFileAction(
  type: ActionType,
  file: ScoredFile,
  t: Translations,
): QuickAction {
  const p = t.ai.quickPrompts;
  const fill = (tpl: string) => tpl.replace("{noteName}", file.name);
  switch (type) {
    case "polish":
      return {
        icon: ACTION_ICONS.polish,
        label: t.ai.polishText,
        desc: file.name,

        prompt: fill(p.polishText),
      };
    case "summarize":
      return {
        icon: ACTION_ICONS.summarize,
        label: t.ai.summarizeNote,
        desc: file.name,

        prompt: fill(p.summarizeNote),
      };
    case "write":
      return {
        icon: ACTION_ICONS.write,
        label: t.ai.writeArticle,
        desc: file.name,

        prompt: fill(p.writeArticle),
      };
    case "study":
      return {
        icon: ACTION_ICONS.study,
        label: t.ai.studyNotes,
        desc: file.name,

        prompt: fill(p.studyNotes),
      };
  }
}

function buildGenericActions(t: Translations): QuickAction[] {
  const p = t.ai.quickPrompts;
  return [
    {
      icon: GENERIC_ICONS.brainstorm,
      label: t.ai.polishText,
      desc: t.ai.polishTextDesc,
      prompt: p.polishTextGeneric,
    },
    {
      icon: GENERIC_ICONS.chat,
      label: t.ai.summarizeNote,
      desc: t.ai.summarizeNoteDesc,
      prompt: p.summarizeNoteGeneric,
    },
    {
      icon: GENERIC_ICONS.write,
      label: t.ai.writeArticle,
      desc: t.ai.writeArticleDesc,
      prompt: p.writeArticleGeneric,
    },
    {
      icon: GENERIC_ICONS.learn,
      label: t.ai.studyNotes,
      desc: t.ai.studyNotesDesc,
      prompt: p.studyNotesGeneric,
    },
  ];
}

function buildCurrentFileAction(
  currentFile: string | null,
  t: Translations,
): QuickAction | null {
  if (!currentFile) return null;
  const name = extractName(currentFile);
  // Randomly pick one action type for the current file
  const type = ACTION_TYPES[Math.floor(Math.random() * ACTION_TYPES.length)];
  return buildFileAction(
    type,
    { path: currentFile, name, recencyScore: 1, freshnessScore: 1 },
    t,
  );
}

function recommendActions(
  fileTree: FileEntry[],
  recentFiles: string[],
  currentFile: string | null,
  t: Translations,
): QuickAction[] {
  const ranked = scoreFiles(fileTree, recentFiles, currentFile);

  // No files at all → all generic
  if (ranked.length === 0 && !currentFile) {
    return buildGenericActions(t);
  }

  const actions: QuickAction[] = [];
  const usedTypes = new Set<ActionType>();

  // Slot 1: current file gets a dedicated action
  const currentAction = buildCurrentFileAction(currentFile, t);
  if (currentAction) {
    actions.push(currentAction);
    // Find which type was used
    const idx = ACTION_TYPES.findIndex((type) => {
      const icons = ACTION_ICONS[type];
      return currentAction.icon === icons;
    });
    if (idx >= 0) usedTypes.add(ACTION_TYPES[idx]);
  }

  // Remaining slots: pick diverse files with different action types
  const remaining = 4 - actions.length;
  const pickedFiles = pickDiverseFiles(ranked, remaining);
  const availableTypes = ACTION_TYPES.filter((t) => !usedTypes.has(t));

  for (let i = 0; i < remaining; i++) {
    if (i < pickedFiles.length && availableTypes.length > 0) {
      const type = availableTypes.shift()!;
      actions.push(buildFileAction(type, pickedFiles[i], t));
    } else {
      // Fill remaining with generic actions
      const generics = buildGenericActions(t);
      const unused = generics.filter(
        (g) => !actions.some((a) => a.prompt === g.prompt),
      );
      if (unused.length > 0) actions.push(unused[0]);
    }
  }

  return actions.slice(0, 4);
}

// ── Components ──

function SuggestionCard({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative flex flex-col items-start gap-2 text-left",
        "rounded-ui-lg border border-border bg-popover p-4",
        "transition-[background-color,border-color,box-shadow,transform] duration-fast ease-out-subtle",
        "hover:border-primary/35 hover:bg-accent/60 hover:shadow-elev-1",
        "active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-9 w-9 items-center justify-center rounded-ui-md",
          "bg-primary/10 text-primary",
          "transition-colors duration-fast ease-out-subtle",
          "group-hover:bg-primary/15",
        ].join(" ")}
      >
        <Icon size={18} />
      </div>
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="truncate w-full text-xs text-muted-foreground">
        {desc}
      </span>
    </button>
  );
}

interface WelcomeSectionProps {
  hasStarted: boolean;
  onSetInput: (value: string) => void;
  currentFile?: string | null;
  recentFiles?: string[];
  fileTree?: FileEntry[];
}

// Time-of-day bucketing — fully client-side, uses the renderer's local clock
// so it respects the user's OS timezone without any server roundtrip.
function getTimeBucket(hour: number): "morning" | "afternoon" | "evening" | "night" {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWelcomeGreeting(
  t: Translations,
  currentFile: string | null | undefined,
  fileTreeLength: number,
): string {
  const w = t.ai;
  const hour = new Date().getHours();
  const bucket = getTimeBucket(hour);
  const timePool: string[] =
    bucket === "morning"
      ? w.welcomeMorning
      : bucket === "afternoon"
        ? w.welcomeAfternoon
        : bucket === "evening"
          ? w.welcomeEvening
          : w.welcomeNight;

  // Context-aware variants get a 50% chance when applicable, else fall through
  // to the time-of-day pool. Keeps the rotation interesting without making the
  // greeting feel scripted.
  if (currentFile) {
    if (Math.random() < 0.5) {
      const template = pickRandom(w.welcomeCurrentFile);
      return template.replace("{name}", extractName(currentFile));
    }
    return pickRandom(timePool);
  }
  if (fileTreeLength === 0) {
    if (Math.random() < 0.5) {
      return pickRandom(w.welcomeEmptyVault);
    }
    return pickRandom(timePool);
  }
  return pickRandom(timePool);
}

/** Welcome greeting shown before any conversation starts. */
export function WelcomeGreeting({
  hasStarted,
  currentFile,
  fileTree = [],
}: {
  hasStarted: boolean;
  currentFile?: string | null;
  fileTree?: FileEntry[];
}) {
  const { t } = useLocaleStore();
  // Pick once per mount. The component remounts when a new conversation
  // starts (hasStarted flips false → true → false on session new), so each
  // fresh session sees a new greeting; sitting on the same screen does not
  // shuffle the text.
  const greeting = useMemo(
    () => pickWelcomeGreeting(t, currentFile ?? null, fileTree.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, currentFile, fileTree.length],
  );

  return (
    <AnimatePresence>
      {!hasStarted && (
        <motion.div
          className="relative z-10 text-center mt-8 sm:mt-12 md:mt-16 mb-6 sm:mb-8 space-y-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { duration: 0.28, ease: [0.2, 0.9, 0.1, 1] },
          }}
          exit={{
            opacity: 0,
            y: -8,
            scale: 0.98,
            transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] },
          }}
        >
          {/* Greeting wraps gracefully on narrow viewports instead of
           * truncating with an ellipsis. Wider viewports still get a
           * single-line read because the max-w gives the longest English
           * variants room before the wrap kicks in. */}
          <h1 className="mx-auto max-w-[640px] px-4 text-balance text-2xl sm:text-3xl font-semibold leading-tight tracking-tight text-foreground">
            {greeting}
          </h1>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Quick-action suggestion cards with workspace-aware recommendations. */
export function WelcomeSuggestions({
  hasStarted,
  onSetInput,
  currentFile,
  recentFiles = [],
  fileTree = [],
}: WelcomeSectionProps) {
  const { t } = useLocaleStore();

  // Memoize with a stable key that changes when workspace context changes
  // (current file, recent files count, file tree length)
  const actions = useMemo(
    () => recommendActions(fileTree, recentFiles, currentFile ?? null, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentFile, recentFiles.length, fileTree.length, t],
  );

  const handleQuickAction = (action: QuickAction) => {
    onSetInput(action.prompt);
  };

  return (
    <AnimatePresence>
      {!hasStarted && (
        <motion.div
          className="relative z-10 w-full max-w-3xl mx-auto px-4 mt-8 sm:mt-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: {
              delay: 0.1,
              duration: 0.28,
              ease: [0.2, 0.9, 0.1, 1],
            },
          }}
          exit={{
            opacity: 0,
            y: 12,
            scale: 0.98,
            pointerEvents: "none",
            transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] },
          }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
            {actions.map((action, idx) => (
              <SuggestionCard
                key={idx}
                icon={action.icon}
                title={action.label}
                desc={action.desc}
                onClick={() => handleQuickAction(action)}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Combined component (for backward compat). */
export function WelcomeSection({
  hasStarted,
  onSetInput,
  currentFile,
  recentFiles,
  fileTree,
}: WelcomeSectionProps) {
  return (
    <>
      <WelcomeGreeting
        hasStarted={hasStarted}
        currentFile={currentFile}
        fileTree={fileTree}
      />
      <WelcomeSuggestions
        hasStarted={hasStarted}
        onSetInput={onSetInput}
        currentFile={currentFile}
        recentFiles={recentFiles}
        fileTree={fileTree}
      />
    </>
  );
}
