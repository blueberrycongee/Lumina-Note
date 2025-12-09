/**
 * 选中文本浮动工具栏
 * 当用户在编辑器中选中文字时显示，提供 "Add to Chat" 功能
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquarePlus, Video, Sparkles } from "lucide-react";
import { useAIStore } from "@/stores/useAIStore";
import { useFileStore } from "@/stores/useFileStore";
import { callLLM, type Message } from '@/services/llm';
import { useLocaleStore } from '@/stores/useLocaleStore';

interface SelectionToolbarProps {
  containerRef: React.RefObject<HTMLElement>;
}

export function SelectionToolbar({ containerRef }: SelectionToolbarProps) {
  const { t } = useLocaleStore();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isTodoing, setIsTodoing] = useState(false);
  const { addTextSelection } = useAIStore();
  const { currentFile, openVideoNoteFromContent } = useFileStore();

  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setPosition(null);
      setSelectedText("");
      return;
    }

    // 检查选区是否在容器内
    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setPosition(null);
      setSelectedText("");
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      setPosition(null);
      return;
    }

    setSelectedText(text);

    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const scrollTop = container.scrollTop;
    const scrollLeft = container.scrollLeft;

    // 优先用真实宽高，其次退回估算值
    const approxWidth = 160;
    const approxHeight = 32;
    const toolbarWidth = toolbarRef.current?.offsetWidth || approxWidth;
    const toolbarHeight = toolbarRef.current?.offsetHeight || approxHeight;

    const padding = 8; // 与选区/边界的间距

    // 基于容器坐标系的选区中心
    const selectionCenterY = rect.top - containerRect.top + scrollTop + rect.height / 2;

    let x = 0;
    let y = selectionCenterY - toolbarHeight / 2;

    const containerRight = scrollLeft + containerRect.width;

    // 1. 优先尝试放在右侧
    const rightX = rect.right - containerRect.left + scrollLeft + padding;
    if (rightX + toolbarWidth + padding <= containerRight) {
      x = rightX;
    } else {
      // 2. 右侧放不下，尝试左侧
      const leftX = rect.left - containerRect.left + scrollLeft - toolbarWidth - padding;
      if (leftX >= scrollLeft + padding) {
        x = leftX;
      } else {
        // 3. 左右都不行，放到选区上方，水平靠左对齐选区
        x = Math.max(scrollLeft + padding, rect.left - containerRect.left + scrollLeft);
        y = rect.top - containerRect.top + scrollTop - toolbarHeight - padding;
      }
    }

    // 垂直边界修正
    const viewportTop = scrollTop + padding;
    const viewportBottom = scrollTop + containerRect.height - toolbarHeight - padding;
    y = Math.max(viewportTop, Math.min(y, viewportBottom));

    setPosition({ x, y });
  }, [containerRef]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [handleSelectionChange]);

  // 点击外部时隐藏
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-selection-toolbar]")) {
        // 延迟隐藏，让按钮点击事件先执行
        setTimeout(() => {
          const selection = window.getSelection();
          if (!selection || selection.isCollapsed) {
            setPosition(null);
          }
        }, 100);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const handleAddToChat = () => {
    if (!selectedText) return;
    
    // 获取当前文件名
    const fileName = currentFile 
      ? currentFile.split(/[/\\]/).pop()?.replace(".md", "") || "未知"
      : "未知";
    
    addTextSelection(selectedText, fileName, currentFile || undefined);
    
    // 清除选区
    window.getSelection()?.removeAllRanges();
    setPosition(null);
    setSelectedText("");
  };

  const handleTranslate = async () => {
    const text = selectedText.trim();
    if (!text || isTranslating) return;

    setIsTranslating(true);
    try {
      const messages: Message[] = [
        {
          role: "system",
          content:
            "你是一个翻译助手。",
        },
        {
          role: "user",
          content: `原文：
${text}

要求：根据原文主要语言，在中英文之间互译。如果原文主要是中文则翻译成自然流畅的英文；如果主要是英文则翻译成自然流畅的中文。只返回译文本身，使用合适的分行，不要解释。`,
        },
      ];

      const response = await callLLM(messages, { temperature: 0.3 });
      const raw = (response.content || "").trim();
      if (!raw) return;

      const lines = raw.split("\n");
      const calloutBody = lines
        .map((line) => {
          const trimmed = line.trim();
          return trimmed ? `> ${trimmed}` : ">";
        })
        .join("\n");

      const calloutBlock = `\n\n> [!info] 翻译\n${calloutBody}\n\n`;

      window.dispatchEvent(
        new CustomEvent("selection-ai-edit", {
          detail: {
            mode: "append_callout",
            text: calloutBlock,
            description: "选区翻译",
          },
        })
      );

      window.getSelection()?.removeAllRanges();
      setPosition(null);
      setSelectedText("");
    } catch (error) {
      console.error("Failed to translate selection:", error);
      alert("翻译失败，请检查 AI 设置或稍后再试。");
    } finally {
      setIsTranslating(false);
    }
  };

  const handlePolish = async () => {
    const text = selectedText.trim();
    if (!text || isPolishing) return;

    setIsPolishing(true);
    try {
      const messages: Message[] = [
        {
          role: "system",
          content:
            "你是一个写作润色助手。",
        },
        {
          role: "user",
          content: `原文：
${text}

要求：在保持原意不变的前提下，优化文本。提高表达清晰度和流畅度，修正语法和用词问题，语言保持与原文一致（中文就用中文，英文就用英文）。只返回润色后的文本，不要解释。`,
        },
      ];

      const response = await callLLM(messages, { temperature: 0.4 });
      const polished = (response.content || "").trim();
      if (!polished) return;

      window.dispatchEvent(
        new CustomEvent("selection-ai-edit", {
          detail: {
            mode: "replace_selection",
            text: polished,
            description: "选区润色",
          },
        })
      );

      window.getSelection()?.removeAllRanges();
      setPosition(null);
      setSelectedText("");
    } catch (error) {
      console.error("Failed to polish selection:", error);
      alert("润色失败，请检查 AI 设置或稍后再试。");
    } finally {
      setIsPolishing(false);
    }
  };

  const handleTodo = async () => {
    const text = selectedText.trim();
    if (!text || isTodoing) return;

    setIsTodoing(true);
    try {
      const messages: Message[] = [
        {
          role: "system",
          content:
            "你是一个任务提取助手。",
        },
        {
          role: "user",
          content: `文本内容：
${text}

要求：从上述文本中提取清晰、可执行的待办事项，输出 Markdown 任务列表，每一项使用 \`- [ ]\` 开头；如果没有合理的待办事项，请输出一条 \`- [ ] 暂无明确待办\`。只返回任务列表，不要解释。`,
        },
      ];

      const response = await callLLM(messages, { temperature: 0.2 });
      const raw = (response.content || "").trim();
      if (!raw) return;

      const lines = raw.split("\n");
      const calloutBody = lines
        .map((line) => {
          const trimmed = line.trim();
          return trimmed ? `> ${trimmed}` : ">";
        })
        .join("\n");

      const calloutBlock = `\n\n> [!tip] 待办清单\n${calloutBody}\n\n`;

      window.dispatchEvent(
        new CustomEvent("selection-ai-edit", {
          detail: {
            mode: "append_callout",
            text: calloutBlock,
            description: "生成待办清单",
          },
        })
      );

      window.getSelection()?.removeAllRanges();
      setPosition(null);
      setSelectedText("");
    } catch (error) {
      console.error("Failed to generate todos from selection:", error);
      alert("生成待办清单失败，请检查 AI 设置或稍后再试。");
    } finally {
      setIsTodoing(false);
    }
  };

  const handleSummarize = async () => {
    const text = selectedText.trim();
    if (!text || isSummarizing) return;

    setIsSummarizing(true);
    try {
      const messages: Message[] = [
        {
          role: "system",
          content:
            "你是一个笔记助手。",
        },
        {
          role: "user",
          content: `文本内容：
${text}

要求：对上述文本生成简洁的要点式总结，使用中文，输出为 Markdown 列表，不要额外解释。`,
        },
      ];

      const response = await callLLM(messages, { temperature: 0.3 });
      const raw = (response.content || "").trim();
      if (!raw) {
        setIsSummarizing(false);
        return;
      }

      // 将总结内容包装为 Obsidian callout
      const lines = raw.split("\n");
      const calloutBody = lines
        .map((line) => {
          const trimmed = line.trim();
          return trimmed ? `> ${trimmed}` : ">";
        })
        .join("\n");

      const calloutBlock = `\n\n> [!summary] 总结\n${calloutBody}\n\n`;

      // 通过事件交给编辑器，由编辑器构造 diff
      window.dispatchEvent(
        new CustomEvent("selection-ai-edit", {
          detail: {
            mode: "append_callout",
            text: calloutBlock,
            description: "选区总结",
          },
        })
      );

      // 清除选区并隐藏工具栏（编辑内容在 Diff 中预览）
      window.getSelection()?.removeAllRanges();
      setPosition(null);
      setSelectedText("");
    } catch (error) {
      console.error("Failed to summarize selection:", error);
      alert("生成总结失败，请检查 AI 设置或稍后再试。");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleOpenAsVideoNote = () => {
    if (!selectedText.trim()) return;

    // 直接利用现有解析逻辑：允许用户选中完整的视频笔记 Markdown 段落
    // 若解析失败，底层会降级为普通空视频标签
    openVideoNoteFromContent(selectedText, "视频笔记");

    window.getSelection()?.removeAllRanges();
    setPosition(null);
    setSelectedText("");
  };

  if (!position || !selectedText) return null;

  return (
    <div
      data-selection-toolbar
      className="absolute z-50 transform -translate-y-1/2"
      ref={toolbarRef}
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div className="flex items-center gap-0.5 px-1.5 py-1 bg-background border border-border rounded-lg shadow-lg">
        <button
          onClick={handleAddToChat}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent rounded transition-colors whitespace-nowrap"
          title={t.selectionToolbar.addToChat}
        >
          <MessageSquarePlus size={13} />
          <span>Add to Chat</span>
        </button>
        <button
          onClick={handleSummarize}
          disabled={isSummarizing}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent rounded transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-wait"
          title={t.selectionToolbar.selectionSummary}
        >
          <Sparkles size={13} className={isSummarizing ? "animate-spin" : ""} />
          <span>Summary</span>
        </button>
        <button
          onClick={handleTranslate}
          disabled={isTranslating}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent rounded transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-wait"
          title={t.selectionToolbar.selectionTranslate}
        >
          <span className={isTranslating ? "animate-spin" : ""}>译</span>
          <span>Translate</span>
        </button>
        <button
          onClick={handlePolish}
          disabled={isPolishing}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent rounded transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-wait"
          title={t.selectionToolbar.selectionPolish}
        >
          <span className={isPolishing ? "animate-spin" : ""}>✎</span>
          <span>Polish</span>
        </button>
        <button
          onClick={handleTodo}
          disabled={isTodoing}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent rounded transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-wait"
          title={t.selectionToolbar.generateTodo}
        >
          <span className={isTodoing ? "animate-spin" : ""}>☑</span>
          <span>Todos</span>
        </button>
        <button
          onClick={handleOpenAsVideoNote}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent rounded transition-colors whitespace-nowrap"
          title={t.selectionToolbar.videoNote}
        >
          <Video size={13} />
          <span>Video Note</span>
        </button>
      </div>
      {/* 左侧小三角指向选中文字 */}
      <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-border" />
    </div>
  );
}
