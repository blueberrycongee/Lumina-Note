import { useCallback, useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  getResizeHandleIndicatorClassName,
  RESIZE_HANDLE_WRAPPER_CLASSNAME,
} from "./resizeHandleStyles";

interface ResizeHandleProps {
  direction: "left" | "right";
  onResize: (delta: number) => void;
  onDoubleClick?: () => void;
  className?: string;
}

const PROXIMITY_MASK =
  "radial-gradient(80px 120px at 50% var(--cursor-y, 50%), black, transparent)";

export function ResizeHandle({
  direction,
  onResize,
  onDoubleClick,
  className,
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastXRef = useRef(0);
  const latestXRef = useRef(0);

  const emitResize = useCallback(
    (delta: number) => {
      if (delta === 0) return;
      onResize(direction === "right" ? -delta : delta);
    },
    [direction, onResize]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      lastXRef.current = e.clientX;
      latestXRef.current = e.clientX;
      setIsDragging(true);

      // 拖动时禁用侧边栏的过渡动画
      document.body.classList.add("resizing");
    },
    []
  );

  useEffect(() => {
    if (!isDragging) return;

    const flushPendingDelta = () => {
      const delta = latestXRef.current - lastXRef.current;
      lastXRef.current = latestXRef.current;
      emitResize(delta);
    };

    const handleMouseMove = (e: MouseEvent) => {
      latestXRef.current = e.clientX;

      // 使用 requestAnimationFrame 节流，并始终消费最新坐标，避免帧内丢增量
      if (rafRef.current) return;

      rafRef.current = requestAnimationFrame(() => {
        flushPendingDelta();
        rafRef.current = null;
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        flushPendingDelta();
      }
      lastXRef.current = 0;
      latestXRef.current = 0;
      // 恢复过渡动画
      document.body.classList.remove("resizing");
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // Change cursor globally while dragging
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [emitResize, isDragging]);

  // Track cursor Y on the indicator (via ref, no re-render)
  const updateCursorY = useCallback((e: React.MouseEvent) => {
    if (indicatorRef.current) {
      const rect = indicatorRef.current.getBoundingClientRect();
      indicatorRef.current.style.setProperty(
        "--cursor-y",
        `${e.clientY - rect.top}px`
      );
    }
  }, []);

  const hitAreaStyle =
    direction === "left"
      ? { left: "-1px", right: "-7px" }
      : { left: "-1px", right: "-7px" };

  // Hover: proximity mask around cursor; Drag: full glow, stronger intensity
  const indicatorStyle: React.CSSProperties | undefined =
    isDragging
      ? {
          backgroundColor: "hsl(var(--border) / 0.3)",
          boxShadow: "0 0 7px hsl(var(--border) / 0.35)",
        }
      : isHovering
        ? { maskImage: PROXIMITY_MASK, WebkitMaskImage: PROXIMITY_MASK }
        : undefined;

  return (
    <div
      className={cn(
        RESIZE_HANDLE_WRAPPER_CLASSNAME,
        className
      )}
    >
      <div
        ref={indicatorRef}
        className={getResizeHandleIndicatorClassName(isDragging || isHovering, direction)}
        style={indicatorStyle}
      />

      {/* Clickable area - 这是实际的点击区域 */}
      <div
        className="absolute inset-y-0 cursor-col-resize z-30"
        style={hitAreaStyle}
        onMouseDown={handleMouseDown}
        onDoubleClick={onDoubleClick}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onMouseMove={updateCursorY}
      />
    </div>
  );
}
