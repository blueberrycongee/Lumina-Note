/**
 * 任务计划卡片组件 (Windsurf 风格)
 * 
 * 显示 Agent 的执行计划和进度
 */

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Loader2, ListTodo, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Plan, PlanStepStatus } from "@/stores/useRustAgentStore";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface PlanCardProps {
  plan: Plan;
  className?: string;
}

// 状态对应的样式
const statusConfig: Record<PlanStepStatus, { icon: "completed" | "in_progress" | "pending"; textClass: string }> = {
  completed: { icon: "completed", textClass: "text-muted-foreground line-through" },
  in_progress: { icon: "in_progress", textClass: "text-foreground font-medium" },
  pending: { icon: "pending", textClass: "text-muted-foreground/70" },
};

export function PlanCard({ plan, className = "" }: PlanCardProps) {
  const { t } = useLocaleStore();
  const [isExpanded, setIsExpanded] = useState(true);
  
  const completedCount = plan.steps.filter(s => s.status === "completed").length;
  const totalCount = plan.steps.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const isAllCompleted = completedCount === totalCount && totalCount > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-muted/50 rounded-lg border border-border overflow-hidden ${className}`}
    >
      {/* 头部 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">
            {t.ai.planTitle}
          </span>
          <span className="text-xs text-muted-foreground">
            ({completedCount}/{totalCount})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 进度条 */}
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={`h-full ${isAllCompleted ? 'bg-green-500' : 'bg-primary'}`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* 步骤列表 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border"
          >
            {/* 说明（如果有） */}
            {plan.explanation && (
              <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border/50">
                {plan.explanation}
              </div>
            )}
            
            <div className="px-3 py-2 space-y-1.5">
              {plan.steps.map((step, index) => {
                const config = statusConfig[step.status];
                
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`flex items-start gap-2 text-sm ${config.textClass}`}
                  >
                    {/* 状态图标 */}
                    <div className="mt-0.5 flex-shrink-0">
                      {step.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : step.status === "in_progress" ? (
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground/50" />
                      )}
                    </div>
                    
                    {/* 步骤内容 */}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-muted-foreground mr-1.5">{index + 1}.</span>
                      <span>{step.step}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
