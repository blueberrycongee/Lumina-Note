/**
 * Slash Command 菜单组件
 * 在编辑器中输入 / 时弹出
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { EditorView } from "@codemirror/view";
import {
  getDefaultCommands,
  getSlashAIActionForCommandId,
  hideSlashMenu,
  runSlashAIAction,
  SlashCommand,
  SlashAIAction,
  slashMenuField,
} from "../extensions/slashCommand";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface SlashMenuProps {
  view: EditorView | null;
}

const categoryOrder = ["ai", "heading", "list", "block", "insert"];
const MENU_WIDTH = 320;
const MENU_MAX_HEIGHT = 320;

export function SlashMenu({ view }: SlashMenuProps) {
  const { t } = useLocaleStore();
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [_slashPos, setSlashPos] = useState(0);
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiPromptText, setAiPromptText] = useState("");
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [aiSlashRange, setAiSlashRange] = useState<{ from: number; to: number } | null>(null);
  const [aiPromptAction, setAiPromptAction] = useState<SlashAIAction | null>(null);
  const [aiPromptCommand, setAiPromptCommand] = useState<SlashCommand | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const aiPromptRef = useRef<HTMLInputElement>(null);
  const commands = useMemo(() => getDefaultCommands(t), [t]);

  const closeMenu = useCallback(() => {
    if (view) {
      view.dispatch({ effects: hideSlashMenu.of() });
      view.focus();
    }
    setAiPromptOpen(false);
    setAiPromptText("");
    setAiSubmitting(false);
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
      setAiPromptAction(aiAction);
      setAiPromptCommand(cmd);
      setAiSlashRange({ from, to });
      return;
    }

    // 执行命令
    cmd.action(view, from, to);
    closeMenu();
  }, [view, closeMenu]);

  const submitAIPrompt = useCallback(async () => {
    if (!view || !aiSlashRange || !aiPromptAction || aiSubmitting) return;
    const request = aiPromptText.trim();
    if (aiPromptAction === "chat-insert" && !request) {
      closeMenu();
      return;
    }
    setAiSubmitting(true);
    await runSlashAIAction(
      view,
      aiSlashRange.from,
      aiSlashRange.to,
      aiPromptAction,
      request,
    );
    closeMenu();
  }, [view, aiSlashRange, aiPromptAction, aiSubmitting, aiPromptText, closeMenu]);

  // 监听菜单显示事件
  useEffect(() => {
    const handleShow = (e: CustomEvent<{ x: number; y: number; pos: number }>) => {
      setPosition({ x: e.detail.x, y: e.detail.y });
      setSlashPos(e.detail.pos);
      setFilter("");
      setSelectedIndex(0);
      setAiPromptOpen(false);
      setAiPromptText("");
      setAiSubmitting(false);
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
        setAiSubmitting(false);
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
        if (e.key === "Escape" && !aiSubmitting) {
          e.preventDefault();
          e.stopPropagation();
          closeMenu();
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
  }, [visible, view, flatCommands, selectedIndex, executeCommand, aiPromptOpen, aiSubmitting, closeMenu]);

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
    if (typeof window === "undefined") {
      return {
        left: position.x,
        top: position.y,
        width: MENU_WIDTH,
      };
    }

    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const width = Math.max(
      1,
      Math.min(MENU_WIDTH, viewportWidth - 16),
    );
    const safeTop = Math.min(
      position.y,
      Math.max(8, viewportHeight - MENU_MAX_HEIGHT - 8),
    );
    const left = Math.min(
      position.x,
      Math.max(8, viewportWidth - width - 8),
    );

    return { left, top: Math.max(8, safeTop), width };
  }, [position.x, position.y]);

  if (!visible || flatCommands.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-popover border border-border rounded-lg shadow-elev-2 overflow-hidden"
      style={{
        left: clampedPosition.left,
        top: clampedPosition.top,
        width: clampedPosition.width,
        maxHeight: MENU_MAX_HEIGHT,
      }}
    >
      {aiPromptOpen ? (
        <div className="p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            {aiPromptCommand?.label ?? t.editor.slashMenu.commands.aiChat}
          </div>
          <input
            ref={aiPromptRef}
            value={aiPromptText}
            onChange={(e) => setAiPromptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitAIPrompt();
              }
              if (e.key === "Escape" && !aiSubmitting) {
                e.preventDefault();
                closeMenu();
              }
            }}
            disabled={aiSubmitting}
            placeholder={aiPromptAction === "chat-insert"
              ? t.editor.slashMenu.commands.aiChatPrompt
              : aiPromptCommand?.description}
            className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="h-8 px-2 rounded-md text-xs border border-border hover:bg-accent/60 disabled:opacity-60"
              disabled={aiSubmitting}
              onClick={closeMenu}
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              className="h-8 px-2 rounded-md text-xs bg-primary text-primary-foreground disabled:opacity-60"
              disabled={aiSubmitting || (aiPromptAction === "chat-insert" && !aiPromptText.trim())}
              onClick={() => void submitAIPrompt()}
            >
              {aiSubmitting ? t.common.loading : t.common.confirm}
            </button>
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
