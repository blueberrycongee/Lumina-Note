/**
 * 可折叠的对话历史列表组件
 * 参考设计：默认折叠显示图标，展开显示完整列表
 * 
 * 使用 useConversationManager hook 统一会话管理逻辑
 */

import { useState } from "react";
import {
  Bot,
  MessageSquare,
  Plus,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Microscope,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useConversationManager, type SessionType } from "@/hooks/useConversationManager";

interface ConversationListProps {
  className?: string;
}

export function ConversationList({ className }: ConversationListProps) {
  const { t } = useLocaleStore();
  const [isExpanded, setIsExpanded] = useState(false);

  // 使用统一的会话管理 hook
  const {
    allSessions,
    handleSwitchSession,
    handleDeleteSession,
    handleNewConversation,
    handleClearHistory,
    isCurrentSession,
  } = useConversationManager();

  // 删除会话（阻止事件冒泡）
  const onDeleteSession = (e: React.MouseEvent, id: string, type: SessionType) => {
    e.stopPropagation();
    handleDeleteSession(id, type);
  };

  return (
    <div
      className={cn(
        "flex flex-col border-r border-border bg-muted/30 transition-all duration-300 ease-in-out",
        isExpanded ? "w-48" : "w-12",
        className
      )}
    >
      {/* 顶部：折叠按钮 + 新建按钮 */}
      <div className="p-2 border-b border-border flex flex-col gap-2 items-center">
        {/* 折叠/展开按钮 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors w-full flex justify-center"
          title={isExpanded ? t.conversationList.collapseList : t.conversationList.expandList}
        >
          {isExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        {/* 新建对话按钮 */}
        <button
          onClick={handleNewConversation}
          className={cn(
            "flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all",
            isExpanded ? "w-full py-2 px-3" : "w-8 h-8 rounded-full"
          )}
          title={t.conversationList.newConversation}
        >
          <Plus size={18} />
          {isExpanded && (
            <span className="text-xs font-medium whitespace-nowrap">{t.conversationList.newConversation}</span>
          )}
        </button>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto py-2">
        {allSessions.map((session) => {
          const isActive = isCurrentSession(session.id, session.type);
          
          // 根据类型选择图标
          const Icon = session.type === "agent" 
            ? Bot 
            : session.type === "research" 
              ? Microscope 
              : MessageSquare;
          
          // 图标颜色
          const iconColor = session.type === "agent" 
            ? "text-purple-500" 
            : session.type === "research"
              ? "text-emerald-500"
              : "text-slate-500";

          return (
            <div
              key={session.id}
              onClick={() => handleSwitchSession(session.id, session.type)}
              className={cn(
                "group flex items-center px-2 py-2.5 cursor-pointer transition-all border-l-2",
                isActive
                  ? "border-primary bg-background shadow-sm"
                  : "border-transparent hover:bg-background/50 hover:shadow-sm"
              )}
              title={session.title}
            >
              {/* 图标 */}
              <div className="min-w-[32px] flex justify-center">
                <Icon
                  size={16}
                  className={cn(
                    iconColor,
                    isActive && "text-primary"
                  )}
                />
              </div>

              {/* 标题 - 只有展开时显示 */}
              {isExpanded && (
                <>
                  <div className="flex-1 overflow-hidden ml-1">
                    <p
                      className={cn(
                        "text-xs truncate",
                        isActive ? "text-foreground font-medium" : "text-muted-foreground"
                      )}
                    >
                      {session.title}
                    </p>
                    {/* 类型标签 */}
                    {session.type === "agent" && (
                      <span className="text-[10px] text-purple-600 bg-purple-50 dark:bg-purple-900/30 px-1.5 rounded-full inline-block mt-0.5">
                        Agent
                      </span>
                    )}
                    {session.type === "research" && (
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 rounded-full inline-block mt-0.5">
                        Research
                      </span>
                    )}
                  </div>

                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => onDeleteSession(e, session.id, session.type)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 transition-opacity"
                    title={t.conversationList.deleteConversation}
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {allSessions.length === 0 && (
          <div className="px-2 py-4 text-center">
            {isExpanded ? (
              <p className="text-xs text-muted-foreground">{t.conversationList.noConversations}</p>
            ) : (
              <MessageSquare size={16} className="mx-auto text-muted-foreground/50" />
            )}
          </div>
        )}
      </div>

      {/* 底部：清空历史（展开时显示） */}
      {isExpanded && allSessions.length > 0 && (
        <div className="p-2 border-t border-border">
          <button
            onClick={handleClearHistory}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 w-full py-1 rounded hover:bg-accent transition-colors"
          >
            <Trash2 size={12} />
            {t.conversationList.clearHistory}
          </button>
        </div>
      )}
    </div>
  );
}
