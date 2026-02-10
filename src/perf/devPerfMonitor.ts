import { useFileStore } from "@/stores/useFileStore";
import { runStartupPerfScenarios, type PerfScenarioResult } from "@/perf/startupPerfScenarios";

interface DevRenderSample {
  id: string;
  phase: "mount" | "update" | "nested-update";
  actualDuration: number;
  baseDuration: number;
  commitTime: number;
}

interface DevPerfSnapshot {
  startedAt: number;
  totalStoreUpdates: number;
  currentContentUpdates: number;
  tabStateUpdates: number;
  maxContentLength: number;
  recentRenderSamples: DevRenderSample[];
  startupReport?: {
    generatedAt: number;
    results: PerfScenarioResult[];
  };
}

type PerfBaseline = Record<string, number>;

const GLOBAL_KEY = "__luminaDevPerf";
const BASELINE_STORAGE_KEY = "lumina:perf:baseline:v1";
const STARTUP_BUDGET_MULTIPLIER = 1.35;
const MAX_RENDER_SAMPLES = 80;
const HEAVY_RENDER_THRESHOLD_MS = 14;
const STORE_BURST_THRESHOLD_PER_SEC = 30;
const SUMMARY_INTERVAL_MS = 20_000;

let summaryTimer: number | null = null;

declare global {
  interface Window {
    __luminaRecordRenderSample?: (sample: DevRenderSample) => void;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function readBaseline(): PerfBaseline {
  try {
    const raw = localStorage.getItem(BASELINE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PerfBaseline;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBaseline(baseline: PerfBaseline): void {
  try {
    localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(baseline));
  } catch {
    // ignore write errors
  }
}

function getSnapshot(): DevPerfSnapshot {
  const host = window as unknown as Record<string, unknown>;
  const existing = host[GLOBAL_KEY] as DevPerfSnapshot | undefined;
  if (existing) return existing;
  const created: DevPerfSnapshot = {
    startedAt: Date.now(),
    totalStoreUpdates: 0,
    currentContentUpdates: 0,
    tabStateUpdates: 0,
    maxContentLength: 0,
    recentRenderSamples: [],
  };
  host[GLOBAL_KEY] = created;
  return created;
}

export function recordDevRenderSample(sample: DevRenderSample): void {
  if (!import.meta.env.DEV) return;
  const snapshot = getSnapshot();
  snapshot.recentRenderSamples.push(sample);
  if (snapshot.recentRenderSamples.length > MAX_RENDER_SAMPLES) {
    snapshot.recentRenderSamples.splice(0, snapshot.recentRenderSamples.length - MAX_RENDER_SAMPLES);
  }
  if (sample.actualDuration >= HEAVY_RENDER_THRESHOLD_MS) {
    console.warn(
      `[perf/dev][render] ${sample.id} ${sample.phase} ${sample.actualDuration.toFixed(2)}ms (base ${sample.baseDuration.toFixed(2)}ms)`
    );
  }
}

function setupPerformanceObservers(): void {
  if (typeof PerformanceObserver === "undefined") {
    return;
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === "longtask") {
        console.warn(`[perf/dev][longtask] ${entry.duration.toFixed(2)}ms at ${entry.startTime.toFixed(2)}ms`);
      }
    }
  });
  try {
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // "longtask" is not available in all runtimes.
  }
}

function setupStoreObserver(): void {
  let burstCounter = 0;
  let burstWindowStart = performance.now();

  useFileStore.subscribe((state, prevState) => {
    const snapshot = getSnapshot();
    snapshot.totalStoreUpdates += 1;
    burstCounter += 1;

    if (state.currentContent !== prevState.currentContent) {
      snapshot.currentContentUpdates += 1;
      snapshot.maxContentLength = Math.max(snapshot.maxContentLength, state.currentContent.length);
    }
    if (state.tabs !== prevState.tabs || state.activeTabIndex !== prevState.activeTabIndex) {
      snapshot.tabStateUpdates += 1;
    }

    const now = performance.now();
    if (now - burstWindowStart >= 1000) {
      if (burstCounter >= STORE_BURST_THRESHOLD_PER_SEC) {
        console.warn(
          `[perf/dev][store] high update burst: ${burstCounter}/s (code refs: src/stores/useFileStore.ts, src/components/layout/Sidebar.tsx)`
        );
      }
      burstCounter = 0;
      burstWindowStart = now;
    }
  });
}

function evaluateStartupReport(results: PerfScenarioResult[]): void {
  const baseline = readBaseline();
  const nextBaseline: PerfBaseline = { ...baseline };

  for (const result of results) {
    const previous = baseline[result.id];
    const duration = result.durationMs;
    const budgetExceeded = duration > result.thresholdMs;
    const baselineRegressed = previous !== undefined && duration > previous * STARTUP_BUDGET_MULTIPLIER;

    if (budgetExceeded || baselineRegressed) {
      const baselineLabel = previous !== undefined ? `${previous.toFixed(2)}ms` : "n/a";
      const refs = result.codeRefs.join(", ");
      console.warn(
        `[perf/dev][startup] ${result.id}=${duration.toFixed(2)}ms budget=${result.thresholdMs.toFixed(2)}ms baseline=${baselineLabel} refs=${refs}`
      );
    } else {
      console.info(
        `[perf/dev][startup] ${result.id}=${duration.toFixed(2)}ms (budget ${result.thresholdMs.toFixed(2)}ms)`
      );
    }

    nextBaseline[result.id] =
      previous === undefined ? duration : previous * 0.7 + duration * 0.3;
  }

  writeBaseline(nextBaseline);
}

function runStartupSmoke(): void {
  const report = runStartupPerfScenarios();
  const snapshot = getSnapshot();
  snapshot.startupReport = {
    generatedAt: report.generatedAt,
    results: report.results,
  };

  evaluateStartupReport(report.results);

  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
  if (memory) {
    const usedMb = memory.usedJSHeapSize / 1024 / 1024;
    const totalMb = memory.totalJSHeapSize / 1024 / 1024;
    console.info(
      `[perf/dev][heap] used=${usedMb.toFixed(2)}MB total=${totalMb.toFixed(2)}MB`
    );
  }
}

function scheduleStartupSmoke(): void {
  const run = () => {
    try {
      runStartupSmoke();
    } catch (error) {
      console.warn("[perf/dev] startup smoke failed:", error);
    }
  };

  if ("requestIdleCallback" in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback(run, { timeout: 4_000 });
    return;
  }
  globalThis.setTimeout(run, 2_500);
}

function startSummaryLoop(): void {
  if (summaryTimer !== null) {
    window.clearInterval(summaryTimer);
  }
  summaryTimer = window.setInterval(() => {
    const snapshot = getSnapshot();
    const uptimeSec = (Date.now() - snapshot.startedAt) / 1000;
    const recentHeavyRenders = snapshot.recentRenderSamples.filter(
      (sample) => sample.actualDuration >= HEAVY_RENDER_THRESHOLD_MS
    ).length;
    console.info(
      `[perf/dev][summary @ ${nowIso()}] uptime=${uptimeSec.toFixed(1)}s storeUpdates=${snapshot.totalStoreUpdates} contentUpdates=${snapshot.currentContentUpdates} tabUpdates=${snapshot.tabStateUpdates} heavyRenders=${recentHeavyRenders} maxContentLen=${snapshot.maxContentLength}`
    );
  }, SUMMARY_INTERVAL_MS);
}

export function bootstrapDevPerfMonitor(): void {
  if (!import.meta.env.DEV) {
    return;
  }
  const host = window as unknown as { __luminaDevPerfInitialized?: boolean };
  if (host.__luminaDevPerfInitialized) {
    return;
  }
  if (localStorage.getItem("lumina_perf_disabled") === "1") {
    return;
  }
  host.__luminaDevPerfInitialized = true;

  getSnapshot();
  window.__luminaRecordRenderSample = recordDevRenderSample;
  setupPerformanceObservers();
  setupStoreObserver();
  scheduleStartupSmoke();
  startSummaryLoop();
  console.info("[perf/dev] observability enabled (dev only)");
}
