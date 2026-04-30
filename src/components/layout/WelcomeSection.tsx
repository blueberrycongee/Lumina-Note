import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Image as ImageIcon,
  PenLine,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
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
  /**
   * Optional escape hatch for the "Generate an image" pill: instead of
   * filling the textarea with a prompt template, callers can flip the
   * chat into image-mode and let the user describe the picture directly.
   * MainAIChatShell wires this so a chip appears in the input row.
   */
  onActivateImageMode?: () => void;
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
          className="relative text-center mt-10 sm:mt-14 md:mt-[4.5rem] mb-6 sm:mb-8 space-y-3"
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

// ── Starters: three ChatGPT-style pills under the input. Always exactly
// three; the set adapts to context (current file, vault populated). Each
// pill carries an icon tinted with a distinct accent so the row reads as
// "three different kinds of starting points," not a uniform menu.

interface Starter {
  id: string;
  icon: LucideIcon;
  label: string;
  /** Tailwind class fragment for the icon's accent color. Each pill gets
   *  a different hue so the row feels like a palette of options rather
   *  than a stack of the same thing. */
  accent: string;
  onClick: () => void;
}

interface BuildStartersInput {
  t: Translations;
  hasFiles: boolean;
  currentFile: string | null | undefined;
  onSetInput: (value: string) => void;
  onActivateImageMode?: () => void;
}

function buildStarters({
  t,
  hasFiles,
  currentFile,
  onSetInput,
  onActivateImageMode,
}: BuildStartersInput): Starter[] {
  const w = t.ai.welcomeStarters;
  const helpWithNote: Starter | null = currentFile
    ? {
        id: "help-with-note",
        icon: PenLine,
        label: w.helpWithNote,
        accent: "text-emerald-500 dark:text-emerald-400",
        onClick: () => {
          const name = extractName(currentFile);
          onSetInput(w.helpWithNotePrompt.replace("{name}", name));
        },
      }
    : null;

  // Image pill flips the chat into image-mode (chip appears in the input
  // row) when the parent wires the activator. Falls back to filling the
  // textarea with a prompt template — same behaviour as before — for
  // any caller that hasn't opted into mode chips yet.
  const generateImage: Starter = {
    id: "generate-image",
    icon: ImageIcon,
    label: w.generateImage,
    accent: "text-violet-500 dark:text-violet-400",
    onClick: onActivateImageMode
      ? onActivateImageMode
      : () => onSetInput(w.generateImagePrompt),
  };

  const findOrBrainstorm: Starter = hasFiles
    ? {
        id: "find-notes",
        icon: Search,
        label: w.findNotes,
        accent: "text-sky-500 dark:text-sky-400",
        onClick: () => onSetInput(w.findNotesPrompt),
      }
    : {
        id: "brainstorm",
        icon: Sparkles,
        label: w.brainstorm,
        accent: "text-amber-500 dark:text-amber-400",
        onClick: () => onSetInput(w.brainstormPrompt),
      };

  const candidates: (Starter | null)[] = [
    helpWithNote,
    generateImage,
    findOrBrainstorm,
    // Fallback when there's no current file: use brainstorm as the third
    // pill alongside generate + find/brainstorm so we always have three.
    !helpWithNote && hasFiles
      ? {
          id: "brainstorm-extra",
          icon: Sparkles,
          label: w.brainstorm,
          accent: "text-amber-500 dark:text-amber-400",
          onClick: () => onSetInput(w.brainstormPrompt),
        }
      : null,
  ];

  return candidates.filter((s): s is Starter => s !== null).slice(0, 3);
}

function StarterPill({ starter }: { starter: Starter }) {
  const { icon: Icon, label, accent, onClick } = starter;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group inline-flex items-center gap-1.5",
        "rounded-full border border-border/60 bg-background/40 px-3 py-1.5",
        "text-xs text-foreground",
        "transition-[background-color,border-color,transform] duration-fast ease-out-subtle",
        "hover:border-primary/40 hover:bg-accent/50",
        "active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      ].join(" ")}
    >
      <Icon
        size={13}
        className={[
          "shrink-0 transition-transform duration-fast ease-out-subtle",
          "group-hover:scale-110",
          accent,
        ].join(" ")}
      />
      <span>{label}</span>
    </button>
  );
}

/** Three small pills under the input — ChatGPT-style starting points
 *  that fill the chat with a contextual prompt when clicked. */
export function WelcomeStarters({
  hasStarted,
  onSetInput,
  onActivateImageMode,
  currentFile,
  fileTree = [],
}: WelcomeSectionProps) {
  const { t } = useLocaleStore();

  const starters = useMemo(
    () =>
      buildStarters({
        t,
        hasFiles: fileTree.length > 0,
        currentFile,
        onSetInput,
        onActivateImageMode,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, fileTree.length, currentFile, onSetInput, onActivateImageMode],
  );

  return (
    <AnimatePresence>
      {!hasStarted && (
        <motion.div
          className="relative z-10 mx-auto w-full max-w-3xl px-4 mt-5 sm:mt-6 flex items-center justify-center flex-wrap gap-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: {
              delay: 0.18,
              duration: 0.28,
              ease: [0.2, 0.9, 0.1, 1],
            },
          }}
          exit={{
            opacity: 0,
            transition: { duration: 0.14, ease: [0.4, 0, 0.2, 1] },
          }}
        >
          {starters.map((s) => (
            <StarterPill key={s.id} starter={s} />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Combined component (for backward compat). */
export function WelcomeSection({
  hasStarted,
  onSetInput,
  onActivateImageMode,
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
        onActivateImageMode={onActivateImageMode}
        currentFile={currentFile}
        recentFiles={recentFiles}
        fileTree={fileTree}
      />
    </>
  );
}
