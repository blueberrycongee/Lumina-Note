import { useState, useEffect, useMemo } from "react";
import { useDatabaseStore } from "@/stores/useDatabaseStore";
import { useFileStore } from "@/stores/useFileStore";
import { useBrowserStore } from "@/stores/useBrowserStore";
import { Database, ListTodo, FolderKanban, Book, X } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { DatabaseActionButton, DatabaseIconButton, DatabaseTextInput } from "./primitives";

interface CreateDatabaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function normalizePathForDisplay(path: string): string {
  return path.replace(/\\/g, '/');
}

function extractForbiddenPath(detail: string): string | null {
  const pluginFsMatch = detail.match(/forbidden path:\s*(.+)$/i);
  if (pluginFsMatch?.[1]) return pluginFsMatch[1].trim();
  const rustFsMatch = detail.match(/Path not permitted:\s*(.+)$/i);
  if (rustFsMatch?.[1]) return rustFsMatch[1].trim();
  return null;
}

export function CreateDatabaseDialog({ isOpen, onClose }: CreateDatabaseDialogProps) {
  const { createDatabase } = useDatabaseStore();
  const { openDatabaseTab, refreshFileTree } = useFileStore();
  const { hideAllWebViews, showAllWebViews } = useBrowserStore();
  const { t } = useLocaleStore();
  
  type TemplateId = 'blank' | 'task' | 'project' | 'reading' | 'flashcard';
  type TemplateItem = { id: TemplateId; name: string; icon: typeof Database; description: string };

  const [name, setName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('blank');
  const [isCreating, setIsCreating] = useState(false);

  const formatCreateDatabaseError = (detail: string): string => {
    const forbiddenPath = extractForbiddenPath(detail);
    if (forbiddenPath) {
      return [
        t.database.createDialog.pathForbidden,
        t.database.createDialog.pathForbiddenPath.replace('{path}', normalizePathForDisplay(forbiddenPath)),
      ].join('\n');
    }
    if (/No vault path set/i.test(detail)) {
      return t.common.openWorkspaceFirst;
    }
    return detail ? `${t.database.createDialog.failed}\n${detail}` : t.database.createDialog.failed;
  };

  const templates = useMemo<TemplateItem[]>(() => ([
    { id: 'blank', name: t.database.createDialog.templates.blank.name, icon: Database, description: t.database.createDialog.templates.blank.desc },
    { id: 'task', name: t.database.createDialog.templates.task.name, icon: ListTodo, description: t.database.createDialog.templates.task.desc },
    { id: 'project', name: t.database.createDialog.templates.project.name, icon: FolderKanban, description: t.database.createDialog.templates.project.desc },
    { id: 'reading', name: t.database.createDialog.templates.reading.name, icon: Book, description: t.database.createDialog.templates.reading.desc },
    { id: 'flashcard', name: t.database.createDialog.templates.flashcard.name, icon: Book, description: t.database.createDialog.templates.flashcard.desc },
  ]), [t]);
  
  // 弹窗打开时隐藏 WebView，关闭时恢复
  useEffect(() => {
    if (isOpen) {
      hideAllWebViews();
    } else {
      showAllWebViews();
    }
  }, [isOpen, hideAllWebViews, showAllWebViews]);
  
  if (!isOpen) return null;
  
  const handleCreate = async () => {
    if (!name.trim()) return;
    
    setIsCreating(true);
    try {
      const dbId = await createDatabase({
        name: name.trim(),
        template: selectedTemplate,
      });
      
      // 刷新文件树以显示新文件
      await refreshFileTree();
      
      // 打开新创建的数据库
      openDatabaseTab(dbId, name.trim());
      
      // 重置并关闭
      setName('');
      setSelectedTemplate('blank');
      onClose();
    } catch (error) {
      console.error('Failed to create database:', error);
      const detail = error instanceof Error ? error.message : String(error ?? "");
      alert(formatCreateDatabaseError(detail));
    } finally {
      setIsCreating(false);
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      
      {/* 对话框 */}
      <div className="db-surface relative w-full max-w-md mx-4 p-6">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">{t.database.createDialog.title}</h2>
          <DatabaseIconButton
            onClick={onClose}
            aria-label={t.common.close}
            title={t.common.close}
          >
            <X className="w-5 h-5" />
          </DatabaseIconButton>
        </div>
        
        {/* 名称输入 */}
        <div className="mb-6">
          <label htmlFor="database-create-name" className="block text-sm font-medium mb-2">
            {t.database.createDialog.nameLabel}
          </label>
          <DatabaseTextInput
            id="database-create-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.database.createDialog.namePlaceholder}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                handleCreate();
              }
            }}
          />
        </div>
        
        {/* 模板选择 */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">
            {t.database.createDialog.templateLabel}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((template) => {
              const Icon = template.icon;
              const isSelected = selectedTemplate === template.id;
              
              return (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`db-panel db-focus-ring flex flex-col items-start p-3 text-left ${
                    isSelected
                      ? 'border-primary/65 bg-primary/8'
                      : 'hover:border-border/85'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium">{template.name}</span>
                  <span className="text-xs text-muted-foreground">{template.description}</span>
                </button>
              );
            })}
          </div>
        </div>
        
        {/* 操作按钮 */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="db-toggle-btn h-9 px-4"
          >
            {t.common.cancel}
          </button>
          <DatabaseActionButton
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
            className="px-4"
          >
            {isCreating ? t.database.createDialog.creating : t.database.createDialog.create}
          </DatabaseActionButton>
        </div>
      </div>
    </div>
  );
}
