import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatabaseIconButton, DatabasePanel } from "./primitives";
import {
  DATABASE_VIEW_SCALE_DEFAULT,
  DATABASE_VIEW_SCALE_MAX,
  DATABASE_VIEW_SCALE_MIN,
  formatDatabaseViewScale,
  nextDatabaseViewScale,
  normalizeDatabaseViewScale,
  prevDatabaseViewScale,
} from "./viewScale";

interface DatabaseViewScaleControlProps {
  scale?: number;
  onScaleChange: (nextScale: number) => void;
  zoomOutLabel: string;
  zoomInLabel: string;
  resetZoomLabel: string;
  className?: string;
}

export function DatabaseViewScaleControl({
  scale,
  onScaleChange,
  zoomOutLabel,
  zoomInLabel,
  resetZoomLabel,
  className,
}: DatabaseViewScaleControlProps) {
  const normalizedScale = normalizeDatabaseViewScale(scale);
  const canZoomOut = normalizedScale > DATABASE_VIEW_SCALE_MIN;
  const canZoomIn = normalizedScale < DATABASE_VIEW_SCALE_MAX;
  const scaleLabel = formatDatabaseViewScale(normalizedScale);

  return (
    <DatabasePanel className={cn("flex items-center gap-1 p-0.5", className)}>
      <DatabaseIconButton
        aria-label={zoomOutLabel}
        title={zoomOutLabel}
        onClick={() => onScaleChange(prevDatabaseViewScale(normalizedScale))}
        disabled={!canZoomOut}
      >
        <Minus className="w-3.5 h-3.5" />
      </DatabaseIconButton>
      <button
        type="button"
        className="db-toggle-btn h-8 min-w-[58px] justify-center px-2 tabular-nums"
        onClick={() => onScaleChange(DATABASE_VIEW_SCALE_DEFAULT)}
        aria-label={`${resetZoomLabel}: ${scaleLabel}`}
        title={resetZoomLabel}
      >
        {scaleLabel}
      </button>
      <DatabaseIconButton
        aria-label={zoomInLabel}
        title={zoomInLabel}
        onClick={() => onScaleChange(nextDatabaseViewScale(normalizedScale))}
        disabled={!canZoomIn}
      >
        <Plus className="w-3.5 h-3.5" />
      </DatabaseIconButton>
    </DatabasePanel>
  );
}

interface DatabaseScaledContentProps {
  scale?: number;
  className?: string;
  children: ReactNode;
}

export function DatabaseScaledContent({ scale, className, children }: DatabaseScaledContentProps) {
  const normalizedScale = normalizeDatabaseViewScale(scale);
  const isScaled = Math.abs(normalizedScale - 1) > 0.001;

  return (
    <div
      className={cn("origin-top-left motion-reduce:transition-none", isScaled && "transition-transform duration-180 ease-out", className)}
      style={
        isScaled
          ? {
              transform: `scale(${normalizedScale})`,
              width: `${(100 / normalizedScale).toFixed(3)}%`,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
