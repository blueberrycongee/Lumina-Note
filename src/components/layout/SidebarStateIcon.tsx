import { motion } from "framer-motion";

interface SidebarStateIconProps {
  side: "left" | "right";
  open: boolean;
  reduceMotion?: boolean | null;
}

export function SidebarStateIcon({
  side,
  open,
  reduceMotion,
}: SidebarStateIconProps) {
  const panelX = side === "left" ? 4 : 12;
  const dividerX = side === "left" ? 11 : 12;
  const transformOrigin = side === "left" ? "4px 12px" : "20px 12px";
  const closedStroke = "hsl(var(--muted-foreground))";

  return (
    <svg
      aria-hidden="true"
      className="h-[18px] w-[18px]"
      viewBox="0 0 24 24"
      fill="none"
    >
      <motion.rect
        x={panelX}
        y="5"
        width="8"
        height="14"
        rx="2"
        fill="currentColor"
        initial={false}
        animate={{
          opacity: open ? 1 : 0,
          scaleX: open ? 1 : 0.35,
        }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.18, ease: [0.2, 0.9, 0.1, 1] }
        }
        style={{ transformOrigin }}
      />
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="5"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <motion.line
        x1={dividerX}
        y1="5.5"
        x2={dividerX}
        y2="18.5"
        stroke={open ? "hsl(var(--popover))" : closedStroke}
        strokeWidth="2"
        strokeLinecap="round"
        initial={false}
        animate={{ opacity: open ? 0.95 : 1 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.18, ease: [0.2, 0.9, 0.1, 1] }
        }
      />
    </svg>
  );
}
