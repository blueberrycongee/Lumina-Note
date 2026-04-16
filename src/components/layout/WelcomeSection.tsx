import { useState, useMemo } from "react";
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
import { useUIStore } from "@/stores/useUIStore";
import type { FileEntry } from "@/lib/tauri";

const WELCOME_EMOJIS = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😆",
  "😅",
  "🤣",
  "😂",
  "🙂",
  "🙃",
  "😊",
  "😍",
  "🤩",
  "😘",
  "😗",
  "😋",
  "😜",
  "🤪",
  "😝",
  "🤑",
  "🤗",
  "🤭",
  "🤫",
  "🤔",
  "🤐",
  "🤨",
  "😐",
  "😑",
  "😶",
  "😏",
  "😒",
  "🙄",
  "😬",
  "😌",
  "😔",
  "😪",
  "🤤",
  "😴",
  "🥳",
  "🤠",
  "🧐",
  "🤓",
  "😎",
];

// ── Types ──

interface QuickAction {
  icon: React.ElementType;
  label: string;
  desc: string;
  mode: "chat" | "agent";
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
        mode: "chat",
        prompt: fill(p.polishText),
      };
    case "summarize":
      return {
        icon: ACTION_ICONS.summarize,
        label: t.ai.summarizeNote,
        desc: file.name,
        mode: "chat",
        prompt: fill(p.summarizeNote),
      };
    case "write":
      return {
        icon: ACTION_ICONS.write,
        label: t.ai.writeArticle,
        desc: file.name,
        mode: "agent",
        prompt: fill(p.writeArticle),
      };
    case "study":
      return {
        icon: ACTION_ICONS.study,
        label: t.ai.studyNotes,
        desc: file.name,
        mode: "agent",
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
      mode: "chat",
      prompt: p.polishTextGeneric,
    },
    {
      icon: GENERIC_ICONS.chat,
      label: t.ai.summarizeNote,
      desc: t.ai.summarizeNoteDesc,
      mode: "chat",
      prompt: p.summarizeNoteGeneric,
    },
    {
      icon: GENERIC_ICONS.write,
      label: t.ai.writeArticle,
      desc: t.ai.writeArticleDesc,
      mode: "agent",
      prompt: p.writeArticleGeneric,
    },
    {
      icon: GENERIC_ICONS.learn,
      label: t.ai.studyNotes,
      desc: t.ai.studyNotesDesc,
      mode: "agent",
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
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-background/50 hover:bg-accent/60 p-4 rounded-ui-lg cursor-pointer border border-border/50 transition-colors flex flex-col items-start gap-1 text-left"
    >
      <div className="p-2 bg-background rounded-lg text-muted-foreground mb-1">
        <Icon size={18} />
      </div>
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground truncate w-full">
        {desc}
      </span>
    </motion.button>
  );
}

interface WelcomeSectionProps {
  hasStarted: boolean;
  onSetInput: (value: string) => void;
  currentFile?: string | null;
  recentFiles?: string[];
  fileTree?: FileEntry[];
}

/** Welcome greeting shown before any conversation starts. */
export function WelcomeGreeting({ hasStarted }: { hasStarted: boolean }) {
  const { t } = useLocaleStore();

  const [welcomeEmoji] = useState(
    () => WELCOME_EMOJIS[Math.floor(Math.random() * WELCOME_EMOJIS.length)],
  );

  return (
    <AnimatePresence>
      {!hasStarted && (
        <motion.div
          className="text-center mb-8 space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: -20,
            scale: 0.9,
            transition: { duration: 0.3 },
          }}
        >
          <div className="w-20 h-20 bg-background rounded-full mx-auto shadow-sm border border-border flex items-center justify-center">
            <span className="text-4xl">{welcomeEmoji}</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
            {t.ai.welcomeTitle}
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
  const setChatMode = useUIStore((s) => s.setChatMode);

  // Memoize with a stable key that changes when workspace context changes
  // (current file, recent files count, file tree length)
  const actions = useMemo(
    () => recommendActions(fileTree, recentFiles, currentFile ?? null, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentFile, recentFiles.length, fileTree.length, t],
  );

  const handleQuickAction = (action: QuickAction) => {
    setChatMode(action.mode);
    onSetInput(action.prompt);
  };

  return (
    <AnimatePresence>
      {!hasStarted && (
        <motion.div
          className="w-full max-w-3xl mx-auto px-4 mt-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
          exit={{
            opacity: 0,
            y: 50,
            pointerEvents: "none",
            transition: { duration: 0.2 },
          }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
      <WelcomeGreeting hasStarted={hasStarted} />
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
