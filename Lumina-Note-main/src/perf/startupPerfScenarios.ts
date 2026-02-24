type PerfMetaValue = number | string;

export interface PerfScenarioResult {
  id: string;
  durationMs: number;
  thresholdMs: number;
  description: string;
  codeRefs: string[];
  meta: Record<string, PerfMetaValue>;
}

export interface StartupPerfReport {
  generatedAt: number;
  results: PerfScenarioResult[];
}

interface SyntheticTabHistoryEntry {
  content: string;
  type: "user" | "ai";
  timestamp: number;
}

interface SyntheticTab {
  id: string;
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  undoStack: SyntheticTabHistoryEntry[];
  redoStack: SyntheticTabHistoryEntry[];
}

interface SyntheticTabState {
  tabs: SyntheticTab[];
  activeTabIndex: number;
  currentContent: string;
  isDirty: boolean;
  undoStack: SyntheticTabHistoryEntry[];
  redoStack: SyntheticTabHistoryEntry[];
}

const DECORATION_PATTERNS: Array<{ key: string; regex: RegExp }> = [
  { key: "math_inline", regex: /\$[^$\n]+\$/g },
  { key: "code_fence", regex: /```[\s\S]*?```/g },
  { key: "highlight", regex: /==([^=\n]+)==/g },
  { key: "wikilink", regex: /\[\[([^\]]+)\]\]/g },
  { key: "callout", regex: /^>\s*\[![A-Z]+\]/gm },
  { key: "image", regex: /!\[[^\]]*]\([^)]+\)/g },
];

function measureDurationMs(callback: () => void): number {
  const start = performance.now();
  callback();
  return performance.now() - start;
}

function countPatternMatches(content: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  let matches = 0;
  while (pattern.exec(content) !== null) {
    matches += 1;
  }
  return matches;
}

export function buildSyntheticMarkdown(targetKb: number): string {
  const seedBlocks = [
    "# Performance Note\n\n",
    "Normal text paragraph for editor baseline.\n\n",
    "Inline math: $E = mc^2$ and $\\alpha + \\beta$.\n\n",
    "Code block:\n```ts\nconst a = 1;\nconsole.log(a);\n```\n\n",
    "Highlight marker ==important== and [[linked-note]].\n\n",
    "> [!TIP] callout content here.\n\n",
    "![image](./asset.png)\n\n",
  ];
  let content = "";
  while (content.length < targetKb * 1024) {
    content += seedBlocks[content.length % seedBlocks.length];
  }
  return content;
}

function scanDecorationLikePatterns(content: string): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const pattern of DECORATION_PATTERNS) {
    stats[pattern.key] = countPatternMatches(content, pattern.regex);
  }
  return stats;
}

function buildSyntheticTabState(tabCount: number, contentKb: number, undoDepth: number): SyntheticTabState {
  const content = buildSyntheticMarkdown(contentKb);
  const tabs: SyntheticTab[] = [];
  for (let i = 0; i < tabCount; i += 1) {
    const undoStack: SyntheticTabHistoryEntry[] = [];
    for (let j = 0; j < undoDepth; j += 1) {
      undoStack.push({
        content: `${content}\n\nEdit-${i}-${j}`,
        type: "user",
        timestamp: Date.now() + j,
      });
    }
    tabs.push({
      id: `tab-${i}`,
      path: `/mock/tab-${i}.md`,
      name: `tab-${i}`,
      content,
      isDirty: false,
      undoStack,
      redoStack: [],
    });
  }

  return {
    tabs,
    activeTabIndex: 0,
    currentContent: tabs[0]?.content ?? "",
    isDirty: false,
    undoStack: tabs[0]?.undoStack ?? [],
    redoStack: [],
  };
}

function simulateSwitchTab(state: SyntheticTabState, targetIndex: number): SyntheticTabState {
  if (targetIndex < 0 || targetIndex >= state.tabs.length || targetIndex === state.activeTabIndex) {
    return state;
  }

  const updatedTabs = [...state.tabs];
  const currentTab = updatedTabs[state.activeTabIndex];
  if (currentTab) {
    updatedTabs[state.activeTabIndex] = {
      ...currentTab,
      content: state.currentContent,
      isDirty: state.isDirty,
      undoStack: state.undoStack,
      redoStack: state.redoStack,
    };
  }

  const targetTab = updatedTabs[targetIndex];
  return {
    tabs: updatedTabs,
    activeTabIndex: targetIndex,
    currentContent: targetTab?.content ?? "",
    isDirty: targetTab?.isDirty ?? false,
    undoStack: targetTab?.undoStack ?? [],
    redoStack: targetTab?.redoStack ?? [],
  };
}

function runEditorScanScenario(): PerfScenarioResult {
  const content = buildSyntheticMarkdown(280);
  let lastStats: Record<string, number> = {};
  const durationMs = measureDurationMs(() => {
    for (let i = 0; i < 3; i += 1) {
      lastStats = scanDecorationLikePatterns(content);
    }
  });

  const totalMatches = Object.values(lastStats).reduce((acc, value) => acc + value, 0);
  return {
    id: "editor-decoration-scan",
    description: "Simulates editor markdown decoration scans on large content.",
    durationMs,
    thresholdMs: 220,
    codeRefs: [
      "src/editor/CodeMirrorEditor.tsx",
    ],
    meta: {
      contentKb: 280,
      passCount: 3,
      totalMatches,
    },
  };
}

function runTabSwitchScenario(): PerfScenarioResult {
  const tabCount = 8;
  const switchIterations = 220;
  let state = buildSyntheticTabState(tabCount, 120, 20);
  const durationMs = measureDurationMs(() => {
    for (let i = 0; i < switchIterations; i += 1) {
      const nextIndex = (state.activeTabIndex + 1) % tabCount;
      state = simulateSwitchTab(state, nextIndex);
    }
  });

  return {
    id: "tab-switch-snapshot",
    description: "Simulates tab switching with large in-memory tab snapshots.",
    durationMs,
    thresholdMs: 180,
    codeRefs: [
      "src/stores/useFileStore.ts",
    ],
    meta: {
      tabCount,
      tabContentKb: 120,
      undoDepth: 20,
      switchIterations,
    },
  };
}

function runTabSerializationScenario(): PerfScenarioResult {
  const state = buildSyntheticTabState(8, 120, 20);
  let bytes = 0;
  const durationMs = measureDurationMs(() => {
    for (let i = 0; i < 4; i += 1) {
      bytes = JSON.stringify(state.tabs).length;
    }
  });

  return {
    id: "tab-serialization-size",
    description: "Estimates payload size and serialization cost for tab snapshots.",
    durationMs,
    thresholdMs: 140,
    codeRefs: [
      "src/stores/useFileStore.ts",
      "src/components/layout/TabBar.tsx",
    ],
    meta: {
      tabCount: state.tabs.length,
      approxMb: Number((bytes / 1024 / 1024).toFixed(2)),
      serializePasses: 4,
    },
  };
}

export function runStartupPerfScenarios(): StartupPerfReport {
  const results: PerfScenarioResult[] = [
    runEditorScanScenario(),
    runTabSwitchScenario(),
    runTabSerializationScenario(),
  ];

  return {
    generatedAt: Date.now(),
    results,
  };
}
