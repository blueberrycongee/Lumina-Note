use crate::agent::plan::{mark_stage_completed, sync_plan_statuses};
use crate::agent::types::{
    AgentConfig, AgentExecutionMode, AgentStage, AgentStatus, ExecuteStageState, ExploreStageState,
    GraphState, Message, OrchestrationState, PlanStageState, ReportStageState, TaskContext,
    TaskState, VerificationVerdict, VerifyStageState,
};

const COMPLEX_TASK_CHAR_THRESHOLD: usize = 160;
const COMPLEX_HISTORY_THRESHOLD: usize = 6;
const COMPLEX_CONTEXT_THRESHOLD: usize = 3;
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrchestrationDecision {
    pub mode: AgentExecutionMode,
    pub stages: Vec<AgentStage>,
    pub fallback_to_single_agent: bool,
    pub fallback_reason: Option<String>,
}

pub fn build_initial_graph_state(
    messages: Vec<Message>,
    task: String,
    context: TaskContext,
    config: &AgentConfig,
) -> GraphState {
    let decision = plan_orchestration(&task, &context, config.execution_mode.clone());
    build_initial_graph_state_with_decision(messages, task, context, config, decision)
}

pub fn build_initial_graph_state_with_decision(
    messages: Vec<Message>,
    task: String,
    context: TaskContext,
    config: &AgentConfig,
    decision: OrchestrationDecision,
) -> GraphState {
    GraphState {
        messages,
        task: TaskState {
            user_task: task,
            workspace_path: context.workspace_path,
            active_note_path: context.active_note_path,
            active_note_content: context.active_note_content,
            file_tree: context.file_tree,
            auto_approve: config.auto_approve,
        },
        orchestration: OrchestrationState {
            mode: decision.mode,
            current_stage: decision
                .stages
                .first()
                .cloned()
                .unwrap_or(AgentStage::Execute),
            stages: decision.stages,
            fallback_to_single_agent: decision.fallback_to_single_agent,
            fallback_reason: decision.fallback_reason,
        },
        explore: ExploreStageState {
            rag_results: context.rag_results,
            resolved_links: context.resolved_links,
            report: None,
        },
        plan: PlanStageState::default(),
        execute: ExecuteStageState::default(),
        verify: VerifyStageState::default(),
        report: ReportStageState::default(),
        goto: String::new(),
        status: AgentStatus::Running,
    }
}

pub fn plan_orchestration(
    task: &str,
    context: &TaskContext,
    requested_mode: AgentExecutionMode,
) -> OrchestrationDecision {
    match requested_mode {
        AgentExecutionMode::LegacySingleAgent => legacy_single_agent_decision(),
        AgentExecutionMode::Orchestrated => orchestrated_decision(),
        AgentExecutionMode::Auto => {
            if is_complex_task(task, context) {
                orchestrated_decision()
            } else {
                legacy_single_agent_decision()
            }
        }
    }
}

pub fn resolve_runtime_config(config: &AgentConfig, state: &GraphState) -> AgentConfig {
    let mut resolved = config.clone();
    if state.orchestration.mode == AgentExecutionMode::Orchestrated {
        if let Some(model) = resolved
            .complex_task_model
            .as_ref()
            .filter(|model| !model.trim().is_empty())
        {
            resolved.model = model.clone();
        }
    }
    resolved
}

pub fn prepare_for_forge_execution(state: &mut GraphState) {
    if let Some(plan) = state.plan.current_plan.as_mut() {
        sync_plan_statuses(plan, AgentStage::Execute);
    }
    state.set_stage(AgentStage::Execute);
}

pub fn mark_waiting_for_approval(state: &mut GraphState) {
    state.set_stage(AgentStage::Execute);
}

pub fn mark_run_completed(state: &mut GraphState) {
    if let Some(plan) = state.plan.current_plan.as_mut() {
        mark_stage_completed(plan, AgentStage::Verify);
        mark_stage_completed(plan, AgentStage::Report);
    }
    if state.orchestration.mode == AgentExecutionMode::Orchestrated
        && state.verify.summary.is_none()
    {
        state.verify.summary = Some("验证阶段未生成结构化总结。".to_string());
    }
    state.set_stage(AgentStage::Report);
}

pub fn mark_run_failed(state: &mut GraphState, error: String) {
    state.set_error(Some(error));
    state.set_stage(AgentStage::Report);
}

fn legacy_single_agent_decision() -> OrchestrationDecision {
    OrchestrationDecision {
        mode: AgentExecutionMode::LegacySingleAgent,
        stages: vec![AgentStage::Execute, AgentStage::Report],
        fallback_to_single_agent: false,
        fallback_reason: None,
    }
}

fn orchestrated_decision() -> OrchestrationDecision {
    OrchestrationDecision {
        mode: AgentExecutionMode::Orchestrated,
        stages: vec![
            AgentStage::Explore,
            AgentStage::Plan,
            AgentStage::Execute,
            AgentStage::Verify,
            AgentStage::Report,
        ],
        fallback_to_single_agent: false,
        fallback_reason: None,
    }
}

pub fn apply_verification_result_to_report(state: &mut GraphState) {
    let Some(report) = state.verify.report.as_ref() else {
        return;
    };
    if matches!(report.verdict, VerificationVerdict::Pass) {
        return;
    }

    let prefix = match report.verdict {
        VerificationVerdict::Fail => "Verification: fail",
        VerificationVerdict::Partial => "Verification: partial",
        VerificationVerdict::Pass => "Verification: pass",
    };
    let note = format!("{} - {}", prefix, report.summary);
    match state.report.final_result.as_mut() {
        Some(final_result) => {
            if !final_result.contains(prefix) {
                final_result.push_str("\n\n");
                final_result.push_str(&note);
            }
        }
        None => state.report.final_result = Some(note),
    }
}

fn is_complex_task(task: &str, context: &TaskContext) -> bool {
    let trimmed = task.trim();
    if trimmed.chars().count() >= COMPLEX_TASK_CHAR_THRESHOLD {
        return true;
    }
    if trimmed
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count()
        > 1
    {
        return true;
    }
    if context.history.len() >= COMPLEX_HISTORY_THRESHOLD {
        return true;
    }
    let retrieved_context_count = context.rag_results.len() + context.resolved_links.len();
    if retrieved_context_count >= COMPLEX_CONTEXT_THRESHOLD {
        return true;
    }
    if context
        .active_note_content
        .as_deref()
        .map(|content| content.len() >= 2000)
        .unwrap_or(false)
    {
        return true;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::types::{AgentExecutionMode, RagResult, TaskContext};

    #[test]
    fn auto_mode_keeps_simple_tasks_on_legacy_path() {
        let decision = plan_orchestration(
            "帮我总结一下这个文件",
            &TaskContext {
                workspace_path: "/tmp/workspace".to_string(),
                ..TaskContext::default()
            },
            AgentExecutionMode::Auto,
        );

        assert_eq!(decision.mode, AgentExecutionMode::LegacySingleAgent);
        assert_eq!(
            decision.stages,
            vec![AgentStage::Execute, AgentStage::Report]
        );
        assert!(!decision.fallback_to_single_agent);
    }

    #[test]
    fn auto_mode_marks_context_heavy_tasks_as_orchestrated() {
        let decision = plan_orchestration(
            "请先梳理相关实现，再规划修改点，最后帮我改代码并验证。",
            &TaskContext {
                workspace_path: "/tmp/workspace".to_string(),
                rag_results: vec![
                    RagResult {
                        file_path: "a.md".to_string(),
                        content: "alpha".to_string(),
                        score: 0.9,
                        heading: None,
                    },
                    RagResult {
                        file_path: "b.md".to_string(),
                        content: "beta".to_string(),
                        score: 0.8,
                        heading: None,
                    },
                    RagResult {
                        file_path: "c.md".to_string(),
                        content: "gamma".to_string(),
                        score: 0.7,
                        heading: None,
                    },
                ],
                ..TaskContext::default()
            },
            AgentExecutionMode::Auto,
        );

        assert_eq!(decision.mode, AgentExecutionMode::Orchestrated);
        assert!(!decision.fallback_to_single_agent);
        assert_eq!(
            decision.stages,
            vec![
                AgentStage::Explore,
                AgentStage::Plan,
                AgentStage::Execute,
                AgentStage::Verify,
                AgentStage::Report,
            ]
        );
    }
}
