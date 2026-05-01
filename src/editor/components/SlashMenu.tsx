/**
 * Slash Command 菜单组件
 * 在编辑器中输入 / 时弹出
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { EditorView } from "@codemirror/view";
import { Check, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applySlashAIResult,
  getDefaultCommands,
  getSlashAIActionForCommandId,
  hideSlashMenu,
  runSlashAIAction,
  SlashCommand,
  SlashAIAction,
  SlashAIAbortError,
  SlashAIResult,
  SlashAIStageId,
  SlashAIProgress,
  slashMenuField,
} from "../extensions/slashCommand";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface SlashMenuProps {
  view: EditorView | null;
}

const categoryOrder = ["ai", "heading", "list", "block", "insert"];
const MENU_WIDTH = 320;
const MENU_MAX_HEIGHT = 320;
const AI_PANEL_WIDTH = 380;
const AI_PANEL_MAX_HEIGHT = 520;

type AIPanelStatus = "prompt" | "running" | "preview" | "error";
type AIPanelStageStatus = "pending" | SlashAIProgress["status"];

const aiStageOrder: SlashAIStageId[] = [
  "understanding",
  "reading-context",
  "preparing-context",
  "generating",
  "ready",
];

function createInitialAIStages(): Record<SlashAIStageId, AIPanelStageStatus> {
  return {
    understanding: "active",
    "reading-context": "pending",
    "preparing-context": "pending",
    generating: "pending",
    ready: "pending",
  };
}

export function SlashMenu({ view }: SlashMenuProps) {
  const { t } = useLocaleStore();
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [_slashPos, setSlashPos] = useState(0);
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiPromptText, setAiPromptText] = useState("");
  const [aiStatus, setAiStatus] = useState<AIPanelStatus>("prompt");
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [aiStages, setAiStages] = useState<Record<SlashAIStageId, AIPanelStageStatus>>(
    () => createInitialAIStages(),
  );
  const [aiResult, setAiResult] = useState<SlashAIResult | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiSlashRange, setAiSlashRange] = useState<{ from: number; to: number } | null>(null);
  const [aiPromptAction, setAiPromptAction] = useState<SlashAIAction | null>(null);
  const [aiPromptCommand, setAiPromptCommand] = useState<SlashCommand | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const aiPromptRef = useRef<HTMLTextAreaElement>(null);
  const aiAbortControllerRef = useRef<AbortController | null>(null);
  const commands = useMemo(() => getDefaultCommands(t), [t]);
  const inlineAI = t.editor.slashMenu.inlineAI;
  const aiStatusLabel =
    aiStatus === "running"
      ? inlineAI.generating
      : aiStatus === "preview"
        ? inlineAI.previewTitle
        : aiStatus === "error"
          ? inlineAI.errorTitle
          : inlineAI.generate;

  const closeMenu = useCallback(() => {
    aiAbortControllerRef.current?.abort();
    aiAbortControllerRef.current = null;
    if (view) {
      view.dispatch({ effects: hideSlashMenu.of() });
      view.focus();
    }
    setAiPromptOpen(false);
    setAiPromptText("");
    setAiStatus("prompt");
    setAiSubmitting(false);
    setAiStages(createInitialAIStages());
    setAiResult(null);
    setAiError("");
    setAiSlashRange(null);
    setAiPromptAction(null);
    setAiPromptCommand(null);
    setVisible(false);
  }, [view]);

  // 过滤命令
  const filteredCommands = useMemo(() => {
    if (!filter) return commands;
    const lower = filter.toLowerCase();
    return commands.filter(
      cmd =>
        cmd.label.toLowerCase().includes(lower) ||
        cmd.description.toLowerCase().includes(lower) ||
        cmd.id.toLowerCase().includes(lower)
    );
  }, [filter, commands]);

  // 按类别分组
  const groupedCommands = useMemo(() => {
    const groups: Record<string, SlashCommand[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  // 扁平化用于键盘导航
  const flatCommands = useMemo(() => {
    const result: SlashCommand[] = [];
    for (const cat of categoryOrder) {
      if (groupedCommands[cat]) {
        result.push(...groupedCommands[cat]);
      }
    }
    return result;
  }, [groupedCommands]);

  useEffect(() => {
    setSelectedIndex((index) => {
      if (flatCommands.length === 0) return 0;
      return Math.min(index, flatCommands.length - 1);
    });
  }, [flatCommands.length]);

  // 执行命令
  const executeCommand = useCallback((cmd: SlashCommand) => {
    if (!view) return;

    // 获取当前的 filter 范围（从 / 到光标）
    const state = view.state.field(slashMenuField);
    const from = state.pos;
    const to = view.state.selection.main.head;

    const aiAction = getSlashAIActionForCommandId(cmd.id);
    if (aiAction) {
      setAiPromptOpen(true);
      setAiPromptText("");
      setAiStatus("prompt");
      setAiSubmitting(false);
      setAiStages(createInitialAIStages());
      setAiResult(null);
      setAiError("");
      setAiPromptAction(aiAction);
      setAiPromptCommand(cmd);
      setAiSlashRange({ from, to });
      return;
    }

    // 执行命令
    cmd.action(view, from, to);
    closeMenu();
  }, [view, closeMenu]);

  const startAIGeneration = useCallback(async () => {
    if (!view || !aiSlashRange || !aiPromptAction || aiSubmitting) return;
    const request = aiPromptText.trim();
    if (aiPromptAction === "chat-insert" && !request) {
      setAiStatus("error");
      setAiError(inlineAI.promptRequired);
      return;
    }
    const range = aiSlashRange;
    setAiSlashRange({ from: range.from, to: range.from });
    setAiResult(null);
    setAiError("");
    setAiStages(createInitialAIStages());
    setAiStatus("running");
    setAiSubmitting(true);
    const abortController = new AbortController();
    aiAbortControllerRef.current = abortController;
    try {
      const result = await runSlashAIAction(
        view,
        range.from,
        range.to,
        aiPromptAction,
        request,
        {
          signal: abortController.signal,
          onProgress: (progress) => {
            setAiStages((current) => ({
              ...current,
              [progress.stage]: progress.status,
            }));
          },
        },
      );
      if (!result || abortController.signal.aborted) return;
      setAiResult(result);
      setAiStatus("preview");
      setAiStages((current) => ({
        ...current,
        generating: current.generating === "error" ? "error" : "done",
        ready: "done",
      }));
    } catch (error) {
      if (error instanceof SlashAIAbortError || abortController.signal.aborted) {
        return;
      }
      setAiStatus("error");
      setAiError(error instanceof Error ? error.message : inlineAI.genericError);
    } finally {
      if (aiAbortControllerRef.current === abortController) {
        aiAbortControllerRef.current = null;
      }
      setAiSubmitting(false);
    }
  }, [
    view,
    aiSlashRange,
    aiPromptAction,
    aiSubmitting,
    aiPromptText,
    inlineAI.promptRequired,
    inlineAI.genericError,
  ]);

  const acceptAIResult = useCallback(() => {
    if (!view || !aiResult) return;
    applySlashAIResult(view, aiResult);
    closeMenu();
  }, [view, aiResult, closeMenu]);

  // 监听菜单显示事件
  useEffect(() => {
    const handleShow = (e: CustomEvent<{ x: number; y: number; pos: number }>) => {
      setPosition({ x: e.detail.x, y: e.detail.y });
      setSlashPos(e.detail.pos);
      setFilter("");
      setSelectedIndex(0);
      setAiPromptOpen(false);
      setAiPromptText("");
      setAiStatus("prompt");
      setAiSubmitting(false);
      setAiStages(createInitialAIStages());
      setAiResult(null);
      setAiError("");
      setAiSlashRange(null);
      setAiPromptAction(null);
      setAiPromptCommand(null);
      setVisible(true);
    };

    window.addEventListener("slash-menu-show", handleShow as EventListener);
    return () => window.removeEventListener("slash-menu-show", handleShow as EventListener);
  }, []);

  // 监听编辑器状态变化（事件驱动，避免轮询）
  useEffect(() => {
    const handleState = (e: CustomEvent<{ active: boolean; filter: string }>) => {
      if (!e.detail.active) {
        if (aiPromptOpen) {
          return;
        }
        setVisible(false);
        setAiPromptOpen(false);
        setAiPromptText("");
        setAiStatus("prompt");
        setAiSubmitting(false);
        setAiStages(createInitialAIStages());
        setAiResult(null);
        setAiError("");
        setAiSlashRange(null);
        setAiPromptAction(null);
        setAiPromptCommand(null);
        return;
      }
      if (aiPromptOpen) {
        return;
      }
      setFilter(e.detail.filter);
    };

    window.addEventListener("slash-menu-state", handleState as EventListener);
    return () => window.removeEventListener("slash-menu-state", handleState as EventListener);
  }, [aiPromptOpen]);

  // 键盘导航
  useEffect(() => {
    if (!visible || !view) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (aiPromptOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closeMenu();
        }
        if (e.key === "Enter" && aiStatus === "preview" && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          acceptAIResult();
        }
        return;
      }
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          if (flatCommands.length > 0) {
            setSelectedIndex(i => (i + 1) % flatCommands.length);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          if (flatCommands.length > 0) {
            setSelectedIndex(i => (i - 1 + flatCommands.length) % flatCommands.length);
          }
          break;
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          if (flatCommands[selectedIndex]) {
            executeCommand(flatCommands[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          closeMenu();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    visible,
    view,
    flatCommands,
    selectedIndex,
    executeCommand,
    aiPromptOpen,
    aiStatus,
    acceptAIResult,
    closeMenu,
  ]);

  // 点击外部关闭
  useEffect(() => {
    if (!visible) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible, closeMenu]);

  useEffect(() => {
    if (!aiPromptOpen) return;
    aiPromptRef.current?.focus();
  }, [aiPromptOpen]);

  // 滚动选中项到可见区域
  useEffect(() => {
    if (!visible || !menuRef.current) return;
    const selected = menuRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, visible]);

  const clampedPosition = useMemo(() => {
    const desiredWidth = aiPromptOpen ? AI_PANEL_WIDTH : MENU_WIDTH;
    const desiredMaxHeight = aiPromptOpen ? AI_PANEL_MAX_HEIGHT : MENU_MAX_HEIGHT;
    if (typeof window === "undefined") {
      return {
        left: position.x,
        top: position.y,
        width: desiredWidth,
        maxHeight: desiredMaxHeight,
      };
    }

    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const width = Math.max(
      1,
      Math.min(desiredWidth, viewportWidth - 16),
    );
    const maxHeight = Math.max(
      180,
      Math.min(desiredMaxHeight, viewportHeight - 16),
    );
    const safeTop = Math.min(
      position.y,
      Math.max(8, viewportHeight - maxHeight - 8),
    );
    const left = Math.min(
      position.x,
      Math.max(8, viewportWidth - width - 8),
    );

    return { left, top: Math.max(8, safeTop), width, maxHeight };
  }, [aiPromptOpen, position.x, position.y]);

  if (!visible || flatCommands.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className={cn(
        "fixed z-50 overflow-hidden border bg-popover text-popover-foreground",
        aiPromptOpen
          ? "rounded-ui-xl border-border/70 bg-popover/95 shadow-elev-3 backdrop-blur"
          : "rounded-lg border-border shadow-elev-2",
      )}
      style={{
        left: clampedPosition.left,
        top: clampedPosition.top,
        width: clampedPosition.width,
        maxHeight: clampedPosition.maxHeight,
      }}
    >
      {aiPromptOpen ? (
        <div className="max-h-[inherit] overflow-y-auto">
          <div className="border-b border-border/60 bg-muted/20 px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-ui-md border border-primary/15 bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium leading-5">
                    {aiPromptCommand?.label ?? t.editor.slashMenu.commands.aiChat}
                  </div>
                  <div className="mt-0.5 text-xs leading-4 text-muted-foreground">
                    {inlineAI.panelHint}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="hidden rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
                  {aiStatusLabel}
                </span>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-ui-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
                  onClick={closeMenu}
                  aria-label={t.common.close}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-3.5">
            <div className="rounded-ui-lg border border-border/70 bg-background/70 shadow-inner transition-colors focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/10">
              <textarea
                ref={aiPromptRef}
                value={aiPromptText}
                onChange={(e) => {
                  setAiPromptText(e.target.value);
                  if (aiStatus === "error") {
                    setAiError("");
                    setAiStatus("prompt");
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && aiStatus !== "preview") {
                    e.preventDefault();
                    void startAIGeneration();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    closeMenu();
                  }
                }}
                disabled={aiSubmitting || aiStatus === "preview"}
                placeholder={aiPromptAction === "chat-insert"
                  ? t.editor.slashMenu.commands.aiChatPrompt
                  : inlineAI.optionalGuidance}
                className="max-h-28 min-h-16 w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/65 disabled:opacity-70"
              />
            </div>

            {(aiStatus === "running" || aiStatus === "preview") && (
              <div className="mt-3 rounded-ui-lg border border-border/60 bg-muted/15 px-3 py-2.5">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  {inlineAI.progressTitle}
                </div>
                <div className="space-y-1.5">
                  {aiStageOrder.map((stage) => {
                    const status = aiStages[stage];
                    return (
                      <div
                        key={stage}
                        className={cn(
                          "flex items-center gap-2 text-xs leading-5 transition-colors",
                          status === "pending" ? "text-muted-foreground/55" : "text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-full border",
                            status === "done" && "border-primary/50 bg-primary/10 text-primary",
                            status === "active" && "border-primary/40 bg-background text-primary",
                            status === "error" && "border-destructive/50 bg-destructive/10 text-destructive",
                            status === "pending" && "border-border/70 bg-background/50 text-muted-foreground",
                          )}
                        >
                          {status === "done" ? (
                            <Check className="h-3 w-3" aria-hidden="true" />
                          ) : status === "active" ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-45" />
                          )}
                        </span>
                        <span>{inlineAI.stages[stage]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {aiStatus === "preview" && aiResult && (
              <div className="mt-3 overflow-hidden rounded-ui-lg border border-border/70 bg-background/80">
                <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {inlineAI.previewTitle}
                  </div>
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/60" aria-hidden="true" />
                </div>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap px-3 py-3 text-sm leading-relaxed text-foreground">
                  {aiResult.text}
                </pre>
              </div>
            )}

            {aiStatus === "error" && aiError && (
              <div className="mt-3 rounded-ui-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                <div className="font-medium">{inlineAI.errorTitle}</div>
                <div className="mt-0.5 text-xs opacity-90">{aiError}</div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/10 px-3.5 py-3">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-ui-md border border-border/70 bg-background/60 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
              onClick={closeMenu}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {t.common.cancel}
            </button>
            <div className="flex items-center gap-2">
              {(aiStatus === "preview" || aiStatus === "error") && (
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-ui-md border border-border/70 bg-background/60 px-2.5 text-xs transition-colors hover:bg-accent/70 disabled:opacity-60"
                  disabled={aiSubmitting || (aiPromptAction === "chat-insert" && !aiPromptText.trim())}
                  onClick={() => void startAIGeneration()}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {aiStatus === "error" ? inlineAI.retry : inlineAI.regenerate}
                </button>
              )}
              {aiStatus === "preview" ? (
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-ui-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-elev-1 transition-opacity disabled:opacity-60"
                  disabled={!aiResult}
                  onClick={acceptAIResult}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {inlineAI.insert}
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-ui-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-elev-1 transition-opacity disabled:opacity-60"
                  disabled={aiSubmitting || (aiPromptAction === "chat-insert" && !aiPromptText.trim())}
                  onClick={() => void startAIGeneration()}
                >
                  {aiSubmitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {aiSubmitting ? inlineAI.generating : inlineAI.generate}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-y-auto max-h-[300px] p-1">
        {categoryOrder.map(cat => {
          const categoryCommands = groupedCommands[cat];
          if (!categoryCommands?.length) return null;

          return (
            <div key={cat}>
              <div className="px-2 py-1 text-xs text-muted-foreground font-medium sticky top-0 bg-background">
                {t.editor.slashMenu.categories[cat as keyof typeof t.editor.slashMenu.categories] || cat}
              </div>
              {categoryCommands.map(cmd => {
                const globalIndex = flatCommands.indexOf(cmd);
                const isSelected = globalIndex === selectedIndex;

                return (
                  <button
                    key={cmd.id}
                    data-selected={isSelected}
                    className={`w-full flex items-center gap-3 px-2 py-1.5 text-left rounded-md transition-colors ${isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                      }`}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                  >
                    <span className="w-6 h-6 flex items-center justify-center text-sm bg-muted rounded">
                      {cmd.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{cmd.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{cmd.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
        </div>
      )}

      {filter && flatCommands.length === 0 && (
        <div className="p-4 text-center text-sm text-muted-foreground">
          {t.editor.slashMenu.noCommands}
        </div>
      )}
    </div>
  );
}
