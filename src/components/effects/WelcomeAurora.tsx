import { motion, useReducedMotion } from "framer-motion";

interface WelcomeAuroraProps {
  visible: boolean;
}

const slowEase = [0.4, 0.0, 0.2, 1] as const;

export function WelcomeAurora({ visible }: WelcomeAuroraProps) {
  const reduce = useReducedMotion();

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[58vh] overflow-hidden z-0"
    >
      <motion.div
        className="absolute -top-32 -left-24 h-[480px] w-[480px] rounded-full bg-primary blur-[120px]"
        initial={{ opacity: 0 }}
        animate={
          reduce
            ? { opacity: 0.14 }
            : {
                opacity: [0.06, 0.18, 0.12, 0.16, 0.06],
                x: [0, 36, -8, 20, 0],
                y: [0, 24, 44, 12, 0],
              }
        }
        transition={
          reduce
            ? { duration: 0 }
            : { duration: 18, ease: slowEase, repeat: Infinity }
        }
      />
      <motion.div
        className="absolute -top-40 right-[-7rem] h-[520px] w-[520px] rounded-full bg-primary blur-[140px]"
        initial={{ opacity: 0 }}
        animate={
          reduce
            ? { opacity: 0.10 }
            : {
                opacity: [0.05, 0.13, 0.08, 0.12, 0.05],
                x: [0, -28, 14, -10, 0],
                y: [0, 16, 38, 22, 0],
              }
        }
        transition={
          reduce
            ? { duration: 0 }
            : { duration: 22, ease: slowEase, repeat: Infinity, delay: 2 }
        }
      />
      <motion.div
        className="absolute top-[8%] left-[42%] h-[280px] w-[280px] -translate-x-1/2 rounded-full bg-foreground blur-[90px]"
        initial={{ opacity: 0 }}
        animate={
          reduce
            ? { opacity: 0.04 }
            : {
                opacity: [0.02, 0.06, 0.03, 0.05, 0.02],
                x: [0, 18, -22, 8, 0],
              }
        }
        transition={
          reduce
            ? { duration: 0 }
            : { duration: 26, ease: slowEase, repeat: Infinity, delay: 4 }
        }
      />
    </div>
  );
}
