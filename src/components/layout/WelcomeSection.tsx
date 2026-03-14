import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, FileText, Zap, Bot } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useUIStore } from "@/stores/useUIStore";

const WELCOME_EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
  "😊", "😍", "🤩", "😘", "😗", "😋", "😜", "🤪", "😝", "🤑",
  "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏",
  "😒", "🙄", "😬", "😌", "😔", "😪", "🤤", "😴", "🥳", "🤠",
  "🧐", "🤓", "😎",
];

function extractNoteName(filePath: string | null): string | null {
  if (!filePath) return null;
  const name = filePath.split(/[/\\]/).pop() ?? "";
  return name.replace(/\.md$/, "") || null;
}

function getQuickActions(t: ReturnType<typeof useLocaleStore.getState>["t"], noteName: string | null) {
  const p = t.ai.quickPrompts;
  const fill = (tpl: string) => tpl.replace("{noteName}", noteName!);
  return [
    { icon: Sparkles, label: t.ai.polishText, desc: t.ai.polishTextDesc, mode: "chat" as const, prompt: noteName ? fill(p.polishText) : p.polishTextGeneric },
    { icon: FileText, label: t.ai.summarizeNote, desc: t.ai.summarizeNoteDesc, mode: "chat" as const, prompt: noteName ? fill(p.summarizeNote) : p.summarizeNoteGeneric },
    { icon: Zap, label: t.ai.writeArticle, desc: t.ai.writeArticleDesc, mode: "agent" as const, prompt: noteName ? fill(p.writeArticle) : p.writeArticleGeneric },
    { icon: Bot, label: t.ai.studyNotes, desc: t.ai.studyNotesDesc, mode: "agent" as const, prompt: noteName ? fill(p.studyNotes) : p.studyNotesGeneric },
  ];
}

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
      <span className="text-xs text-muted-foreground">{desc}</span>
    </motion.button>
  );
}

interface WelcomeSectionProps {
  hasStarted: boolean;
  onSetInput: (value: string) => void;
  currentFile?: string | null;
}

/** Welcome greeting shown before any conversation starts. */
export function WelcomeGreeting({ hasStarted }: { hasStarted: boolean }) {
  const { t } = useLocaleStore();

  const [welcomeEmoji] = useState(() =>
    WELCOME_EMOJIS[Math.floor(Math.random() * WELCOME_EMOJIS.length)],
  );

  return (
    <AnimatePresence>
      {!hasStarted && (
        <motion.div
          className="text-center mt-10 md:mt-12 mb-8 space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20, scale: 0.9, transition: { duration: 0.3 } }}
        >
          <div className="w-20 h-20 bg-background rounded-full mx-auto shadow-sm border border-border flex items-center justify-center">
            <span className="text-4xl">{welcomeEmoji}</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
            {t.ai.welcomeTitle}
          </h1>
          <p className="text-muted-foreground text-sm whitespace-nowrap overflow-hidden text-ellipsis">
            {t.ai.welcomeSubtitle}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Quick-action suggestion cards shown before any conversation starts. */
export function WelcomeSuggestions({ hasStarted, onSetInput, currentFile }: WelcomeSectionProps) {
  const { t } = useLocaleStore();
  const setChatMode = useUIStore((s) => s.setChatMode);
  const noteName = useMemo(() => extractNoteName(currentFile ?? null), [currentFile]);
  const quickActions = useMemo(() => getQuickActions(t, noteName), [t, noteName]);

  const handleQuickAction = (action: (typeof quickActions)[0]) => {
    setChatMode(action.mode);
    if (action.prompt) {
      onSetInput(action.prompt);
    }
  };

  return (
    <AnimatePresence>
      {!hasStarted && (
        <motion.div
          className="w-full max-w-3xl mx-auto px-4 mt-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
          exit={{ opacity: 0, y: 50, pointerEvents: "none", transition: { duration: 0.2 } }}
        >
          <div className="mb-4 px-1">
            <span className="text-xs font-medium text-muted-foreground">{t.ai.startTask}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickActions.map((action, idx) => (
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
export function WelcomeSection({ hasStarted, onSetInput, currentFile }: WelcomeSectionProps) {
  return (
    <>
      <WelcomeGreeting hasStarted={hasStarted} />
      <WelcomeSuggestions hasStarted={hasStarted} onSetInput={onSetInput} currentFile={currentFile} />
    </>
  );
}
