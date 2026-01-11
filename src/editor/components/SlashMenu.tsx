/**
 * Slash Command 菜单组件
 * 在编辑器中输入 / 时弹出
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { EditorView } from "@codemirror/view";
import { defaultCommands, hideSlashMenu, SlashCommand, slashMenuField } from "../extensions/slashCommand";

interface SlashMenuProps {
  view: EditorView | null;
}

const categoryLabels: Record<string, string> = {
  ai: "AI",
  heading: "标题",
  list: "列表",
  block: "块",
  insert: "插入",
};

const categoryOrder = ["ai", "heading", "list", "block", "insert"];

export function SlashMenu({ view }: SlashMenuProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [_slashPos, setSlashPos] = useState(0);
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // 过滤命令
  const filteredCommands = useMemo(() => {
    if (!filter) return defaultCommands;
    const lower = filter.toLowerCase();
    return defaultCommands.filter(
      cmd => 
        cmd.label.toLowerCase().includes(lower) ||
        cmd.description.toLowerCase().includes(lower) ||
        cmd.id.toLowerCase().includes(lower)
    );
  }, [filter]);

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

  // 执行命令
  const executeCommand = useCallback((cmd: SlashCommand) => {
    if (!view) return;
    
    // 获取当前的 filter 范围（从 / 到光标）
    const state = view.state.field(slashMenuField);
    const from = state.pos;
    const to = view.state.selection.main.head;
    
    // 执行命令
    cmd.action(view, from, to);
    
    // 关闭菜单
    view.dispatch({ effects: hideSlashMenu.of() });
    setVisible(false);
    view.focus();
  }, [view]);

  // 监听菜单显示事件
  useEffect(() => {
    const handleShow = (e: CustomEvent<{ x: number; y: number; pos: number }>) => {
      setPosition({ x: e.detail.x, y: e.detail.y });
      setSlashPos(e.detail.pos);
      setFilter("");
      setSelectedIndex(0);
      setVisible(true);
    };

    window.addEventListener("slash-menu-show", handleShow as EventListener);
    return () => window.removeEventListener("slash-menu-show", handleShow as EventListener);
  }, []);

  // 监听编辑器状态变化
  useEffect(() => {
    if (!view || !visible) return;

    const checkState = () => {
      const state = view.state.field(slashMenuField, false);
      if (!state?.active) {
        setVisible(false);
        return;
      }
      setFilter(state.filter);
    };

    // 初始检查
    checkState();

    // 通过轮询来检查状态变化
    const interval = setInterval(checkState, 50);
    return () => clearInterval(interval);
  }, [view, visible]);

  // 键盘导航
  useEffect(() => {
    if (!visible || !view) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex(i => (i + 1) % flatCommands.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(i => (i - 1 + flatCommands.length) % flatCommands.length);
          break;
        case "Enter":
          e.preventDefault();
          if (flatCommands[selectedIndex]) {
            executeCommand(flatCommands[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          view.dispatch({ effects: hideSlashMenu.of() });
          setVisible(false);
          view.focus();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, view, flatCommands, selectedIndex, executeCommand]);

  // 点击外部关闭
  useEffect(() => {
    if (!visible) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        view?.dispatch({ effects: hideSlashMenu.of() });
        setVisible(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible, view]);

  // 滚动选中项到可见区域
  useEffect(() => {
    if (!visible || !menuRef.current) return;
    const selected = menuRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, visible]);

  if (!visible || flatCommands.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-background border border-border rounded-lg shadow-lg overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        minWidth: 220,
        maxWidth: 320,
        maxHeight: 320,
      }}
    >
      <div className="overflow-y-auto max-h-[300px] p-1">
        {categoryOrder.map(cat => {
          const commands = groupedCommands[cat];
          if (!commands?.length) return null;
          
          return (
            <div key={cat}>
              <div className="px-2 py-1 text-xs text-muted-foreground font-medium sticky top-0 bg-background">
                {categoryLabels[cat]}
              </div>
              {commands.map(cmd => {
                const globalIndex = flatCommands.indexOf(cmd);
                const isSelected = globalIndex === selectedIndex;
                
                return (
                  <button
                    key={cmd.id}
                    data-selected={isSelected}
                    className={`w-full flex items-center gap-3 px-2 py-1.5 text-left rounded-md transition-colors ${
                      isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
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
      
      {filter && flatCommands.length === 0 && (
        <div className="p-4 text-center text-sm text-muted-foreground">
          未找到命令
        </div>
      )}
    </div>
  );
}
