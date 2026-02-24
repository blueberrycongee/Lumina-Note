import { useCallback, useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface ResizeHandleProps {
  direction: "left" | "right";
  onResize: (delta: number) => void;
  onDoubleClick?: () => void;
  className?: string;
}

export function ResizeHandle({
  direction,
  onResize,
  onDoubleClick,
  className,
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [hoverY, setHoverY] = useState(50);
  const rafRef = useRef<number | null>(null);
  const lastXRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      lastXRef.current = e.clientX;
      setIsDragging(true);
      
      // 拖动时禁用侧边栏的过渡动画
      document.body.classList.add("resizing");
    },
    []
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // 使用 requestAnimationFrame 节流
      if (rafRef.current) return;
      
      rafRef.current = requestAnimationFrame(() => {
        const delta = e.clientX - lastXRef.current;
        lastXRef.current = e.clientX;

        if (delta !== 0) {
          // Invert delta for right-side handles
          onResize(direction === "right" ? -delta : delta);
        }
        
        rafRef.current = null;
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      lastXRef.current = 0;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
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
  }, [isDragging, direction, onResize]);

  const updateHoverY = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.height <= 0) return;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setHoverY(Math.max(0, Math.min(100, y)));
  }, []);

  const glowAlpha = isDragging ? 0.2 : 0.12;
  const edgeAlpha = isDragging ? 0.08 : 0.05;
  const hitAreaStyle =
    direction === "left"
      ? { left: "-1px", right: "-7px" }
      : { left: "-1px", right: "-7px" };

  return (
    <div
      className={cn(
        "group relative h-full w-2 -mx-[1px] flex-shrink-0 cursor-col-resize select-none z-20",
        className
      )}
    >
      {/* Soft glow layer */}
      <div
        className={cn(
          "absolute inset-y-1 left-1/2 -translate-x-1/2 w-8 pointer-events-none",
          "opacity-0 transition-opacity duration-150 ease-out",
          (isDragging || isHovering) && "opacity-100"
        )}
        style={{
          backgroundImage: `radial-gradient(70% 36% at 50% ${hoverY}%, hsl(var(--primary) / ${glowAlpha}) 0%, hsl(var(--primary) / ${edgeAlpha}) 34%, transparent 78%)`,
        }}
      />

      {/* Visual indicator - hover/drag reveal only */}
      <div
        className={cn(
          "absolute inset-y-3 left-1/2 -translate-x-1/2 w-[2px] rounded-full pointer-events-none",
          "bg-gradient-to-b from-foreground/28 via-foreground/12 to-transparent",
          "opacity-30 transition-[opacity,width,background-image,box-shadow] duration-150 ease-out",
          "shadow-[0_0_0_1px_hsl(var(--foreground)/0.04),0_0_8px_hsl(var(--foreground)/0.05)]",
          "group-hover:opacity-85 group-hover:w-[2.5px]",
          (isDragging || isHovering) &&
            "opacity-85 w-[2.5px] bg-gradient-to-b from-primary/55 via-primary/25 to-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.18),0_0_12px_hsl(var(--primary)/0.16)]"
        )}
      />

      {/* Focus hotspot - brightest near pointer, fades quickly above/below */}
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2 w-[3px] h-10 rounded-full pointer-events-none",
          "opacity-0 transition-opacity duration-150 ease-out",
          (isDragging || isHovering) && "opacity-100"
        )}
        style={{
          top: `calc(${hoverY}% - 20px)`,
          backgroundImage:
            "linear-gradient(to bottom, transparent 0%, hsl(var(--primary) / 0.42) 50%, transparent 100%)",
          filter: "blur(0.2px)",
        }}
      />
      
      {/* Clickable area - 这是实际的点击区域 */}
      <div
        className="absolute inset-y-0 cursor-col-resize z-30"
        style={hitAreaStyle}
        onMouseDown={handleMouseDown}
        onDoubleClick={onDoubleClick}
        onMouseEnter={(e) => {
          setIsHovering(true);
          updateHoverY(e);
        }}
        onMouseMove={updateHoverY}
        onMouseLeave={() => setIsHovering(false)}
      />
    </div>
  );
}
