import { Brain } from "lucide-react";

interface ThinkingModelIconProps {
  className?: string;
}

export function ThinkingModelIcon({ className = "" }: ThinkingModelIconProps) {
  return (
    <span
      className={`inline-flex h-4 w-4 items-center justify-center rounded-sm bg-zinc-900 text-white ring-1 ring-white/15 ${className}`.trim()}
      title="Thinking model"
      aria-label="Thinking model"
    >
      <Brain size={10} strokeWidth={2.4} />
    </span>
  );
}
