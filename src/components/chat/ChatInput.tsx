/**
 * 聊天输入框组件
 * 支持 @ 引用文件和 📎 按钮选择文件
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useAIStore } from "@/stores/useAIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { Send, FileText, Folder, X, Loader2, Paperclip, Quote, Image as ImageIcon, AlertCircle, Terminal, Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverEmpty,
  PopoverHeader,
  PopoverList,
  Row,
} from "@/components/ui";
import { useCommandStore, SlashCommand } from "@/stores/useCommandStore";
import { CommandManagerModal } from "./CommandManagerModal";
import { listOpencodeSkills } from "@/services/opencode/skills";
import {
  filterMentionFiles,
  flattenFileTreeToReferences,
  parseMentionQueryAtCursor,
} from "./fileMentionUtils";
import { isIMEComposing } from "@/lib/imeUtils";
import type { ReferencedFile } from "@/hooks/useChatSend";
import type { AttachedImage } from "@/types/chat";
import type { QuoteReference } from "@/types/chat";

export interface ChatInputRef {
  send: () => void;
  getReferencedFiles: () => ReferencedFile[];
  getAttachedImages: () => AttachedImage[];
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string, files: ReferencedFile[], images?: AttachedImage[], quotedSelections?: QuoteReference[]) => void;
  onCanSendChange?: (canSend: boolean) => void;
  isLoading?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  hideSendButton?: boolean;
  supportsVision?: boolean; // 当前模型是否支持图片
  enableSlashCommands?: boolean; // 是否启用斜杠命令
}

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(({
  value,
  onChange,
  onSend,
  onCanSendChange,
  isLoading = false,
  isStreaming = false,
  onStop,
  placeholder,
  className,
  rows = 2,
  hideSendButton = false,
  supportsVision = true,
  enableSlashCommands = true,
}, ref) => {
  const { t } = useLocaleStore();
  const fileTree = useFileStore((state) => state.fileTree);
  const defaultPlaceholder = placeholder || t.ai.inputPlaceholder;
  const { textSelections, removeTextSelection, clearTextSelections } = useAIStore();
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [referencedFiles, setReferencedFiles] = useState<ReferencedFile[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState("");
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);

  // Slash Command 状态
  const { commands, registerCommand, updateCommand, deleteCommand } = useCommandStore();
  const [showCommand, setShowCommand] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const [activeCommand, setActiveCommand] = useState<SlashCommand | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<SlashCommand | null>(null);

  // Fetch opencode-discovered skills (Lumina built-ins + vault + global)
  // and surface them as slash commands so the user can invoke a skill's
  // playbook via /<skill-name>. The opencode `skill` tool is what drives
  // actual skill loading at agent runtime — this is a UX shortcut for
  // pasting the playbook into the user's prompt directly.
  const [skillCommands, setSkillCommands] = useState<SlashCommand[]>([]);
  useEffect(() => {
    if (!enableSlashCommands) return;
    let cancelled = false;
    (async () => {
      try {
        const skills = await listOpencodeSkills();
        if (cancelled) return;
        setSkillCommands(
          skills
            .filter((s) => !!s.content)
            .map((s) => ({
              id: `skill:${s.name}`,
              key: s.name,
              description: s.description,
              prompt: s.content,
              isDefault: false,
            })),
        );
      } catch {
        /* opencode server not ready yet — no skills available right now */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enableSlashCommands]);

  const allCommands = useMemo(
    () => {
      const cmdKeys = new Set(commands.map((c) => c.key));
      return [...commands, ...skillCommands.filter((s) => !cmdKeys.has(s.key))];
    },
    [commands, skillCommands],
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const commandRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Anchor refs for the three Popovers. The @ and / menus anchor to the
  // input bar so they sit visually below/above whatever the user typed; the
  // file picker anchors to its own paperclip button.
  const inputBarRef = useRef<HTMLDivElement>(null);
  const filePickerButtonRef = useRef<HTMLButtonElement>(null);

  // 监听文件拖拽事件，支持从文件树拖拽文件引用
  useEffect(() => {
    // 添加文件引用的通用函数
    const addFileRef = (filePath: string, fileName: string) => {
      setReferencedFiles(prev => {
        if (prev.some(f => f.path === filePath)) return prev;
        return [...prev, { path: filePath, name: fileName, isFolder: false }];
      });
      textareaRef.current?.focus();
    };

    // 直接拖拽到输入框区域
    const handleLuminaDrop = (e: Event) => {
      const { filePath, fileName, x, y } = (e as CustomEvent).detail;
      if (!filePath || !fileName) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;

      addFileRef(filePath, fileName);
    };

    // Handle file drops forwarded by the panel container.
    const handlePanelFileDrop = (e: Event) => {
      const { filePath, fileName } = (e as CustomEvent).detail;
      if (!filePath || !fileName) return;
      addFileRef(filePath, fileName);
    };

    window.addEventListener('lumina-drop', handleLuminaDrop);
    window.addEventListener('chat-input-file-drop', handlePanelFileDrop);
    return () => {
      window.removeEventListener('lumina-drop', handleLuminaDrop);
      window.removeEventListener('chat-input-file-drop', handlePanelFileDrop);
    };
  }, []);

  // 处理图片粘贴
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          processImageFile(file);
        }
        break;
      }
    }
  }, []);

  // 处理图片文件
  const processImageFile = useCallback((file: File) => {
    if (!supportsVision) {
      console.warn(t.ai.modelNoVision);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      const mediaType = file.type as AttachedImage['mediaType'];

      const newImage: AttachedImage = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        data: base64,
        mediaType,
        preview: dataUrl,
      };

      setAttachedImages(prev => [...prev, newImage]);
    };
    reader.readAsDataURL(file);
  }, [supportsVision, t.ai.modelNoVision]);

  // 处理图片选择
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        processImageFile(file);
      }
    }
    // 清空 input 以便重复选择同一文件
    e.target.value = '';
  }, [processImageFile]);

  // 移除附加的图片
  const removeImage = useCallback((id: string) => {
    setAttachedImages(prev => prev.filter(img => img.id !== id));
  }, []);

  // 获取所有文件和文件夹
  const allFiles = React.useMemo(() => flattenFileTreeToReferences(fileTree), [fileTree]);

  // 文件选择器过滤的文件
  const pickerFilteredFiles = React.useMemo(() => {
    if (!filePickerQuery) {
      return allFiles.slice(0, 20);
    }
    const query = filePickerQuery.toLowerCase();
    return allFiles
      .filter(f => f.name.toLowerCase().includes(query))
      .slice(0, 20);
  }, [allFiles, filePickerQuery]);

  // 过滤匹配的文件（@ 提及用）
  const filteredFiles = React.useMemo(
    () => filterMentionFiles(allFiles, mentionQuery),
    [allFiles, mentionQuery],
  );

  // 过滤匹配的命令
  const filteredCommands = useMemo(() => {
    if (!commandQuery) return allCommands;
    const query = commandQuery.toLowerCase();
    return allCommands.filter(c => c.key.toLowerCase().includes(query));
  }, [allCommands, commandQuery]);

  // 处理输入变化
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // 检测 @ 符号
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const mention = parseMentionQueryAtCursor(newValue, cursorPos);

    if (mention !== null) {
      setShowMention(true);
      setMentionQuery(mention);
      setMentionIndex(0);
      setShowCommand(false);
    } else {
      setShowMention(false);
      setMentionQuery("");
    }

    // 检测 / 符号 (仅在行首或空格后)
    if (enableSlashCommands) {
      const slashMatch = textBeforeCursor.match(/(?:^|\s)\/([^\s/]*)$/);
      if (slashMatch) {
        setShowCommand(true);
        setCommandQuery(slashMatch[1]);
        setCommandIndex(0);
        setShowMention(false);
      } else {
        setShowCommand(false);
        setCommandQuery("");
      }
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 输入法组合期间，忽略所有快捷键（如 Enter 确认候选词）
    if (isIMEComposing(e)) return;

    if (showMention) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filteredFiles.length > 0) {
          setMentionIndex(i => (i + 1) % filteredFiles.length);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (filteredFiles.length > 0) {
          setMentionIndex(i => (i - 1 + filteredFiles.length) % filteredFiles.length);
        }
      } else if ((e.key === "Enter" || e.key === "Tab") && filteredFiles.length > 0) {
        e.preventDefault();
        selectMention(filteredFiles[mentionIndex]);
      } else if (e.key === "Escape") {
        setShowMention(false);
      }
    } else if (showCommand) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filteredCommands.length > 0) {
          setCommandIndex(i => (i + 1) % filteredCommands.length);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (filteredCommands.length > 0) {
          setCommandIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length);
        }
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filteredCommands.length > 0) {
          e.preventDefault();
          const selected = filteredCommands[commandIndex] ?? filteredCommands[0];
          if (selected) {
            selectCommand(selected);
          }
        }
      } else if (e.key === "Escape") {
        setShowCommand(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey && !isStreaming && !isLoading) {
      e.preventDefault();
      handleSend();
    }
  };

  // 选择提及的文件
  const selectMention = (file: ReferencedFile) => {
    if (!textareaRef.current) return;

    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);

    // 找到 @ 符号位置
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (!atMatch) return;

    const atPos = cursorPos - atMatch[0].length;
    const newValue = value.slice(0, atPos) + textAfterCursor;

    onChange(newValue);
    setShowMention(false);
    setMentionQuery("");

    // 添加到引用列表（避免重复）
    if (!referencedFiles.some(f => f.path === file.path)) {
      setReferencedFiles([...referencedFiles, file]);
    }

    // 聚焦回输入框
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // 选择命令
  const selectCommand = (cmd: SlashCommand) => {
    if (!textareaRef.current) return;

    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);

    // 找到 / 符号位置
    const slashMatch = textBeforeCursor.match(/(?:^|\s)\/([^\s/]*)$/);
    if (!slashMatch) return;

    const slashPos = cursorPos - slashMatch[0].length + (slashMatch[0].startsWith(' ') ? 1 : 0);
    // 移除命令文本，不插入 prompt，而是设置 activeCommand
    const newValue = value.slice(0, slashPos) + textAfterCursor;

    onChange(newValue);
    setShowCommand(false);
    setCommandQuery("");
    setActiveCommand(cmd);

    // 聚焦回输入框
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        // 光标位置调整到删除命令后的位置
        textareaRef.current.setSelectionRange(slashPos, slashPos);
      }
    }, 0);
  };

  // 处理命令保存
  const handleSaveCommand = (cmd: Omit<SlashCommand, "id">) => {
    if (editingCommand) {
      updateCommand(editingCommand.id, cmd);
    } else {
      registerCommand(cmd);
    }
  };

  // 移除引用的文件
  const removeReference = (path: string) => {
    setReferencedFiles(files => files.filter(f => f.path !== path));
  };

  // 发送消息
  const handleSend = useCallback(() => {
    if (!value.trim() && referencedFiles.length === 0 && textSelections.length === 0 && attachedImages.length === 0 && !activeCommand) return;
    if (isLoading || isStreaming) return;

    // 构建带引用的消息
    let messageToSend = value.trim();

    // 注入 Slash Command 提示词
    if (activeCommand) {
      messageToSend = `${activeCommand.prompt}\n${messageToSend}`;
    }

    onSend(
      messageToSend,
      referencedFiles,
      attachedImages.length > 0 ? attachedImages : undefined,
      textSelections
    );
    onChange("");
    setReferencedFiles([]);
    setAttachedImages([]);
    setActiveCommand(null);
    clearTextSelections();
  }, [value, referencedFiles, textSelections, attachedImages, isLoading, isStreaming, onSend, onChange, clearTextSelections, activeCommand]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    send: handleSend,
    getReferencedFiles: () => referencedFiles,
    getAttachedImages: () => attachedImages,
  }), [handleSend, referencedFiles, attachedImages]);

  // @ 菜单自动滚动到选中项
  useEffect(() => {
    if (!showMention || !mentionRef.current) return;
    const selected = mentionRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: "nearest" });
  }, [mentionIndex, showMention]);

  // / 命令菜单自动滚动到选中项
  useEffect(() => {
    if (!showCommand || !commandRef.current) return;
    const selected = commandRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: "nearest" });
  }, [commandIndex, showCommand]);

  // 通知父组件当前是否可发送（用于外部发送按钮）
  useEffect(() => {
    if (!onCanSendChange) return;
    const canSend = Boolean(
      value.trim() ||
      referencedFiles.length > 0 ||
      textSelections.length > 0 ||
      attachedImages.length > 0 ||
      activeCommand
    );
    onCanSendChange(canSend);
  }, [onCanSendChange, value, referencedFiles.length, textSelections.length, attachedImages.length, activeCommand]);

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
    >
      {/* 已引用的文件、文本片段和图片标签 */}
      {(referencedFiles.length > 0 || textSelections.length > 0 || attachedImages.length > 0 || activeCommand) && (
        <div className="flex flex-wrap gap-1 mb-2">
          {/* Active Command Tag */}
          {activeCommand && (
            <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs border border-primary/20">
              {activeCommand.id.startsWith("skill:") ? <Sparkles size={12} /> : <Terminal size={12} />}
              <span className="font-medium">/{activeCommand.key}</span>
              <span className="text-muted-foreground ml-1 hidden sm:inline">{activeCommand.description}</span>
              <button
                onClick={() => setActiveCommand(null)}
                className="hover:bg-primary/20 rounded p-0.5 ml-1"
                aria-label={t.ai.removeCommand}
              >
                <X size={10} />
              </button>
            </div>
          )}
          {/* 文件引用 */}
          {referencedFiles.map(file => (
            <div
              key={file.path}
              className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs"
            >
              {file.isFolder ? <Folder size={12} /> : <FileText size={12} />}
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button
                onClick={() => removeReference(file.path)}
                className="hover:bg-primary/20 rounded p-0.5"
                aria-label={t.ai.removeReference.replace("{name}", file.name)}
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {/* 文本片段引用 */}
          {textSelections.map(sel => (
            <div
              key={sel.id}
              className="flex items-center gap-1 px-2 py-1 bg-accent text-accent-foreground rounded-md text-xs max-w-[200px]"
              title={sel.text}
            >
              <Quote size={12} className="shrink-0" />
              <span className="truncate">{sel.summary || `${sel.text.slice(0, 30)}${sel.text.length > 30 ? '...' : ''}`}</span>
              <span className="text-muted-foreground shrink-0">({sel.locator || sel.source})</span>
              <button
                onClick={() => removeTextSelection(sel.id)}
                className="hover:bg-accent/80 rounded p-0.5 shrink-0"
                aria-label={t.ai.removeQuotedText}
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {/* 图片引用 */}
          {attachedImages.map(img => (
            <div
              key={img.id}
              className="relative group"
            >
              <img
                src={img.preview}
                alt="attached"
                className="h-16 w-16 object-cover rounded-md border border-border/60"
              />
              <button
                onClick={() => removeImage(img.id)}
                className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={t.common.delete}
                title={t.common.delete}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区域 */}
      <div ref={inputBarRef} className="flex gap-2 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={defaultPlaceholder}
          rows={rows}
          className="flex-1 resize-none bg-transparent outline-none text-sm"
        />

        {/* 附加图片按钮 */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={handleImageSelect}
        />
        <button
          onClick={() => imageInputRef.current?.click()}
          className={cn(
            "self-end p-2 rounded-lg transition-colors",
            supportsVision
              ? "text-muted-foreground hover:text-foreground hover:bg-muted"
              : "text-muted-foreground/50 cursor-not-allowed"
          )}
          title={supportsVision ? t.ai.attachImage : t.ai.modelNoVision}
          disabled={!supportsVision}
        >
          {supportsVision ? (
            <ImageIcon size={16} />
          ) : (
            <div className="relative">
              <ImageIcon size={16} />
              <AlertCircle size={8} className="absolute -bottom-0.5 -right-0.5 text-warning" />
            </div>
          )}
        </button>

        {/* 附加文件按钮 */}
        <button
          ref={filePickerButtonRef}
          onClick={() => setShowFilePicker((v) => !v)}
          className="self-end p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          aria-label={t.ai.attachFile}
        >
          <Paperclip size={16} />
        </button>
        <Popover
          open={showFilePicker}
          onOpenChange={(next) => {
            setShowFilePicker(next);
            if (!next) setFilePickerQuery("");
          }}
          anchor={filePickerButtonRef}
        >
          <PopoverContent placement="top-end" width={288}>
            <div className="border-b border-border/40 p-2">
              <input
                type="text"
                value={filePickerQuery}
                onChange={(e) => setFilePickerQuery(e.target.value)}
                placeholder={t.ai.searchFiles}
                className="w-full rounded-ui-sm bg-muted/50 px-2 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-primary/50"
                autoFocus
              />
            </div>
            <PopoverList>
              {pickerFilteredFiles.length === 0 ? (
                <PopoverEmpty>{t.ai.noFilesFound}</PopoverEmpty>
              ) : (
                pickerFilteredFiles.map((file) => (
                  <Row
                    key={file.path}
                    density="compact"
                    icon={
                      file.isFolder ? (
                        <Folder size={14} className="text-yellow-500" />
                      ) : (
                        <FileText size={14} />
                      )
                    }
                    title={file.name}
                    onSelect={() => {
                      if (!referencedFiles.some((f) => f.path === file.path)) {
                        setReferencedFiles([...referencedFiles, file]);
                      }
                      setShowFilePicker(false);
                      setFilePickerQuery("");
                    }}
                  />
                ))
              )}
            </PopoverList>
            <div className="border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t.ai.totalFiles.replace("{count}", String(allFiles.length))}
            </div>
          </PopoverContent>
        </Popover>

        {!hideSendButton && (
          isStreaming ? (
            <button
              onClick={onStop}
              className="self-end bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-lg p-2 transition-colors"
              title={t.ai.stopGenerate}
            >
              <span className="block w-4 h-4 bg-white rounded-sm" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={(!value.trim() && referencedFiles.length === 0 && attachedImages.length === 0) || isLoading}
              className="self-end bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg p-2 transition-colors"
              title={t.ai.send}
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          )
        )}
      </div>

      {/* @ 提及下拉菜单 */}
      <Popover
        open={showMention}
        onOpenChange={setShowMention}
        anchor={inputBarRef}
      >
        <PopoverContent
          ref={mentionRef as React.Ref<HTMLDivElement>}
          placement="top-start"
          width={256}
        >
          <PopoverList>
            {filteredFiles.length === 0 ? (
              <PopoverEmpty>{t.ai.noFilesFound}</PopoverEmpty>
            ) : (
              filteredFiles.map((file, index) => (
                <Row
                  key={file.path}
                  density="compact"
                  icon={
                    file.isFolder ? (
                      <Folder size={14} className="text-yellow-500" />
                    ) : (
                      <FileText size={14} />
                    )
                  }
                  title={file.name}
                  selected={index === mentionIndex}
                  data-selected={index === mentionIndex}
                  onSelect={() => selectMention(file)}
                />
              ))
            )}
          </PopoverList>
        </PopoverContent>
      </Popover>

      {/* / 命令下拉菜单 — custom row markup because each row hosts edit/delete
       * action buttons on hover, which Row's single-button shape can't carry. */}
      <Popover
        open={showCommand}
        onOpenChange={setShowCommand}
        anchor={inputBarRef}
      >
        <PopoverContent
          ref={commandRef as React.Ref<HTMLDivElement>}
          placement="top-start"
          width={256}
        >
          <PopoverHeader>{t.ai.slashCommands.shortcuts}</PopoverHeader>
          <PopoverList>
            {filteredCommands.length === 0 ? (
              <PopoverEmpty>{t.ai.slashCommands.noCommandsFound}</PopoverEmpty>
            ) : (
              filteredCommands.map((cmd, index) => {
                const isSkill = cmd.id.startsWith("skill:");
                const selected = index === commandIndex;
                return (
                  <div
                    key={cmd.id}
                    data-selected={selected}
                    className={cn(
                      "group relative flex items-center rounded-ui-md transition-colors",
                      selected ? "bg-accent" : "hover:bg-foreground/5",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => selectCommand(cmd)}
                      className="min-w-0 flex-1 px-2.5 py-1.5 text-left"
                      title={t.ai.useCommand.replace("{key}", cmd.key)}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "block truncate text-[13px] text-foreground",
                            selected ? "font-medium" : "font-normal",
                          )}
                        >
                          /{cmd.key}
                        </span>
                        {isSkill && (
                          <span className="inline-flex items-center gap-0.5 rounded-ui-sm bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary/70">
                            <Sparkles size={10} />
                            skill
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {cmd.description}
                      </div>
                    </button>
                    {!isSkill && (
                      <div className="flex shrink-0 items-center gap-1 pr-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCommand(cmd);
                            setIsModalOpen(true);
                            setShowCommand(false);
                          }}
                          className="rounded-ui-sm p-1.5 text-muted-foreground opacity-0 transition-[opacity,color,background-color] duration-fast ease-out-subtle hover:bg-background hover:text-foreground group-hover:opacity-100"
                          aria-label={t.common.edit}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(t.ai.slashCommands.deleteConfirm)) {
                              deleteCommand(cmd.id);
                              setCommandIndex((idx) => {
                                if (filteredCommands.length <= 1) return 0;
                                if (idx >= filteredCommands.length - 1) {
                                  return filteredCommands.length - 2;
                                }
                                return idx;
                              });
                            }
                          }}
                          className="rounded-ui-sm p-1.5 text-muted-foreground opacity-0 transition-[opacity,color,background-color] duration-fast ease-out-subtle hover:bg-background hover:text-destructive group-hover:opacity-100"
                          aria-label={t.common.delete}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </PopoverList>
          <button
            type="button"
            onClick={() => {
              setEditingCommand(null);
              setIsModalOpen(true);
              setShowCommand(false);
            }}
            className="flex w-full items-center gap-2 border-t border-border/40 px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            aria-label={t.ai.slashCommands.createShortcut}
          >
            <Plus size={14} />
            {t.ai.slashCommands.createShortcut}
          </button>
        </PopoverContent>
      </Popover>

      {/* 命令管理弹窗 */}
      <CommandManagerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveCommand}
        initialData={editingCommand}
      />

    </div>
  );
});

ChatInput.displayName = 'ChatInput';
