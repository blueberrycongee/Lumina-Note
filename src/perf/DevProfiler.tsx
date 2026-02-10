import { Profiler, type ReactNode } from "react";
import { recordDevRenderSample } from "@/perf/devPerfMonitor";

interface DevProfilerProps {
  id: string;
  children: ReactNode;
}

export function DevProfiler({ id, children }: DevProfilerProps) {
  if (!import.meta.env.DEV) {
    return <>{children}</>;
  }

  return (
    <Profiler
      id={id}
      onRender={(_id, phase, actualDuration, baseDuration, _startTime, commitTime) => {
        recordDevRenderSample({
          id,
          phase,
          actualDuration,
          baseDuration,
          commitTime,
        });
      }}
    >
      {children}
    </Profiler>
  );
}

