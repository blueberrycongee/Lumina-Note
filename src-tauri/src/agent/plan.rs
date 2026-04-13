use crate::agent::llm_client::LlmClient;
use crate::agent::types::{
    AgentConfig, AgentStage, GraphState, Plan, PlanStageState, PlanStep, PlanStepStatus, TaskIntent,
};
use serde::Deserialize;
use std::collections::BTreeSet;

#[derive(Debug, Deserialize)]
struct PlanLlmOutput {
    #[serde(default)]
    intent: Option<TaskIntent>,
    #[serde(default)]
    explanation: Option<String>,
    #[serde(default)]
    steps: Vec<PlanStepDraft>,
}

#[derive(Debug, Deserialize)]
struct PlanStepDraft {
    #[serde(default)]
    id: Option<String>,
    step: String,
    #[serde(default)]
    role: Option<AgentStage>,
    #[serde(default)]
    expected_artifacts: Vec<String>,
}

pub async fn run_plan(
    config: &AgentConfig,
    state: &GraphState,
    http_client: reqwest::Client,
) -> PlanStageState {
    let fallback = fallback_plan_state(state);
    let Some(explore_report) = state.explore.report.as_ref() else {
        return fallback;
    };

    let mut llm_config = config.clone();
    llm_config.temperature = 0.2;
    llm_config.max_tokens = llm_config.max_tokens.min(1800).max(700);
    let llm = LlmClient::new(llm_config, http_client);

    let prompt = format!(
        "You are Lumina's PlanAgent.\n\
Return JSON only with keys: intent, explanation, steps.\n\
Each step must include: id, step, role, expected_artifacts.\n\
Allowed role values: explore, plan, execute, verify, report.\n\
Do not include edit instructions outside the plan.\n\
The generated plan must be realistic for execution inside the current codebase.\n\n\
User task:\n{}\n\n\
Explore summary:\n{}\n\n\
Related files:\n{}\n\n\
Key locations:\n{}\n\n\
Risks:\n{}\n",
        state.user_task(),
        explore_report.summary,
        render_string_list(&explore_report.related_files),
        render_file_refs(&explore_report.key_locations),
        render_string_list(&explore_report.risks),
    );

    let raw = match llm.call_simple(&prompt).await {
        Ok(raw) => raw,
        Err(_) => return fallback,
    };
    let payload = match extract_json_object(&raw) {
        Some(payload) => payload,
        None => return fallback,
    };
    let parsed = match serde_json::from_str::<PlanLlmOutput>(&payload) {
        Ok(parsed) => parsed,
        Err(_) => return fallback,
    };

    let mut current_plan = normalize_plan(parsed.steps, parsed.explanation, state);
    sync_plan_statuses(&mut current_plan, AgentStage::Execute);

    PlanStageState {
        intent: parsed
            .intent
            .unwrap_or_else(|| infer_intent(state.user_task())),
        current_plan: Some(current_plan),
        plan_iterations: 1,
    }
}

pub fn sync_plan_statuses(plan: &mut Plan, stage: AgentStage) {
    let current_order = stage_order(stage.clone());
    let mut current_role_claimed = false;

    for step in &mut plan.steps {
        let order = stage_order(step.role.clone());
        step.status = if order < current_order {
            PlanStepStatus::Completed
        } else if order > current_order {
            PlanStepStatus::Pending
        } else if current_role_claimed || matches!(stage, AgentStage::Report) {
            PlanStepStatus::Pending
        } else {
            current_role_claimed = true;
            PlanStepStatus::InProgress
        };
    }

    if matches!(stage, AgentStage::Report) {
        for step in &mut plan.steps {
            if step.role != AgentStage::Report {
                step.status = PlanStepStatus::Completed;
            }
        }
        if let Some(step) = plan
            .steps
            .iter_mut()
            .find(|step| step.role == AgentStage::Report)
        {
            step.status = PlanStepStatus::InProgress;
        }
    }
}

pub fn mark_stage_completed(plan: &mut Plan, stage: AgentStage) {
    for step in &mut plan.steps {
        if step.role == stage {
            step.status = PlanStepStatus::Completed;
        }
    }
}

fn fallback_plan_state(state: &GraphState) -> PlanStageState {
    let mut current_plan = Plan {
        explanation: Some("基于 Explore 结果生成的执行前计划。".to_string()),
        steps: vec![
            PlanStep {
                id: "explore-context".to_string(),
                step: "梳理当前 Agent 编排实现与 Phase 2 目标之间的差距".to_string(),
                role: AgentStage::Explore,
                status: PlanStepStatus::Completed,
                expected_artifacts: vec!["ExploreReport".to_string()],
            },
            PlanStep {
                id: "plan-phase2".to_string(),
                step: "整理后端数据结构、角色边界和前端展示需要的计划模型".to_string(),
                role: AgentStage::Plan,
                status: PlanStepStatus::Completed,
                expected_artifacts: vec!["Structured Plan".to_string()],
            },
            PlanStep {
                id: "implement-phase2".to_string(),
                step: "接入 Explore / Plan / Verify 角色并把执行上下文注入 Execute 阶段"
                    .to_string(),
                role: AgentStage::Execute,
                status: PlanStepStatus::InProgress,
                expected_artifacts: vec![
                    "新增角色模块".to_string(),
                    "更新编排逻辑".to_string(),
                    "执行阶段上下文".to_string(),
                ],
            },
            PlanStep {
                id: "verify-phase2".to_string(),
                step: "对修改结果做结构化验证，并补充必要测试或风险提示".to_string(),
                role: AgentStage::Verify,
                status: PlanStepStatus::Pending,
                expected_artifacts: vec!["VerificationReport".to_string()],
            },
        ],
    };
    sync_plan_statuses(&mut current_plan, AgentStage::Execute);

    PlanStageState {
        intent: infer_intent(state.user_task()),
        current_plan: Some(current_plan),
        plan_iterations: 1,
    }
}

fn normalize_plan(
    drafts: Vec<PlanStepDraft>,
    explanation: Option<String>,
    state: &GraphState,
) -> Plan {
    let mut seen = BTreeSet::new();
    let mut steps = Vec::new();
    for (index, draft) in drafts.into_iter().enumerate() {
        let step = draft.step.trim();
        if step.is_empty() {
            continue;
        }
        let id = draft
            .id
            .unwrap_or_else(|| format!("step-{}", index + 1))
            .trim()
            .to_string();
        let unique_id = if seen.insert(id.clone()) {
            id
        } else {
            format!("{}-{}", id, index + 1)
        };
        steps.push(PlanStep {
            id: unique_id,
            step: step.to_string(),
            role: draft.role.unwrap_or(AgentStage::Execute),
            status: PlanStepStatus::Pending,
            expected_artifacts: dedupe_strings(draft.expected_artifacts),
        });
    }

    if steps.is_empty() {
        return fallback_plan_state(state).current_plan.unwrap_or_default();
    }

    ensure_role_step(
        &mut steps,
        AgentStage::Explore,
        "完成上下文梳理并确认切入点",
    );
    ensure_role_step(&mut steps, AgentStage::Plan, "整理执行计划与预期产物");
    ensure_role_step(
        &mut steps,
        AgentStage::Execute,
        "落实代码修改并记录执行产物",
    );
    ensure_role_step(&mut steps, AgentStage::Verify, "验证结果并输出 verdict");

    Plan { steps, explanation }
}

fn ensure_role_step(steps: &mut Vec<PlanStep>, role: AgentStage, fallback_step: &str) {
    if steps.iter().any(|step| step.role == role) {
        return;
    }

    steps.push(PlanStep {
        id: format!("{:?}", role).to_ascii_lowercase(),
        step: fallback_step.to_string(),
        role: role.clone(),
        status: PlanStepStatus::Pending,
        expected_artifacts: match role {
            AgentStage::Explore => vec!["ExploreReport".to_string()],
            AgentStage::Plan => vec!["Structured Plan".to_string()],
            AgentStage::Execute => vec!["Code changes".to_string()],
            AgentStage::Verify => vec!["VerificationReport".to_string()],
            AgentStage::Report => vec!["Final summary".to_string()],
        },
    });
}

fn infer_intent(task: &str) -> TaskIntent {
    let lowered = task.to_ascii_lowercase();
    if lowered.contains("搜索") || lowered.contains("查") || lowered.contains("research") {
        TaskIntent::Search
    } else if lowered.contains("创建") || lowered.contains("新建") || lowered.contains("create")
    {
        TaskIntent::Create
    } else if lowered.contains("整理") || lowered.contains("organize") {
        TaskIntent::Organize
    } else if lowered.contains("flashcard") || lowered.contains("闪卡") {
        TaskIntent::Flashcard
    } else if lowered.contains("修改")
        || lowered.contains("实现")
        || lowered.contains("fix")
        || lowered.contains("edit")
    {
        TaskIntent::Edit
    } else {
        TaskIntent::Complex
    }
}

fn stage_order(stage: AgentStage) -> usize {
    match stage {
        AgentStage::Explore => 0,
        AgentStage::Plan => 1,
        AgentStage::Execute => 2,
        AgentStage::Verify => 3,
        AgentStage::Report => 4,
    }
}

fn render_string_list(items: &[String]) -> String {
    if items.is_empty() {
        return "(none)".to_string();
    }
    items
        .iter()
        .map(|item| format!("- {}", item))
        .collect::<Vec<_>>()
        .join("\n")
}

fn render_file_refs(items: &[crate::agent::types::ExploreFileRef]) -> String {
    if items.is_empty() {
        return "(none)".to_string();
    }
    items
        .iter()
        .map(|item| format!("- {} :: {}", item.file_path, item.reason))
        .collect::<Vec<_>>()
        .join("\n")
}

fn extract_json_object(raw: &str) -> Option<String> {
    if let Some(stripped) = raw.split("```json").nth(1) {
        let candidate = stripped.split("```").next()?.trim();
        if candidate.starts_with('{') {
            return Some(candidate.to_string());
        }
    }
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(raw[start..=end].to_string())
}

fn dedupe_strings(items: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for item in items {
        let trimmed = item.trim();
        if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
            continue;
        }
        out.push(trimmed.to_string());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_plan_marks_execute_step_in_progress() {
        let mut plan = Plan {
            explanation: None,
            steps: vec![
                PlanStep {
                    id: "explore".to_string(),
                    step: "explore".to_string(),
                    role: AgentStage::Explore,
                    status: PlanStepStatus::Pending,
                    expected_artifacts: vec![],
                },
                PlanStep {
                    id: "execute".to_string(),
                    step: "execute".to_string(),
                    role: AgentStage::Execute,
                    status: PlanStepStatus::Pending,
                    expected_artifacts: vec![],
                },
            ],
        };
        sync_plan_statuses(&mut plan, AgentStage::Execute);
        assert_eq!(plan.steps[0].status, PlanStepStatus::Completed);
        assert_eq!(plan.steps[1].status, PlanStepStatus::InProgress);
    }
}
