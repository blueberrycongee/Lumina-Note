use crate::agent::llm_client::LlmClient;
use crate::agent::types::{
    AgentConfig, GraphState, VerificationCheck, VerificationCommandResult, VerificationReport,
    VerificationVerdict,
};
use serde::Deserialize;
use std::path::Path;
use std::process::Stdio;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::{sleep, Duration};

const VERIFY_TIMEOUT_MS: u64 = 120_000;

#[derive(Debug, Deserialize)]
struct VerifyLlmOutput {
    verdict: VerificationVerdict,
    summary: String,
    #[serde(default)]
    checks: Vec<VerificationCheck>,
    #[serde(default)]
    outstanding_risks: Vec<String>,
}

pub async fn run_verify(
    config: &AgentConfig,
    state: &GraphState,
    http_client: reqwest::Client,
) -> VerificationReport {
    let command_results = maybe_run_verification_commands(config, state).await;
    let fallback = fallback_report(state, command_results.clone());

    let mut llm_config = config.clone();
    llm_config.temperature = 0.1;
    llm_config.max_tokens = llm_config.max_tokens.min(1600).max(500);
    let llm = LlmClient::new(llm_config, http_client);

    let prompt = format!(
        "You are Lumina's VerificationAgent.\n\
Return JSON only with keys: verdict, summary, checks, outstanding_risks.\n\
Allowed verdict values: pass, fail, partial.\n\
Each checks item must include: label, result, detail.\n\
Focus on whether the execution appears to satisfy the user's goal.\n\n\
User goal:\n{}\n\n\
Plan:\n{}\n\n\
Modified files:\n{}\n\n\
Executed commands:\n{}\n\n\
Execution observations:\n{}\n\n\
Verification commands:\n{}\n",
        state.user_task(),
        render_plan(state),
        render_string_list(&state.execute.modified_files),
        render_string_list(&state.execute.executed_commands),
        render_string_list(&truncate_items(&state.execute.observations, 8, 240)),
        render_command_results(&command_results),
    );

    let raw = match llm.call_simple(&prompt).await {
        Ok(raw) => raw,
        Err(_) => return fallback,
    };
    let payload = match extract_json_object(&raw) {
        Some(payload) => payload,
        None => return fallback,
    };
    let parsed = match serde_json::from_str::<VerifyLlmOutput>(&payload) {
        Ok(parsed) => parsed,
        Err(_) => return fallback,
    };

    let mut report = fallback;
    report.verdict = parsed.verdict;
    if !parsed.summary.trim().is_empty() {
        report.summary = parsed.summary;
    }
    if !parsed.checks.is_empty() {
        report.checks = parsed.checks;
    }
    if !parsed.outstanding_risks.is_empty() {
        report.outstanding_risks = parsed.outstanding_risks;
    }
    report
}

async fn maybe_run_verification_commands(
    config: &AgentConfig,
    state: &GraphState,
) -> Vec<VerificationCommandResult> {
    if !config.auto_approve {
        return Vec::new();
    }

    let workspace = state.workspace_path();
    if workspace.trim().is_empty() {
        return Vec::new();
    }

    if state
        .execute
        .modified_files
        .iter()
        .any(|file| file.starts_with("src-tauri/") && file.ends_with(".rs"))
        && Path::new(workspace)
            .join("src-tauri")
            .join("Cargo.toml")
            .exists()
    {
        let command = "cargo test --manifest-path src-tauri/Cargo.toml agent::".to_string();
        return vec![run_command(workspace, &command, "Run targeted Rust agent tests").await];
    }

    Vec::new()
}

async fn run_command(workdir: &str, command: &str, description: &str) -> VerificationCommandResult {
    let mut child = match Command::new("/bin/zsh")
        .arg("-lc")
        .arg(command)
        .current_dir(workdir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            return VerificationCommandResult {
                command: command.to_string(),
                description: description.to_string(),
                exit_code: None,
                ran: false,
                output: format!("Failed to spawn verification command: {}", err),
            };
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(mut out) = stdout {
            let _ = out.read_to_end(&mut buf).await;
        }
        buf
    });
    let stderr_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(mut err) = stderr {
            let _ = err.read_to_end(&mut buf).await;
        }
        buf
    });

    let status_result = tokio::select! {
        status = child.wait() => status.ok(),
        _ = sleep(Duration::from_millis(VERIFY_TIMEOUT_MS)) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            None
        }
    };

    let stdout = stdout_task.await.unwrap_or_default();
    let stderr = stderr_task.await.unwrap_or_default();
    let mut output = format!(
        "{}{}",
        String::from_utf8_lossy(&stdout),
        String::from_utf8_lossy(&stderr)
    );
    if status_result.is_none() {
        output.push_str(&format!(
            "\n\n(verification command timed out after {} ms)",
            VERIFY_TIMEOUT_MS
        ));
    }

    VerificationCommandResult {
        command: command.to_string(),
        description: description.to_string(),
        exit_code: status_result.and_then(|status| status.code()),
        ran: status_result.is_some(),
        output: trim_output(&output),
    }
}

fn fallback_report(
    state: &GraphState,
    command_results: Vec<VerificationCommandResult>,
) -> VerificationReport {
    let command_failed = command_results
        .iter()
        .any(|item| item.ran && item.exit_code.unwrap_or(1) != 0);
    let verdict = if command_failed {
        VerificationVerdict::Fail
    } else if state.execute.modified_files.is_empty() {
        VerificationVerdict::Partial
    } else {
        VerificationVerdict::Pass
    };

    let mut checks = Vec::new();
    checks.push(VerificationCheck {
        label: "Modified files captured".to_string(),
        result: if state.execute.modified_files.is_empty() {
            VerificationVerdict::Partial
        } else {
            VerificationVerdict::Pass
        },
        detail: if state.execute.modified_files.is_empty() {
            "执行阶段没有记录到明确的文件修改。".to_string()
        } else {
            format!("记录到 {} 个修改文件。", state.execute.modified_files.len())
        },
    });
    checks.push(VerificationCheck {
        label: "Execution evidence".to_string(),
        result: if state.execute.observations.is_empty() {
            VerificationVerdict::Partial
        } else {
            VerificationVerdict::Pass
        },
        detail: if state.execute.observations.is_empty() {
            "缺少可复用的执行观察结果。".to_string()
        } else {
            format!(
                "保留了 {} 条执行观察记录。",
                state.execute.observations.len()
            )
        },
    });
    if !command_results.is_empty() {
        checks.push(VerificationCheck {
            label: "Command-based verification".to_string(),
            result: if command_failed {
                VerificationVerdict::Fail
            } else {
                VerificationVerdict::Pass
            },
            detail: if command_failed {
                "自动验证命令未通过。".to_string()
            } else {
                "自动验证命令通过。".to_string()
            },
        });
    }

    let mut outstanding_risks = Vec::new();
    if state.execute.modified_files.is_empty() {
        outstanding_risks.push("没有记录到修改文件，需人工确认任务是否真的落地。".to_string());
    }
    if command_results.is_empty() {
        outstanding_risks
            .push("未自动运行项目级测试，结论主要基于执行产物与静态证据。".to_string());
    }

    VerificationReport {
        verdict: verdict.clone(),
        summary: match verdict {
            VerificationVerdict::Pass => "验证通过：执行结果与记录的产物基本一致。".to_string(),
            VerificationVerdict::Fail => {
                "验证失败：自动验证命令或关键证据显示任务未完全满足。".to_string()
            }
            VerificationVerdict::Partial => {
                "部分验证：已有执行证据，但仍缺少足够的自动验证结论。".to_string()
            }
        },
        checks,
        command_results,
        outstanding_risks,
    }
}

fn render_plan(state: &GraphState) -> String {
    state
        .plan
        .current_plan
        .as_ref()
        .map(|plan| {
            plan.steps
                .iter()
                .map(|step| {
                    format!(
                        "- [{}] {} :: {}",
                        stage_name(&step.role),
                        step.id,
                        step.step
                    )
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| "(none)".to_string())
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

fn truncate_items(items: &[String], max_items: usize, max_chars: usize) -> Vec<String> {
    items
        .iter()
        .take(max_items)
        .map(|item| trim_output_limit(item, max_chars))
        .collect()
}

fn render_command_results(items: &[VerificationCommandResult]) -> String {
    if items.is_empty() {
        return "(none)".to_string();
    }
    items
        .iter()
        .map(|item| {
            format!(
                "- {} :: ran={} exit={:?}\n{}",
                item.command,
                item.ran,
                item.exit_code,
                trim_output_limit(&item.output, 240)
            )
        })
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

fn trim_output(text: &str) -> String {
    trim_output_limit(text, 8_000)
}

fn trim_output_limit(text: &str, limit: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= limit {
        return trimmed.to_string();
    }
    let mut out = trimmed
        .chars()
        .take(limit.saturating_sub(1))
        .collect::<String>();
    out.push('…');
    out
}

fn stage_name(stage: &crate::agent::types::AgentStage) -> &'static str {
    match stage {
        crate::agent::types::AgentStage::Explore => "explore",
        crate::agent::types::AgentStage::Plan => "plan",
        crate::agent::types::AgentStage::Execute => "execute",
        crate::agent::types::AgentStage::Verify => "verify",
        crate::agent::types::AgentStage::Report => "report",
    }
}
