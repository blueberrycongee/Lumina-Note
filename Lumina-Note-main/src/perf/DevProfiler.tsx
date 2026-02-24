import { Profiler, type ReactNode } from "react";

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
        const host = window as unknown as {
          __luminaRecordRenderSample?: (sample: {
            id: string;
            phase: "mount" | "update" | "nested-update";
            actualDuration: number;
            baseDuration: number;
            commitTime: number;
          }) => void;
        };
        host.__luminaRecordRenderSample?.({
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
