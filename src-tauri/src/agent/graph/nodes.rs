//! 图节点实现
//! 
//! 每个节点代表一个智能体的处理逻辑

use crate::agent::types::*;
use crate::agent::llm_client::LlmClient;
use crate::agent::tools::{get_tools_for_agent, ToolRegistry};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

/// 节点处理结果
pub struct NodeResult {
    pub state: GraphState,
    pub next_node: Option<String>,
}

/// 协调器节点 - 理解用户意图
pub async fn coordinator_node(
    app: &AppHandle,
    llm: &LlmClient,
    mut state: GraphState,
) -> Result<NodeResult, String> {
    use crate::agent::debug_log as dbg;
    use crate::agent::workspace_layout::{generate_workspace_layout, WorkspaceLayoutConfig};
    
    dbg::log_separator("协调器节点 (Coordinator)");
    
    let _ = app.emit("agent-event", AgentEvent::StatusChange {
        status: AgentStatus::Running,
    });

    // 生成工作区目录结构（如果尚未生成）
    // 类似 Windsurf 的 workspace_layout，在会话开始时注入
    let workspace_layout = if let Some(ref existing) = state.file_tree {
        existing.clone()
    } else {
        let config = WorkspaceLayoutConfig::default();
        match generate_workspace_layout(&state.workspace_path, &config).await {
            Ok(layout) => {
                // 缓存到 state，供后续节点复用
                state.file_tree = Some(layout.clone());
                layout
            }
            Err(e) => {
                dbg::log_error(&format!("Failed to generate workspace layout: {}", e));
                "(无法读取目录结构)".to_string()
            }
        }
    };

    // 构建系统提示 - 现在包含目录结构上下文
    let system_prompt = format!(
        r#"你是 Lumina，一个智能笔记助手。分析用户的请求，判断任务类型。

任务类型：
- chat: 简单聊天、问答，不需要操作笔记
- edit: 编辑现有笔记
- create: 创建新笔记
- organize: 整理、移动、删除文件
- search: 搜索、研究信息
- complex: 复杂任务，需要多步骤完成

当前工作区：{}
当前笔记：{}

以下是笔记库的目录结构快照（对话开始时生成）：
{}

注意：此目录结构为静态快照，可能：
- 不反映对话期间的文件变更
- 对大型笔记库进行了裁剪
如需最新信息，请使用 list_notes 或 search_notes 工具。

请用 JSON 格式回复：
{{"intent": "chat|edit|create|organize|search|complex", "reason": "判断理由"}}
"#,
        state.workspace_path,
        state.active_note_path.as_deref().unwrap_or("无"),
        workspace_layout
    );

    // 构建消息
    let messages = vec![
        Message {
            role: MessageRole::System,
            content: system_prompt,
            name: None,
            tool_call_id: None,
        },
        Message {
            role: MessageRole::User,
            content: state.user_task.clone(),
            name: None,
            tool_call_id: None,
        },
    ];

    // 调用 LLM
    let response = llm.call(&messages, None).await?;
    
    // 发送 token 使用量
    let _ = app.emit("agent-event", AgentEvent::TokenUsage {
        prompt_tokens: response.prompt_tokens,
        completion_tokens: response.completion_tokens,
        total_tokens: response.total_tokens,
    });

    // 解析意图
    let intent = parse_intent(&response.content);
    state.intent = intent.clone();
    
    // 调试日志：记录意图分析结果
    let route = match intent {
        TaskIntent::Chat => "reporter",
        TaskIntent::Edit => "editor",
        TaskIntent::Create => "writer",
        TaskIntent::Organize => "organizer",
        TaskIntent::Search => "researcher",
        TaskIntent::Complex => "planner",
    };
    dbg::log_intent(&format!("{:?}", intent), route, &response.content);

    // 发送意图分析结果作为一条完整的消息
    // 使用 AgentMessage 事件来确保消息被单独保存
    let intent_message = format!("🎯 意图分析：{:?}\n📍 路由到：{}", 
        intent,
        match intent {
            TaskIntent::Chat => "reporter（直接回复）",
            TaskIntent::Edit => "editor（编辑笔记）",
            TaskIntent::Create => "writer（创建笔记）",
            TaskIntent::Organize => "organizer（整理文件）",
            TaskIntent::Search => "researcher（搜索研究）",
            TaskIntent::Complex => "planner（复杂任务规划）",
        }
    );
    
    // 发送完整消息事件
    let _ = app.emit("agent-event", AgentEvent::IntentAnalysis {
        intent: format!("{:?}", intent),
        route: match intent {
            TaskIntent::Chat => "reporter".to_string(),
            TaskIntent::Edit => "editor".to_string(),
            TaskIntent::Create => "writer".to_string(),
            TaskIntent::Organize => "organizer".to_string(),
            TaskIntent::Search => "researcher".to_string(),
            TaskIntent::Complex => "planner".to_string(),
        },
        message: intent_message,
    });

    // 决定下一个节点 - 直接路由到对应 Agent
    // Agent 会自己调用 create_plan 工具来创建计划
    let next_node = match intent {
        TaskIntent::Chat => Some("reporter".to_string()),
        TaskIntent::Edit => Some("editor".to_string()),
        TaskIntent::Create => Some("writer".to_string()),
        TaskIntent::Organize => Some("organizer".to_string()),
        TaskIntent::Search => Some("researcher".to_string()),
        TaskIntent::Complex => Some("researcher".to_string()), // 复杂任务先让 researcher 分析
    };

    state.goto = next_node.clone().unwrap_or_default();

    Ok(NodeResult {
        state,
        next_node,
    })
}

/// 规划器节点 - 为任务生成执行计划
pub async fn planner_node(
    app: &AppHandle,
    llm: &LlmClient,
    mut state: GraphState,
) -> Result<NodeResult, String> {
    let system_prompt = format!(
        r#"你是任务规划专家。为用户任务生成 1-5 个执行步骤。

规则：
1. 步骤数量：1-5 个，根据任务复杂度决定
2. 简单任务（如"列出笔记"）只需 1-2 步
3. 复杂任务可以 3-5 步
4. 每个步骤要具体、可执行
5. 意图类型已分析为：{:?}

每个步骤需要指定执行者：
- editor: 编辑笔记
- researcher: 搜索研究、列出笔记、查找信息
- writer: 创建新内容
- organizer: 文件整理、移动删除

请用 JSON 格式回复：
{{
  "steps": [
    {{"id": "1", "description": "具体步骤描述", "agent": "editor|researcher|writer|organizer"}}
  ]
}}

示例（简单任务 - 列出笔记）：
{{
  "steps": [
    {{"id": "1", "description": "列出笔记库根目录和主要子目录结构", "agent": "researcher"}},
    {{"id": "2", "description": "总结笔记库内容并报告给用户", "agent": "researcher"}}
  ]
}}

当前任务：{}
工作区：{}
"#,
        state.intent,
        state.user_task,
        state.workspace_path
    );

    let messages = vec![
        Message {
            role: MessageRole::System,
            content: system_prompt,
            name: None,
            tool_call_id: None,
        },
        Message {
            role: MessageRole::User,
            content: state.user_task.clone(),
            name: None,
            tool_call_id: None,
        },
    ];

    let response = llm.call(&messages, None).await?;
    
    // 发送 token 使用量
    let _ = app.emit("agent-event", AgentEvent::TokenUsage {
        prompt_tokens: response.prompt_tokens,
        completion_tokens: response.completion_tokens,
        total_tokens: response.total_tokens,
    });

    // 解析计划
    if let Some(plan) = parse_plan(&response.content) {
        let _ = app.emit("agent-event", AgentEvent::PlanUpdated {
            plan: plan.clone(),
        });
        state.current_plan = Some(plan);
        state.goto = "executor".to_string();
    } else {
        // 无法解析计划，直接交给 reporter
        state.goto = "reporter".to_string();
    }

    state.plan_iterations += 1;
    let next = state.goto.clone();

    Ok(NodeResult {
        state,
        next_node: Some(next),
    })
}

/// 执行器节点 - 根据意图路由到对应的 agent (Windsurf 风格简化)
pub async fn executor_node(
    _app: &AppHandle,
    _llm: &LlmClient,
    mut state: GraphState,
) -> Result<NodeResult, String> {
    // Windsurf 风格：计划只是展示给用户的，实际执行根据 intent 决定
    // 直接根据意图路由到合适的 agent
    let next_node = match state.intent {
        TaskIntent::Edit | TaskIntent::Create | TaskIntent::Organize => "editor",
        TaskIntent::Search | TaskIntent::Complex => "researcher",
        _ => "researcher", // 默认使用 researcher
    };

    state.goto = next_node.to_string();

    Ok(NodeResult {
        state,
        next_node: Some(next_node.to_string()),
    })
}

/// 编辑器节点
pub async fn editor_node(
    app: &AppHandle,
    llm: &LlmClient,
    state: GraphState,
) -> Result<NodeResult, String> {
    agent_worker_node(app, llm, state, AgentType::Editor, "editor").await
}

/// 研究员节点
pub async fn researcher_node(
    app: &AppHandle,
    llm: &LlmClient,
    state: GraphState,
) -> Result<NodeResult, String> {
    agent_worker_node(app, llm, state, AgentType::Researcher, "researcher").await
}

/// 写作者节点
pub async fn writer_node(
    app: &AppHandle,
    llm: &LlmClient,
    state: GraphState,
) -> Result<NodeResult, String> {
    agent_worker_node(app, llm, state, AgentType::Writer, "writer").await
}

/// 整理者节点
pub async fn organizer_node(
    app: &AppHandle,
    llm: &LlmClient,
    state: GraphState,
) -> Result<NodeResult, String> {
    agent_worker_node(app, llm, state, AgentType::Organizer, "organizer").await
}

/// 通用工作节点
async fn agent_worker_node(
    app: &AppHandle,
    llm: &LlmClient,
    mut state: GraphState,
    agent_type: AgentType,
    agent_name: &str,
) -> Result<NodeResult, String> {
    use crate::agent::note_map::{generate_note_map, extract_mentioned_notes, NoteMapConfig};
    use crate::agent::messages::{ChatChunks, FORMAT_REMINDER};
    use crate::agent::debug_log as dbg;
    
    let tools = get_tools_for_agent(agent_name);
    let tool_registry = ToolRegistry::new(state.workspace_path.clone());

    // ========== 使用 ChatChunks 分层构建消息 ==========
    
    // 1. 构建系统提示（身份 + 规则 + 基础格式提醒）
    // 包含 workspace_layout（由 coordinator 生成并缓存在 state.file_tree 中）
    let supports_fc = llm.supports_fc();
    let workspace_context = state.file_tree.as_deref().unwrap_or("(无目录结构)");
    let base_system = build_agent_prompt(agent_name, &state.workspace_path, workspace_context, supports_fc);
    let system_prompt = format!("{}\n{}", base_system, FORMAT_REMINDER);
    
    let mut chunks = ChatChunks::new(system_prompt);
    
    // 2. Note Map（按需生成）
    // 只有 editor 节点需要详细的标题大纲（用于精确定位章节）
    // 其他节点使用工具（read_outline）按需获取
    if agent_name == "editor" {
        let current_notes: Vec<String> = state.active_note_path
            .as_ref()
            .map(|p| vec![p.clone()])
            .unwrap_or_default();
        
        // 从用户消息和历史中提取提到的笔记
        let mut mentioned_notes = extract_mentioned_notes(&state.user_task);
        for msg in &state.messages {
            mentioned_notes.extend(extract_mentioned_notes(&msg.content));
        }
        
        let note_map_config = NoteMapConfig {
            max_tokens: 1024,
            show_word_count: true,
            max_heading_depth: 3,
        };
        
        // 生成 Note Map（异步操作）
        if let Ok(note_map) = generate_note_map(
            &state.workspace_path,
            &current_notes,
            &mentioned_notes,
            &note_map_config,
        ).await {
            if !note_map.is_empty() && note_map != "(笔记库为空)" {
                chunks = chunks.with_note_map(note_map);
            }
        }
    }
    
    // 3. 当前笔记（独立消息块）
    if let (Some(ref path), Some(ref content)) = (&state.active_note_path, &state.active_note_content) {
        chunks = chunks.with_current_note(path.clone(), content.clone());
    }
    
    // 4. RAG 搜索结果（作为历史消息的一部分）
    // 注：RAG 结果现在放在历史消息前面，作为参考上下文
    let mut rag_messages = Vec::new();
    if !state.rag_results.is_empty() {
        let rag_text: Vec<String> = state.rag_results.iter()
            .map(|r| format!("文件: {}\n{}", r.file_path, r.content))
            .collect();
        rag_messages.push(Message {
            role: MessageRole::User,
            content: format!("以下是通过语义搜索找到的相关笔记片段：\n\n{}", rag_text.join("\n---\n")),
            name: None,
            tool_call_id: None,
        });
        rag_messages.push(Message {
            role: MessageRole::Assistant,
            content: "好的，我会参考这些相关内容。".to_string(),
            name: None,
            tool_call_id: None,
        });
    }
    
    // 5. 历史对话消息
    let mut history = rag_messages;
    history.extend(state.messages.clone());
    chunks = chunks.with_history(history);
    
    // 6. 当前任务
    chunks = chunks.with_task(state.user_task.clone());
    
    // 7. 之前的工具调用结果
    for obs in &state.observations {
        chunks.add_tool_result(obs.clone());
    }
    
    // 转换为消息列表
    let mut messages = chunks.to_messages();

    // 多轮工具调用循环
    let max_iterations = 15; // 防止无限循环
    let mut iteration = 0;
    
    loop {
        iteration += 1;
        if iteration > max_iterations {
            // 超过最大迭代次数，强制结束
            state.observations.push("[系统] 达到最大工具调用次数，自动结束".to_string());
            dbg::log_error("达到最大工具调用次数，自动结束");
            break;
        }
        
        // 调试日志：记录迭代开始
        dbg::log_iteration(iteration);
        
        // 调试日志：记录发送给 LLM 的消息
        dbg::log_llm_request(&messages, Some(&tools));
        
        // 调用 LLM（非流式，工作节点不需要流式输出给用户）
        let response = match llm.call(&messages, Some(&tools)).await {
            Ok(r) => r,
            Err(e) => {
                dbg::log_error(&format!("LLM 调用失败: {}", e));
                return Err(e);
            }
        };
        
        // 调试日志：记录 LLM 响应
        dbg::log_llm_response(
            &response.content,
            response.tool_calls.as_deref(),
            (response.prompt_tokens, response.completion_tokens, response.total_tokens)
        );
        
        // 发送 token 使用量
        let _ = app.emit("agent-event", AgentEvent::TokenUsage {
            prompt_tokens: response.prompt_tokens,
            completion_tokens: response.completion_tokens,
            total_tokens: response.total_tokens,
        });

        // 获取工具调用：优先使用 FC 模式的直接返回，否则回退到 XML 解析
        let tool_calls = if let Some(fc_calls) = response.tool_calls {
            // FC 模式：直接使用 LLM 返回的结构化工具调用
            if fc_calls.is_empty() {
                break; // 没有工具调用，任务完成
            }
            fc_calls
        } else {
            // XML 模式：从文本中解析工具调用
            match parse_tool_calls(&response.content) {
                Some(calls) if !calls.is_empty() => calls,
                _ => break, // 没有工具调用，任务完成
            }
        };
        let mut should_complete = false;
        
        for tool_call in tool_calls {
            // 发送工具调用事件
            let _ = app.emit("agent-event", AgentEvent::ToolCall {
                tool: tool_call.clone(),
            });

            // 执行工具
            let result = tool_registry.execute(&tool_call).await;
            
            // 调试日志：记录工具执行结果
            dbg::log_tool_result(
                &tool_call.name,
                result.success,
                &result.content,
                result.error.as_deref()
            );

            // 发送工具结果事件
            let _ = app.emit("agent-event", AgentEvent::ToolResult {
                result: result.clone(),
            });

            // 处理 update_plan 工具 (Windsurf 风格)
            if tool_call.name == "update_plan" {
                if let Some(plan_value) = tool_call.params.get("plan") {
                    if let Some(plan_array) = plan_value.as_array() {
                        let explanation = tool_call.params.get("explanation")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        
                        let mut plan_steps = Vec::new();
                        for step in plan_array {
                            let step_text = step.get("step").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let status_str = step.get("status").and_then(|v| v.as_str()).unwrap_or("pending");
                            let status = match status_str {
                                "in_progress" => PlanStepStatus::InProgress,
                                "completed" => PlanStepStatus::Completed,
                                _ => PlanStepStatus::Pending,
                            };
                            plan_steps.push(PlanStep { step: step_text, status });
                        }
                        
                        let plan = Plan {
                            steps: plan_steps,
                            explanation,
                        };
                        
                        // 发送计划更新事件
                        let _ = app.emit("agent-event", AgentEvent::PlanUpdated {
                            plan: plan.clone(),
                        });
                        
                        // 构建反馈
                        let completed_count = plan.steps.iter()
                            .filter(|s| s.status == PlanStepStatus::Completed)
                            .count();
                        let in_progress: Vec<String> = plan.steps.iter()
                            .enumerate()
                            .filter(|(_, s)| s.status == PlanStepStatus::InProgress)
                            .map(|(i, s)| format!("{}. {}", i + 1, s.step))
                            .collect();
                        let pending: Vec<String> = plan.steps.iter()
                            .enumerate()
                            .filter(|(_, s)| s.status == PlanStepStatus::Pending)
                            .map(|(i, s)| format!("{}. {}", i + 1, s.step))
                            .collect();
                        
                        let feedback = format!(
                            "✅ 计划已更新 ({}/{})\n{}{}\n{}",
                            completed_count,
                            plan.steps.len(),
                            if let Some(ref exp) = plan.explanation { format!("说明: {}\n", exp) } else { String::new() },
                            if !in_progress.is_empty() { format!("执行中: {}\n", in_progress.join("，")) } else { String::new() },
                            if !pending.is_empty() { format!("待完成: {}", pending.join("，")) } else { "所有步骤已完成".to_string() }
                        );
                        
                        state.current_plan = Some(plan);
                        
                        // 添加反馈到消息历史
                        state.observations.push(format!("[update_plan] {}", feedback));
                        messages.push(Message {
                            role: MessageRole::User,
                            content: format!("工具 update_plan 执行结果：\n{}", feedback),
                            name: None,
                            tool_call_id: None,
                        });
                        continue; // 跳过默认的消息添加
                    }
                }
            }

            // 检查是否完成
            if tool_call.name == "attempt_completion" {
                // 检查计划是否全部完成 (Windsurf 风格)
                let all_steps_completed = state.current_plan.as_ref()
                    .map(|plan| plan.steps.iter().all(|s| s.status == PlanStepStatus::Completed))
                    .unwrap_or(true); // 没有计划则视为完成
                
                let incomplete_count = state.current_plan.as_ref()
                    .map(|plan| plan.steps.iter().filter(|s| s.status != PlanStepStatus::Completed).count())
                    .unwrap_or(0);
                
                if !all_steps_completed && iteration < max_iterations - 1 {
                    // 还有未完成的步骤，且未达最大次数，拒绝结束
                    let pending: Vec<String> = state.current_plan.as_ref()
                        .map(|plan| plan.steps.iter()
                            .enumerate()
                            .filter(|(_, s)| s.status != PlanStepStatus::Completed)
                            .map(|(i, s)| format!("{}. {}", i + 1, s.step))
                            .collect())
                        .unwrap_or_default();
                    
                    messages.push(Message {
                        role: MessageRole::User,
                        content: format!(
                            "[系统提醒] ⚠️ 拒绝结束！计划中还有 {} 个步骤未完成：\n{}\n\n请调用 update_plan 更新步骤状态后再调用 attempt_completion。",
                            incomplete_count,
                            pending.join("\n")
                        ),
                        name: None,
                        tool_call_id: None,
                    });
                    // 跳过后续处理，继续循环
                    continue;
                }
                
                if let Some(result_text) = tool_call.params.get("result").and_then(|v| v.as_str()) {
                    state.final_result = Some(result_text.to_string());
                    state.goto = "end".to_string();
                    return Ok(NodeResult {
                        state,
                        next_node: None, // 结束
                    });
                }
                should_complete = true;
            }

            // 添加到观察
            let observation = format!(
                "[{}] {}",
                tool_call.name,
                if result.success { &result.content } else { result.error.as_deref().unwrap_or("Unknown error") }
            );
            state.observations.push(observation.clone());
            
            // 将工具结果添加到消息历史，使用 User role（更兼容）
            messages.push(Message {
                role: MessageRole::User,
                content: format!("工具 {} 执行结果：\n{}", tool_call.name, 
                    if result.success { &result.content } else { result.error.as_deref().unwrap_or("Unknown error") }
                ),
                name: None,
                tool_call_id: None,
            });
            
            // 如果工具执行失败，添加动态提醒帮助 LLM 自修复
            if !result.success {
                use crate::agent::messages::detect_reminder_needed;
                if let Some(reminder) = detect_reminder_needed(result.error.as_deref()) {
                    messages.push(Message {
                        role: MessageRole::User,
                        content: format!("[系统提醒] {}", reminder),
                        name: None,
                        tool_call_id: None,
                    });
                }
            }
        }
        
        if should_complete {
            break;
        }
    }

    // 循环结束，发送最终计划状态
    if let Some(ref plan) = state.current_plan {
        let _ = app.emit("agent-event", AgentEvent::PlanUpdated {
            plan: plan.clone(),
        });
    }

    // 工具调用循环结束后，去 reporter 汇报
    state.goto = "reporter".to_string();
    Ok(NodeResult {
        state,
        next_node: Some("reporter".to_string()),
    })
}

/// 报告者节点 - 汇总结果
pub async fn reporter_node(
    app: &AppHandle,
    llm: &LlmClient,
    mut state: GraphState,
) -> Result<NodeResult, String> {
    // 如果已经有最终结果，直接返回
    if let Some(ref result) = state.final_result {
        let _ = app.emit("agent-event", AgentEvent::Complete {
            result: result.clone(),
        });
        let _ = app.emit("agent-event", AgentEvent::StatusChange {
            status: AgentStatus::Completed,
        });
        return Ok(NodeResult {
            state,
            next_node: None,
        });
    }

    // 根据意图决定回复风格
    let system_prompt = if state.intent == TaskIntent::Chat && state.observations.is_empty() {
        // 简单聊天模式 - 使用自然对话风格
        format!(
            r#"你是 Lumina，一个友好的笔记助手。请用自然、亲切的语言回复用户。
不要使用"任务完成"之类的格式化语言，就像朋友聊天一样回复。

当前工作区：{}
当前笔记：{}

**重要**：输出时请确保：
- 每个段落之间使用空行分隔
- 使用 Markdown 格式（如 **粗体**、列表等）
- 表格要正确格式化，每行独占一行
"#,
            state.workspace_path,
            state.active_note_path.as_deref().unwrap_or("无")
        )
    } else {
        // 任务完成模式 - 汇总执行结果
        let observations_text = state.observations.join("\n");
        format!(
            r#"你是任务报告专家。根据执行结果，向用户总结任务完成情况。

用户任务：{}

执行结果：
{}

请用友好的语言总结任务完成情况。

**输出格式要求**：
1. 使用 Markdown 格式输出
2. 每个段落、标题、列表项之间必须有换行符分隔
3. 表格格式示例：
| 列1 | 列2 |
|-----|-----|
| 值1 | 值2 |
4. 列表使用 - 或数字编号，每项独占一行
5. 不要把所有内容挤在一行
"#,
            state.user_task,
            observations_text
        )
    };

    let mut messages = vec![
        Message {
            role: MessageRole::System,
            content: system_prompt,
            name: None,
            tool_call_id: None,
        },
    ];
    
    // 对于简单聊天，添加用户消息
    if state.intent == TaskIntent::Chat {
        messages.push(Message {
            role: MessageRole::User,
            content: state.user_task.clone(),
            name: None,
            tool_call_id: None,
        });
    }

    let request_id = format!("reporter-{}", chrono::Utc::now().timestamp_millis());
    let response = llm.call_stream(
        app,
        &request_id,
        &messages,
        None,
        AgentType::Reporter,
    ).await?;

    state.final_result = Some(response.clone());

    let _ = app.emit("agent-event", AgentEvent::Complete {
        result: response,
    });
    let _ = app.emit("agent-event", AgentEvent::StatusChange {
        status: AgentStatus::Completed,
    });

    Ok(NodeResult {
        state,
        next_node: None,
    })
}

// ============ 辅助函数 ============

fn parse_intent(response: &str) -> TaskIntent {
    let response_lower = response.to_lowercase();
    
    if response_lower.contains("\"intent\"") {
        if response_lower.contains("\"edit\"") {
            return TaskIntent::Edit;
        } else if response_lower.contains("\"create\"") {
            return TaskIntent::Create;
        } else if response_lower.contains("\"organize\"") {
            return TaskIntent::Organize;
        } else if response_lower.contains("\"search\"") {
            return TaskIntent::Search;
        } else if response_lower.contains("\"complex\"") {
            return TaskIntent::Complex;
        } else if response_lower.contains("\"chat\"") {
            return TaskIntent::Chat;
        }
    }
    
    TaskIntent::Chat
}

/// 从响应中提取 JSON（可能被 Markdown 代码块包裹）
fn extract_json(response: &str) -> String {
    // 尝试提取 ```json ... ``` 或 ``` ... ```
    if let Some(start) = response.find("```json") {
        let after_start = &response[start + 7..];
        if let Some(end) = after_start.find("```") {
            return after_start[..end].trim().to_string();
        }
    }
    
    if let Some(start) = response.find("```") {
        let after_start = &response[start + 3..];
        if let Some(end) = after_start.find("```") {
            return after_start[..end].trim().to_string();
        }
    }
    
    // 尝试找到 { 开头的 JSON
    if let Some(start) = response.find('{') {
        if let Some(end) = response.rfind('}') {
            return response[start..=end].to_string();
        }
    }
    
    response.to_string()
}

fn parse_plan(response: &str) -> Option<Plan> {
    // 提取 JSON（可能被 Markdown 代码块包裹）
    let json_str = extract_json(response);
    
    // 尝试解析 JSON (Windsurf 风格)
    if let Ok(json) = serde_json::from_str::<Value>(&json_str) {
        // 尝试解析 plan 数组（新格式）
        if let Some(plan_array) = json.get("plan").and_then(|v| v.as_array()) {
            let plan_steps: Vec<PlanStep> = plan_array.iter()
                .filter_map(|s| {
                    let step = s.get("step").and_then(|v| v.as_str())?.to_string();
                    let status_str = s.get("status").and_then(|v| v.as_str()).unwrap_or("pending");
                    let status = match status_str {
                        "in_progress" => PlanStepStatus::InProgress,
                        "completed" => PlanStepStatus::Completed,
                        _ => PlanStepStatus::Pending,
                    };
                    Some(PlanStep { step, status })
                })
                .collect();
            
            if !plan_steps.is_empty() {
                let explanation = json.get("explanation")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                return Some(Plan {
                    steps: plan_steps,
                    explanation,
                });
            }
        }
        
        // 兼容旧格式 steps 数组
        if let Some(steps) = json.get("steps").and_then(|v| v.as_array()) {
            let plan_steps: Vec<PlanStep> = steps.iter()
                .filter_map(|s| {
                    let step = s.get("description").and_then(|v| v.as_str())?.to_string();
                    Some(PlanStep { step, status: PlanStepStatus::Pending })
                })
                .collect();
            
            if !plan_steps.is_empty() {
                return Some(Plan {
                    steps: plan_steps,
                    explanation: None,
                });
            }
        }
    }
    
    None
}

fn parse_tool_calls(response: &str) -> Option<Vec<ToolCall>> {
    // 解析 XML 格式的工具调用
    let mut calls = Vec::new();
    
    // 所有工具名（必须包含全部工具）
    let tool_names = [
        // 计划工具 (Windsurf 风格)
        "update_plan",
        // 笔记操作
        "read_note", "read_outline", "read_section",
        "edit_note", "create_note", "list_notes",
        "search_notes", "grep_search", "semantic_search",
        "move_note", "delete_note", "get_backlinks",
        // 数据库
        "query_database", "add_database_row",
        // 交互
        "ask_user", "attempt_completion",
    ];
    
    for name in &tool_names {
        let start_tag = format!("<{}>", name);
        let end_tag = format!("</{}>", name);
        
        let mut search_from = 0;
        while let Some(start) = response[search_from..].find(&start_tag) {
            let abs_start = search_from + start;
            if let Some(end) = response[abs_start..].find(&end_tag) {
                let content = &response[abs_start + start_tag.len()..abs_start + end];
                
                // 解析参数
                let mut params = std::collections::HashMap::new();
                
                // 所有可能的参数名
                let param_names = [
                    // 通用
                    "path", "content", "query", "limit", "result", "question",
                    // 编辑
                    "old_string", "new_string",
                    // 移动
                    "from_path", "to_path",
                    // 搜索
                    "pattern", "case_sensitive", "recursive",
                    // 计划
                    "steps", "step_id", "status",
                    // 数据库
                    "database_id", "title", "cells",
                    // 大纲/章节
                    "paths", "section",
                ];
                
                for param in &param_names {
                    let param_start = format!("<{}>", param);
                    let param_end = format!("</{}>", param);
                    
                    if let Some(ps) = content.find(&param_start) {
                        if let Some(pe) = content[ps..].find(&param_end) {
                            let value = &content[ps + param_start.len()..ps + pe];
                            // 尝试解析为 JSON，如果失败则作为字符串
                            let json_value = serde_json::from_str(value)
                                .unwrap_or_else(|_| serde_json::Value::String(value.to_string()));
                            params.insert(param.to_string(), json_value);
                        }
                    }
                }
                
                calls.push(ToolCall {
                    id: format!("call_{}", calls.len()),
                    name: name.to_string(),
                    params,
                });
                
                search_from = abs_start + end + end_tag.len();
            } else {
                break;
            }
        }
    }
    
    if calls.is_empty() {
        None
    } else {
        Some(calls)
    }
}

/// 构建 Agent 提示词
/// supports_fc: 是否支持 Function Calling（支持则不需要 XML 格式教学）
fn build_agent_prompt(agent_name: &str, workspace: &str, context: &str, supports_fc: bool) -> String {
    let role_desc = match agent_name {
        "editor" => "你是 Lumina 的笔记编辑专家，擅长精确编辑和优化笔记内容。",
        "researcher" => "你是 Lumina 的研究专家，擅长深度搜索和分析笔记库中的信息。",
        "writer" => "你是 Lumina 的写作专家，擅长创建高质量、结构清晰的笔记内容。",
        "organizer" => "你是 Lumina 的文件整理专家，擅长组织目录结构和管理笔记文件。",
        _ => "你是 Lumina 智能笔记助手。",
    };

    // Windsurf 风格：单一 update_plan 工具
    let tools_info = match agent_name {
        "editor" => "update_plan, read_note, edit_note, search_notes, grep_search, semantic_search, attempt_completion",
        "researcher" => "update_plan, read_note, list_notes, search_notes, grep_search, semantic_search, get_backlinks, attempt_completion",
        "writer" => "update_plan, read_note, create_note, edit_note, list_notes, search_notes, attempt_completion",
        "organizer" => "update_plan, list_notes, move_note, delete_note, create_note, read_note, attempt_completion",
        _ => "update_plan, read_note, edit_note, create_note, list_notes, search_notes, attempt_completion",
    };

    // FC 模式：不需要 XML 格式教学，工具调用由 API 层处理
    // XML 模式：需要详细的格式说明和示例
    let tool_format_section = if supports_fc {
        // FC 模式：简化提示词
        format!(r#"TOOL USE

你可以使用一组工具来完成用户的任务。工具会通过 Function Calling 自动调用。

总体原则：
- 只要任务可能影响笔记文件、目录结构或需要读取现有内容，就应该调用相应工具。
- 即使仅凭思考也能回答，如果使用工具能让结果更完整，也应偏向使用工具。
- 只有在任务**明确与笔记系统无关**时，才可以只用 attempt_completion 直接回答。

✅ **可用工具**：{}"#, tools_info)
    } else {
        // XML 模式：详细的格式说明
        format!(r#"TOOL USE

你可以使用一组工具来完成用户的任务。**在任何涉及笔记内容、结构或文件操作的任务中，优先选择使用工具来完成。**

总体原则：
- 只要任务可能影响笔记文件、目录结构、数据库或需要读取现有内容，就应该调用相应工具。
- 即使仅凭思考也能回答，如果使用工具能让结果更完整、更可复用（例如写入笔记文件），也应偏向使用工具。
- 只有在任务**明确与笔记系统无关**，且不需要保存或读取任何文件时，才可以只用 attempt_completion 直接回答。

# 工具调用格式

使用 XML 标签格式调用工具：

<tool_name>
<param1>value1</param1>
<param2>value2</param2>
</tool_name>

示例 - 读取笔记:
<read_note>
<path>notes/daily/2024-01-15.md</path>
</read_note>

示例 - 编辑笔记:
<edit_note>
<path>notes/daily/2024-01-15.md</path>
<old_string>原内容</old_string>
<new_string>新内容</new_string>
</edit_note>

示例 - 更新执行计划（仅复杂任务需要）:
<update_plan>
<explanation>任务需要多步执行</explanation>
<plan>[
  {{"step": "搜索相关笔记", "status": "in_progress"}},
  {{"step": "分析内容", "status": "pending"}}
]</plan>
</update_plan>

✅ **可用工具**：{}"#, tools_info)
    };

    format!(
        r#"{role_desc}

❗❗❗ 重要警告 ❗❗❗
你必须通过调用工具来完成任务，绝对禁止编造数据或虚构结果。
每次响应必须包含至少一个工具调用。
**简单任务直接执行，复杂任务才创建计划（见 RULES）**。

你的专长：
- 深入理解笔记内容和结构
- 优化 Markdown 格式和排版
- 整理和重构笔记组织
- 发现笔记间的关联

====

工作区路径：{workspace}

以下是笔记库的目录结构快照（对话开始时生成）：
{context}

注意：此目录结构为静态快照，可能不反映对话期间的文件变更。
如需最新信息，请使用 list_notes、search_notes 或 read_note 工具。

====

{tool_format_section}

====

RULES

# 计划触发判断（重要！）

**简单任务（不创建计划，直接执行）**：
- 单纯的搜索/查找任务 → 直接 fast_search/search_notes → attempt_completion
- 读取单个文件 → 直接 read_note → attempt_completion
- 简单问答 → 直接 attempt_completion
- 预计 1-2 步就能完成的任务

**复杂任务（需要创建计划）**：
- 需要修改多个文件
- 需要创建新笔记并填充内容
- 需要搜索 + 分析 + 修改 的组合操作
- 涉及文件整理/移动/重命名
- 预计需要 3 步以上的任务

# 笔记读取工具（read_note）

**用法**：
- `read_note(path)` - 小文件（≤500行）直接返回全部
- `read_note(path, offset, limit)` - 大文件分段读取（1-indexed）

**规则**：
- 小文件（≤500行）：不传 offset/limit，直接读取全部
- 大文件（>500行）：会自动截断，按提示使用 offset/limit 分段
- 超过 2000 字符的行会被截断
- **优先使用 read_outline + read_section**：按章节阅读更高效

**示例**：
- 读取小文件：`read_note("notes/daily.md")`
- 读取大文件第 100-200 行：`read_note("docs/guide.md", offset=100, limit=100)`

# 执行规则

1. **简单任务直接执行**，不调用 update_plan，完成后直接 attempt_completion
2. **复杂任务先创建简洁计划**（2-4 步），每次只有一个步骤 in_progress
3. 所有文件路径必须相对于笔记库根目录
4. **修改文件前必须先用 read_note 读取确认当前内容**
5. 不要询问不必要的信息，直接根据上下文行动
6. 如果遇到错误，尝试其他方法而不是放弃
7. 保持输出简洁，避免冗长解释

# 编辑 vs 创建文件

- **修改现有文件**：必须使用 edit_note（old_string/new_string 必须精确匹配）
- **创建新文件**：使用 create_note（仅用于创建不存在的文件）

====

OBJECTIVE

完成用户的任务。使用工具时要精确、高效。任务完成后使用 attempt_completion 报告结果。
"#,
        role_desc = role_desc,
        workspace = workspace,
        context = if context.is_empty() { "(无上下文)" } else { context },
        tool_format_section = tool_format_section
    )
}
