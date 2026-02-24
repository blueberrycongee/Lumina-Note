import { useEffect, useMemo, useCallback } from "react";
import { useDatabaseStore } from "@/stores/useDatabaseStore";
import { useFileStore } from "@/stores/useFileStore";
import { TableView } from "./TableView";
import { KanbanView } from "./KanbanView";
import { CalendarView } from "./CalendarView";
import { DatabaseToolbar } from "./DatabaseToolbar";
import { DatabaseIconButton } from "./primitives";
import { Database, RefreshCw } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface DatabaseViewProps {
  dbId: string;
  className?: string;
}

export function DatabaseView({ dbId, className = "" }: DatabaseViewProps) {
  const { t } = useLocaleStore();
  const { databases, loadDatabase, setCurrentDb, refreshRows } = useDatabaseStore();
  const { refreshFileTree } = useFileStore();
  
  // 刷新数据
  const handleRefresh = useCallback(async () => {
    await refreshFileTree();
    await refreshRows(dbId);
  }, [dbId, refreshFileTree, refreshRows]);
  
  // 加载数据库（先刷新文件树）
  useEffect(() => {
    const load = async () => {
      // 先刷新文件树，确保新笔记被扫描到
      await refreshFileTree();
      // 然后加载数据库
      await loadDatabase(dbId);
      setCurrentDb(dbId);
    };
    load();
    
    return () => {
      // 切换时可以选择是否清除当前数据库
    };
  }, [dbId, loadDatabase, setCurrentDb, refreshFileTree]);
  
  const db = databases[dbId];
  const activeView = useMemo(() => {
    if (!db) return null;
    return db.views.find(v => v.id === db.activeViewId) || db.views[0];
  }, [db]);
  
  if (!db) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="db-empty-state animate-pulse">
          {t.database.loading}
        </div>
      </div>
    );
  }
  
  return (
    <div className={`flex flex-col h-full bg-background ${className}`}>
      {/* 数据库头部 */}
      <div className="db-toolbar flex-shrink-0 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {db.icon ? (
              <span className="text-2xl">{db.icon}</span>
            ) : (
              <Database className="w-6 h-6 text-muted-foreground" />
            )}
            <h1 className="text-xl font-semibold">{db.name}</h1>
          </div>
          <DatabaseIconButton
            onClick={handleRefresh}
            aria-label={t.database.refresh}
            title={t.database.refresh}
          >
            <RefreshCw className="w-4 h-4" />
          </DatabaseIconButton>
        </div>
        {db.description && (
          <p className="mt-1 text-sm text-muted-foreground">{db.description}</p>
        )}
      </div>
      
      {/* 工具栏 */}
      <DatabaseToolbar dbId={dbId} />
      
      {/* 视图内容 */}
      <div className="flex-1 overflow-hidden">
        {activeView?.type === 'table' && (
          <TableView dbId={dbId} />
        )}
        {activeView?.type === 'kanban' && (
          <KanbanView dbId={dbId} />
        )}
        {activeView?.type === 'calendar' && (
          <CalendarView dbId={dbId} />
        )}
        {activeView?.type === 'gallery' && (
          <div className="flex items-center justify-center h-full p-6">
            <div className="db-empty-state w-full max-w-lg">{t.database.galleryComingSoon}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DatabaseView;
