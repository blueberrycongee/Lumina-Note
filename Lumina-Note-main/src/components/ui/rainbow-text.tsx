/**
 * RainbowText - 闪烁渐变文字组件
 * 
 * 搜索中时文字有流动的光泽效果
 */

import { cn } from "@/lib/utils";
import styles from "./rainbow-text.module.css";

interface RainbowTextProps {
  animated?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function RainbowText({ animated, className, children }: RainbowTextProps) {
  return (
    <span className={cn(animated && styles.animated, className)}>
      {children}
    </span>
  );
}
