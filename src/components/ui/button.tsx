import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary/90 text-primary-foreground shadow-ui-card hover:shadow-ui-float hover:bg-primary/85 active:translate-y-[0.5px]",
  secondary:
    "bg-background/50 text-foreground border border-border/60 shadow-ui-card/60 hover:bg-accent/70 hover:border-border/80",
  ghost:
    "bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-transparent hover:border-border/60",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-[15px]",
};

export function Button({
  className,
  variant = "secondary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-ui-md font-medium",
        "transition-[transform,box-shadow,background-color,border-color,color] duration-150 ease-out",
        "disabled:opacity-50 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_hsl(var(--primary)/0.45),0_0_0_4px_hsl(var(--primary)/0.18)]",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
