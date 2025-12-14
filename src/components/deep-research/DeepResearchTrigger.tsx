/**
 * Deep Research Trigger
 *
 * 触发深度研究的按钮和对话框
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Microscope,
  X,
  FolderOpen,
  Loader2,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAIConfig } from "@/services/ai/ai";
import {
  useDeepResearchStore,
  setupDeepResearchListener,
  DeepResearchConfig,
  ReportStyle,
  NoteReference,
} from "@/stores/useDeepResearchStore";
import { useFileStore } from "@/stores/useFileStore";

// ============ 对话框组件 ============

interface DeepResearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onShowHistory?: () => void;
}

function DeepResearchDialog({ isOpen, onClose, onShowHistory }: DeepResearchDialogProps) {
  const [topic, setTopic] = useState("");
  const [searchScope, setSearchScope] = useState<string | undefined>();
  const [reportStyle, setReportStyle] = useState<ReportStyle>("detailed");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { startResearch, sessions } = useDeepResearchStore();
  const { vaultPath, fileTree } = useFileStore();
  
  // 从文件树中提取顶级文件夹
  const folders = fileTree
    .filter((entry) => entry.isDirectory)
    .map((entry) => entry.name);

  // 设置事件监听
  useEffect(() => {
    setupDeepResearchListener();
  }, []);

  const handleSubmit = async () => {
    if (!topic.trim() || !vaultPath) return;

    setIsSubmitting(true);

    // 获取 AI 配置
    const aiConfig = getAIConfig();
    
    // 构建配置
    const config: DeepResearchConfig = {
      provider: aiConfig.provider,
      model: aiConfig.model,
      api_key: aiConfig.apiKey,
      base_url: aiConfig.baseUrl || undefined,
      temperature: 0.7,
      max_search_results: 20,
      max_notes_to_read: 10,
      report_style: reportStyle,
      include_citations: true,
      locale: "zh-CN",
    };

    // TODO: 如果用户配置了 Embedding，先执行 RAG 搜索
    // const preSearchedNotes = await ragService.search(topic, { limit: 20 });
    const preSearchedNotes: NoteReference[] = [];

    try {
      await startResearch(topic, vaultPath, config, {
        searchScope,
        reportStyle,
        includeCitations: true,
        preSearchedNotes,
      });
      onClose();
    } catch (error) {
      console.error("Failed to start research:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* 对话框 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-10 w-full max-w-md bg-background border border-border rounded-lg shadow-xl"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Microscope className="w-5 h-5 text-primary" />
            <span className="font-medium">Deep Research</span>
          </div>
          <div className="flex items-center gap-1">
            {sessions.length > 0 && onShowHistory && (
              <button
                className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                onClick={onShowHistory}
                title="研究历史"
              >
                <History className="w-3.5 h-3.5" />
                <span>{sessions.length}</span>
              </button>
            )}
            <button
              className="p-1 hover:bg-muted rounded"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4">
          {/* 研究主题 */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              研究主题
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如：React 性能优化最佳实践"
              className="w-full px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          </div>

          {/* 搜索范围 */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              搜索范围
            </label>
            <div className="relative">
              <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select
                value={searchScope || ""}
                onChange={(e) => setSearchScope(e.target.value || undefined)}
                className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
              >
                <option value="">全部笔记</option>
                {folders.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 报告风格 */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              报告风格
            </label>
            <div className="flex gap-2">
              {[
                { value: "detailed", label: "详细" },
                { value: "summary", label: "摘要" },
                { value: "outline", label: "大纲" },
              ].map((option) => (
                <button
                  key={option.value}
                  className={cn(
                    "flex-1 px-3 py-2 text-sm rounded-md border transition-colors",
                    reportStyle === option.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                  onClick={() => setReportStyle(option.value as ReportStyle)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            className="px-4 py-2 text-sm rounded-md hover:bg-muted"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            onClick={handleSubmit}
            disabled={!topic.trim() || isSubmitting}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            开始研究
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ============ 触发按钮 ============

interface DeepResearchTriggerProps {
  className?: string;
  variant?: "button" | "icon";
}

export function DeepResearchTrigger({
  className,
  variant = "button",
}: DeepResearchTriggerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { isRunning } = useDeepResearchStore();

  if (variant === "icon") {
    return (
      <>
        <button
          className={cn(
            "p-2 rounded-md hover:bg-muted transition-colors",
            isRunning && "text-primary",
            className
          )}
          onClick={() => setIsDialogOpen(true)}
          title="Deep Research"
        >
          <Microscope className="w-4 h-4" />
        </button>

        <AnimatePresence>
          {isDialogOpen && (
            <DeepResearchDialog
              isOpen={isDialogOpen}
              onClose={() => setIsDialogOpen(false)}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <>
      <button
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors",
          isRunning && "text-primary",
          className
        )}
        onClick={() => setIsDialogOpen(true)}
      >
        <Microscope className="w-4 h-4" />
        <span>Deep Research</span>
      </button>

      <AnimatePresence>
        {isDialogOpen && (
          <DeepResearchDialog
            isOpen={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default DeepResearchTrigger;
