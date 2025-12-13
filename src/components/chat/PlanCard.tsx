/**
 * 任务计划卡片组件
 * 
 * 显示 Agent 的执行计划和进度
 */

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Loader2, ListTodo, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Plan, AgentType } from "@/stores/useRustAgentStore";

interface PlanCardProps {
  plan: Plan;
  className?: string;
}

// Agent 类型对应的图标和颜色
const agentConfig: Record<AgentType, { label: string; color: string }> = {
  coordinator: { label: "协调", color: "text-purple-500" },
  planner: { label: "规划", color: "text-blue-500" },
  executor: { label: "执行", color: "text-orange-500" },
  editor: { label: "编辑", color: "text-green-500" },
  researcher: { label: "研究", color: "text-cyan-500" },
  writer: { label: "写作", color: "text-pink-500" },
  organizer: { label: "整理", color: "text-yellow-500" },
  reporter: { label: "汇报", color: "text-gray-500" },
};

export function PlanCard({ plan, className = "" }: PlanCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const completedCount = plan.steps.filter(s => s.completed).length;
  const totalCount = plan.steps.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const isAllCompleted = completedCount === totalCount;

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
            执行计划
          </span>
          <span className="text-xs text-muted-foreground">
            ({completedCount}/{totalCount} 完成)
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
            <div className="px-3 py-2 space-y-1.5">
              {plan.steps.map((step, index) => {
                const isCurrent = index === plan.current_step && !step.completed;
                const config = agentConfig[step.agent] || agentConfig.executor;
                
                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`flex items-start gap-2 text-sm ${
                      step.completed 
                        ? "text-muted-foreground" 
                        : isCurrent 
                          ? "text-foreground" 
                          : "text-muted-foreground/70"
                    }`}
                  >
                    {/* 状态图标 */}
                    <div className="mt-0.5 flex-shrink-0">
                      {step.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : isCurrent ? (
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground/50" />
                      )}
                    </div>
                    
                    {/* 步骤内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${config.color} bg-current/10`}>
                          {config.label}
                        </span>
                        <span className={step.completed ? "line-through" : ""}>
                          {step.description}
                        </span>
                      </div>
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
