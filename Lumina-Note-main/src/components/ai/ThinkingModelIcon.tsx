import { Brain } from "lucide-react";

interface ThinkingModelIconProps {
  className?: string;
}

export function ThinkingModelIcon({ className = "" }: ThinkingModelIconProps) {
  return (
    <span
      className={`inline-flex h-4 w-4 items-center justify-center text-foreground/80 ${className}`.trim()}
      title="Thinking model"
      aria-label="Thinking model"
    >
      <Brain size={13} strokeWidth={2.2} />
    </span>
  );
}
