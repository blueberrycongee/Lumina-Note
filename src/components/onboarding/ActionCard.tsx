import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action: {
    label: string;
    variant: "primary" | "secondary";
    onClick: () => void;
  };
}

export function ActionCard({
  icon: Icon,
  title,
  description,
  action,
}: ActionCardProps) {
  return (
    <div className="group flex items-center gap-4 p-4 rounded-ui-lg border border-border bg-background hover:shadow-elev-1 transition-shadow duration-200">
      <div className="w-10 h-10 rounded-ui-md bg-accent flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Button
        variant={action.variant}
        size="md"
        onClick={action.onClick}
        className="shrink-0"
      >
        {action.label}
      </Button>
    </div>
  );
}
