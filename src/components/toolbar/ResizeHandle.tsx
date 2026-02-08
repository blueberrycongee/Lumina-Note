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
          "absolute inset-y-4 left-1/2 -translate-x-1/2 w-4 rounded-full blur-md pointer-events-none",
          "bg-primary/20 opacity-0 transition-[opacity,transform] duration-200 ease-out",
          "group-hover:opacity-100 group-hover:scale-x-110",
          (isDragging || isHovering) && "opacity-100 bg-primary/35"
        )}
      />

      {/* Visual indicator - hover/drag reveal only */}
      <div
        className={cn(
          "absolute inset-y-3 left-1/2 -translate-x-1/2 w-[2px] rounded-full pointer-events-none",
          "bg-gradient-to-b from-foreground/45 via-foreground/18 to-transparent",
          "opacity-35 transition-[opacity,width,background-image,box-shadow,transform] duration-200 ease-out",
          "shadow-[0_0_0_1px_hsl(var(--foreground)/0.06),0_0_10px_hsl(var(--foreground)/0.08)]",
          "group-hover:opacity-100 group-hover:w-[3px]",
          (isDragging || isHovering) &&
            "opacity-100 w-[3px] bg-gradient-to-b from-primary/75 via-primary/40 to-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.35),0_0_18px_hsl(var(--primary)/0.35)]"
        )}
      />
      
      {/* Clickable area - 这是实际的点击区域 */}
      <div 
        className="absolute inset-y-0 -left-4 -right-4 cursor-col-resize z-30"
        onMouseDown={handleMouseDown}
        onDoubleClick={onDoubleClick}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      />
    </div>
  );
}
