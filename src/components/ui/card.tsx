import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className, ...props }: CardProps) {
  return <div className={cn("ui-card", className)} {...props} />;
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pt-4", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-[15px] font-semibold tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("mt-1 text-sm text-muted-foreground", className)} {...props} />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...props} />;
}
