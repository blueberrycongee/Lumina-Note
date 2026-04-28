import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight,
  ChevronRight,
  Image as ImageIcon,
  Network,
  PenLine,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useFileStore } from "@/stores/useFileStore";
import type { FileEntry } from "@/lib/host";

// ── Helpers ──

function extractName(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() ?? "";
  return name.replace(/\.md$/, "") || name;
}

type Translations = ReturnType<typeof useLocaleStore.getState>["t"];

interface WelcomeSectionProps {
  hasStarted: boolean;
  onSetInput: (value: string) => void;
  currentFile?: string | null;
  recentFiles?: string[];
  fileTree?: FileEntry[];
}

// ── Greeting ──

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
  const greeting = useMemo(
    () => pickWelcomeGreeting(t, currentFile ?? null, fileTree.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, currentFile, fileTree.length],
  );

  return (
    <AnimatePresence>
      {!hasStarted && (
        <motion.div
          className="relative text-center mt-8 sm:mt-12 md:mt-16 mb-6 sm:mb-8 space-y-3"
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
          <h1 className="mx-auto max-w-[640px] px-4 text-balance text-2xl sm:text-3xl font-semibold leading-tight tracking-tight text-foreground">
            {greeting}
          </h1>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Starters: a single quiet list that replaces the old 4-card grid +
// 3-pill explore row. Mixes AI prompts (fill input) and navigation. Each
// row is a clickable line with a left icon + label + optional dim
// context fragment + trailing arrow that surfaces on hover.

type StarterVariant = "ai" | "nav";

interface Starter {
  id: string;
  icon: LucideIcon;
  label: string;
  /** Optional dim context that lives on the right of the label — e.g. the
   *  filename for "Help with this note · finals-prep.md". */
  context?: string;
  variant: StarterVariant;
  onClick: () => void;
}

interface BuildStartersInput {
  t: Translations;
  hasFiles: boolean;
  currentFile: string | null | undefined;
  onSetInput: (value: string) => void;
  openGraphTab: () => void;
}

function buildStarters({
  t,
  hasFiles,
  currentFile,
  onSetInput,
  openGraphTab,
}: BuildStartersInput): Starter[] {
  const w = t.ai.welcomeStarters;
  const out: Starter[] = [];

  if (currentFile) {
    const name = extractName(currentFile);
    out.push({
      id: "help-with-note",
      icon: PenLine,
      label: w.helpWithNote,
      context: name,
      variant: "ai",
      onClick: () => onSetInput(w.helpWithNotePrompt.replace("{name}", name)),
    });
  }

  out.push({
    id: "generate-image",
    icon: ImageIcon,
    label: w.generateImage,
    variant: "ai",
    onClick: () => onSetInput(w.generateImagePrompt),
  });

  if (hasFiles) {
    out.push({
      id: "find-notes",
      icon: Search,
      label: w.findNotes,
      variant: "ai",
      onClick: () => onSetInput(w.findNotesPrompt),
    });
  } else {
    out.push({
      id: "brainstorm",
      icon: Sparkles,
      label: w.brainstorm,
      variant: "ai",
      onClick: () => onSetInput(w.brainstormPrompt),
    });
  }

  out.push({
    id: "open-graph",
    icon: Network,
    label: w.openGraph,
    variant: "nav",
    onClick: openGraphTab,
  });

  return out.slice(0, 4);
}

function StarterRow({ starter }: { starter: Starter }) {
  const { icon: Icon, label, context, variant, onClick } = starter;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative w-full flex items-center gap-3 px-3 py-2.5",
        "rounded-ui-md text-left",
        "transition-[background-color,color] duration-fast ease-out-subtle",
        "hover:bg-muted/50",
        "focus-visible:outline-none focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary/30",
        "active:scale-[0.99]",
      ].join(" ")}
    >
      <Icon
        size={14}
        className="shrink-0 text-muted-foreground transition-colors duration-fast ease-out-subtle group-hover:text-primary"
      />
      <span className="flex-1 truncate text-sm text-foreground">{label}</span>
      {context && (
        <span className="shrink-0 truncate max-w-[40%] text-xs text-muted-foreground/80 font-mono">
          {context}
        </span>
      )}
      {variant === "nav" ? (
        <ArrowUpRight
          size={12}
          className="shrink-0 text-muted-foreground/50 transition-[color,transform] duration-fast ease-out-subtle group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        />
      ) : (
        <ChevronRight
          size={12}
          className="shrink-0 text-muted-foreground/40 opacity-0 -translate-x-1 transition-[opacity,transform] duration-fast ease-out-subtle group-hover:opacity-100 group-hover:translate-x-0"
        />
      )}
    </button>
  );
}

/** Quick-starters list — the welcome-screen replacement for the old
 *  4-card prescriptive grid + 3-pill explore row. */
export function WelcomeStarters({
  hasStarted,
  onSetInput,
  currentFile,
  fileTree = [],
}: WelcomeSectionProps) {
  const { t } = useLocaleStore();
  const openGraphTab = useFileStore((s) => s.openGraphTab);

  const starters = useMemo(
    () =>
      buildStarters({
        t,
        hasFiles: fileTree.length > 0,
        currentFile,
        onSetInput,
        openGraphTab,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, fileTree.length, currentFile, onSetInput, openGraphTab],
  );

  return (
    <AnimatePresence>
      {!hasStarted && (
        <motion.div
          className="mx-auto w-full max-w-md px-4 mt-6 sm:mt-8"
          initial={{ opacity: 0, y: 12 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: {
              delay: 0.12,
              duration: 0.28,
              ease: [0.2, 0.9, 0.1, 1],
            },
          }}
          exit={{
            opacity: 0,
            y: 8,
            pointerEvents: "none",
            transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] },
          }}
        >
          <div className="space-y-0.5">
            {starters.map((s) => (
              <StarterRow key={s.id} starter={s} />
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
      <WelcomeStarters
        hasStarted={hasStarted}
        onSetInput={onSetInput}
        currentFile={currentFile}
        recentFiles={recentFiles}
        fileTree={fileTree}
      />
    </>
  );
}
