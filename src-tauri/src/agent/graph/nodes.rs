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
    let _ = app.emit("agent-event", AgentEvent::StatusChange {
        status: AgentStatus::Running,
    });

    // 构建系统提示
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

请用 JSON 格式回复：
{{"intent": "chat|edit|create|organize|search|complex", "reason": "判断理由"}}
"#,
        state.workspace_path,
        state.active_note_path.as_deref().unwrap_or("无")
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
        let _ = app.emit("agent-event", AgentEvent::PlanCreated {
            plan: plan.clone(),
        });
        state.current_plan = Some(plan);
        state.current_step_index = 0;
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

/// 执行器节点 - 执行计划中的当前步骤
pub async fn executor_node(
    app: &AppHandle,
    _llm: &LlmClient,
    mut state: GraphState,
) -> Result<NodeResult, String> {
    let plan = state.current_plan.as_ref()
        .ok_or("No plan found")?;
    
    if state.current_step_index >= plan.steps.len() {
        // 所有步骤完成
        state.goto = "reporter".to_string();
        return Ok(NodeResult {
            state,
            next_node: Some("reporter".to_string()),
        });
    }

    let step = &plan.steps[state.current_step_index];
    
    let _ = app.emit("agent-event", AgentEvent::StepStarted {
        step: step.clone(),
        index: state.current_step_index,
    });

    // 根据步骤的 agent 类型路由
    let next_node = match step.agent {
        AgentType::Editor => "editor",
        AgentType::Researcher => "researcher",
        AgentType::Writer => "writer",
        AgentType::Organizer => "organizer",
        _ => "reporter",
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
    
    let tools = get_tools_for_agent(agent_name);
    let tool_registry = ToolRegistry::new(state.workspace_path.clone());

    // ========== 使用 ChatChunks 分层构建消息 ==========
    
    // 1. 构建系统提示（身份 + 规则 + 基础格式提醒）
    let base_system = build_agent_prompt(agent_name, &state.workspace_path, "");
    let system_prompt = format!("{}\n{}", base_system, FORMAT_REMINDER);
    
    let mut chunks = ChatChunks::new(system_prompt);
    
    // 2. 生成 Note Map（笔记库结构摘要）
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
    let max_iterations = 10; // 防止无限循环
    let mut iteration = 0;
    
    loop {
        iteration += 1;
        if iteration > max_iterations {
            // 超过最大迭代次数，强制结束
            state.observations.push("[系统] 达到最大工具调用次数，自动结束".to_string());
            break;
        }
        
        // 调用 LLM（非流式，工作节点不需要流式输出给用户）
        let response = llm.call(&messages, Some(&tools)).await?;
        
        // 发送 token 使用量
        let _ = app.emit("agent-event", AgentEvent::TokenUsage {
            prompt_tokens: response.prompt_tokens,
            completion_tokens: response.completion_tokens,
            total_tokens: response.total_tokens,
        });

        // 解析工具调用
        let tool_calls = parse_tool_calls(&response.content);
        
        if tool_calls.is_none() || tool_calls.as_ref().map(|tc| tc.is_empty()).unwrap_or(true) {
            // 没有工具调用，LLM 认为任务完成
            break;
        }
        
        let tool_calls = tool_calls.unwrap();
        let mut should_complete = false;
        
        for tool_call in tool_calls {
            // 发送工具调用事件
            let _ = app.emit("agent-event", AgentEvent::ToolCall {
                tool: tool_call.clone(),
            });

            // 执行工具
            let result = tool_registry.execute(&tool_call).await;

            // 发送工具结果事件
            let _ = app.emit("agent-event", AgentEvent::ToolResult {
                result: result.clone(),
            });

            // 处理 create_plan 工具
            if tool_call.name == "create_plan" {
                if let Some(steps_value) = tool_call.params.get("steps") {
                    if let Some(steps_array) = steps_value.as_array() {
                        let mut plan_steps = Vec::new();
                        for step in steps_array {
                            let id = step.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let description = step.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            plan_steps.push(PlanStep {
                                id,
                                description,
                                agent: agent_type.clone(),
                                completed: false,
                                result: None,
                            });
                        }
                        
                        let plan = Plan {
                            steps: plan_steps,
                            current_step: 0,
                        };
                        
                        // 发送计划创建事件
                        let _ = app.emit("agent-event", AgentEvent::PlanCreated {
                            plan: plan.clone(),
                        });
                        
                        // 构建详细反馈
                        let steps_list: Vec<String> = plan.steps.iter()
                            .map(|s| format!("{}. {}", s.id, s.description))
                            .collect();
                        let feedback = format!(
                            "✅ 计划已创建，共 {} 个步骤：\n{}\n\n请开始执行步骤 1。",
                            plan.steps.len(),
                            steps_list.join("\n")
                        );
                        
                        state.current_plan = Some(plan);
                        state.current_step_index = 0;
                        
                        // 添加详细反馈到消息历史
                        state.observations.push(format!("[create_plan] {}", feedback));
                        messages.push(Message {
                            role: MessageRole::User,
                            content: format!("工具 create_plan 执行结果：\n{}", feedback),
                            name: None,
                            tool_call_id: None,
                        });
                        continue; // 跳过默认的消息添加
                    }
                }
            }
            
            // 处理 update_plan_progress 工具
            if tool_call.name == "update_plan_progress" {
                // step_id 可能是字符串 "1" 或数字 1，都要处理
                let step_id = tool_call.params.get("step_id")
                    .map(|v| match v {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Number(n) => n.to_string(),
                        _ => String::new(),
                    })
                    .unwrap_or_default();
                let status = tool_call.params.get("status").and_then(|v| v.as_str()).unwrap_or("completed");
                
                let mut feedback = String::new();
                
                if let Some(ref mut plan) = state.current_plan {
                    // 检查步骤是否已经完成
                    let already_completed = plan.steps.iter()
                        .find(|s| s.id == step_id)
                        .map(|s| s.completed)
                        .unwrap_or(false);
                    
                    if already_completed {
                        // 步骤已完成，返回警告
                        let completed_count = plan.steps.iter().filter(|s| s.completed).count();
                        let pending: Vec<String> = plan.steps.iter()
                            .filter(|s| !s.completed)
                            .map(|s| format!("{}. {}", s.id, s.description))
                            .collect();
                        
                        feedback = format!(
                            "⚠️ 步骤 {} 已经完成过了。\n当前进度：{}/{}\n{}",
                            step_id,
                            completed_count,
                            plan.steps.len(),
                            if pending.is_empty() { 
                                "所有步骤已完成，请调用 attempt_completion 结束任务。".to_string()
                            } else { 
                                format!("待完成：{}", pending.join("，")) 
                            }
                        );
                    } else {
                        // 找到对应的步骤并更新
                        for (index, step) in plan.steps.iter_mut().enumerate() {
                            if step.id == step_id {
                                step.completed = status == "completed" || status == "skipped";
                                
                                // 发送步骤完成事件
                                let _ = app.emit("agent-event", AgentEvent::StepCompleted {
                                    step: step.clone(),
                                    index,
                                });
                                
                                // 更新当前步骤索引
                                if step.completed && index == plan.current_step {
                                    plan.current_step = index + 1;
                                }
                                break;
                            }
                        }
                        
                        // 构建详细反馈
                        let completed_count = plan.steps.iter().filter(|s| s.completed).count();
                        let step_desc = plan.steps.iter()
                            .find(|s| s.id == step_id)
                            .map(|s| s.description.clone())
                            .unwrap_or_default();
                        let pending: Vec<String> = plan.steps.iter()
                            .filter(|s| !s.completed)
                            .map(|s| format!("{}. {}", s.id, s.description))
                            .collect();
                        
                        feedback = format!(
                            "✅ 步骤 {}「{}」已完成。\n当前进度：{}/{}\n{}",
                            step_id,
                            step_desc,
                            completed_count,
                            plan.steps.len(),
                            if pending.is_empty() { 
                                "所有步骤已完成，请调用 attempt_completion 结束任务。".to_string()
                            } else { 
                                format!("待完成：{}", pending.join("，")) 
                            }
                        );
                    }
                }
                
                // 用详细反馈替换简单的 result.content
                // 直接添加到消息历史，跳过后面的默认处理
                state.observations.push(format!("[update_plan_progress] {}", feedback));
                messages.push(Message {
                    role: MessageRole::User,
                    content: format!("工具 update_plan_progress 执行结果：\n{}", feedback),
                    name: None,
                    tool_call_id: None,
                });
                continue; // 跳过默认的消息添加
            }

            // 检查是否完成
            if tool_call.name == "attempt_completion" {
                // 检查计划是否全部完成
                let all_steps_completed = state.current_plan.as_ref()
                    .map(|plan| plan.steps.iter().all(|s| s.completed))
                    .unwrap_or(true); // 没有计划则视为完成
                
                let incomplete_count = state.current_plan.as_ref()
                    .map(|plan| plan.steps.iter().filter(|s| !s.completed).count())
                    .unwrap_or(0);
                
                if !all_steps_completed && iteration < max_iterations - 1 {
                    // 还有未完成的步骤，且未达最大次数，拒绝结束
                    let pending: Vec<String> = state.current_plan.as_ref()
                        .map(|plan| plan.steps.iter()
                            .filter(|s| !s.completed)
                            .map(|s| format!("{}. {}", s.id, s.description))
                            .collect())
                        .unwrap_or_default();
                    
                    messages.push(Message {
                        role: MessageRole::User,
                        content: format!(
                            "[系统提醒] ⚠️ 拒绝结束！计划中还有 {} 个步骤未完成：\n{}\n\n请继续执行这些步骤，每完成一个就调用 update_plan_progress 标记。全部完成后再调用 attempt_completion。",
                            incomplete_count,
                            pending.join("\n")
                        ),
                        name: None,
                        tool_call_id: None,
                    });
                    // 跳过后续处理，继续循环
                    continue;
                }
                
                // 全部完成，或达到最大次数，允许结束
                if !all_steps_completed {
                    // 标记未完成的步骤
                    if let Some(ref mut plan) = state.current_plan {
                        for step in plan.steps.iter_mut() {
                            if !step.completed {
                                step.result = Some("超时未完成".to_string());
                            }
                        }
                    }
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

    // 循环结束，检查并标记未完成的步骤
    if let Some(ref mut plan) = state.current_plan {
        for (index, step) in plan.steps.iter_mut().enumerate() {
            if !step.completed {
                // 标记为失败（未完成）
                step.result = Some("未完成".to_string());
                
                // 发送步骤失败事件（前端可以显示为红色 X）
                let _ = app.emit("agent-event", AgentEvent::StepCompleted {
                    step: step.clone(),
                    index,
                });
            }
        }
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
    
    // 尝试解析 JSON
    if let Ok(json) = serde_json::from_str::<Value>(&json_str) {
        if let Some(steps) = json.get("steps").and_then(|v| v.as_array()) {
            let plan_steps: Vec<PlanStep> = steps.iter()
                .filter_map(|s| {
                    let id = s.get("id").and_then(|v| v.as_str()).unwrap_or("1").to_string();
                    let description = s.get("description").and_then(|v| v.as_str())?.to_string();
                    let agent_str = s.get("agent").and_then(|v| v.as_str()).unwrap_or("editor");
                    let agent = match agent_str {
                        "researcher" => AgentType::Researcher,
                        "writer" => AgentType::Writer,
                        "organizer" => AgentType::Organizer,
                        _ => AgentType::Editor,
                    };
                    Some(PlanStep {
                        id,
                        description,
                        agent,
                        completed: false,
                        result: None,
                    })
                })
                .collect();
            
            if !plan_steps.is_empty() {
                return Some(Plan {
                    steps: plan_steps,
                    current_step: 0,
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
        // 计划工具
        "create_plan", "update_plan_progress",
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

fn build_agent_prompt(agent_name: &str, workspace: &str, context: &str) -> String {
    let role_desc = match agent_name {
        "editor" => "你是 Lumina 的笔记编辑专家，擅长精确编辑和优化笔记内容。",
        "researcher" => "你是 Lumina 的研究专家，擅长深度搜索和分析笔记库中的信息。",
        "writer" => "你是 Lumina 的写作专家，擅长创建高质量、结构清晰的笔记内容。",
        "organizer" => "你是 Lumina 的文件整理专家，擅长组织目录结构和管理笔记文件。",
        _ => "你是 Lumina 智能笔记助手。",
    };

    let tools_info = match agent_name {
        "editor" => "create_plan, update_plan_progress, read_note, edit_note, search_notes, grep_search, semantic_search, attempt_completion",
        "researcher" => "create_plan, update_plan_progress, read_note, list_notes, search_notes, grep_search, semantic_search, get_backlinks, attempt_completion",
        "writer" => "create_plan, update_plan_progress, read_note, create_note, edit_note, list_notes, search_notes, attempt_completion",
        "organizer" => "create_plan, update_plan_progress, list_notes, move_note, delete_note, create_note, read_note, attempt_completion",
        _ => "create_plan, update_plan_progress, read_note, edit_note, create_note, list_notes, search_notes, attempt_completion",
    };

    format!(
        r#"{role_desc}

❗❗❗ 重要警告 ❗❗❗
你必须通过调用工具来完成任务，绝对禁止编造数据或虚构结果。
每次响应必须包含至少一个工具调用。
第一步必须调用 create_plan 创建执行计划。

你的专长：
- 深入理解笔记内容和结构
- 优化 Markdown 格式和排版
- 整理和重构笔记组织
- 发现笔记间的关联

====

工作区路径：{workspace}

{context}

====

TOOL USE

你可以使用一组工具来完成用户的任务。**在任何涉及笔记内容、结构或文件操作的任务中，优先选择使用工具来完成，而不是仅在对话中给出结果。**

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

示例 - 列出目录（可递归）:
<list_notes>
<path>.</path>
<recursive>true</recursive>
</list_notes>

示例 - 创建执行计划（任务开始时必须调用）:
<create_plan>
<steps>[
  {{"id": "1", "description": "扫描笔记库目录结构"}},
  {{"id": "2", "description": "分析主要内容"}},
  {{"id": "3", "description": "总结并报告结果"}}
]</steps>
</create_plan>

示例 - 更新步骤进度（完成一个步骤后调用）:
<update_plan_progress>
<step_id>1</step_id>
<status>completed</status>
</update_plan_progress>

✅ **你可以使用的工具**：{tools_info}

====

RULES

1. **开始任务前必须先调用 create_plan 创建执行计划**
   - 将任务拆解为 1-5 个具体步骤
   - 每个步骤有唯一 ID 和清晰描述
2. **完成每个步骤后必须立即调用 update_plan_progress 标记进度**
   - step_id: 步骤 ID（数字字符串如 "1", "2", "3"）
   - status: "completed" 或 "skipped"
   - 执行顺序：执行步骤 → 立即标记该步骤完成 → 执行下一步骤
3. 所有文件路径必须相对于笔记库根目录
4. **修改文件前必须先用 read_note 读取确认当前内容**
5. 不要询问不必要的信息，直接根据上下文行动
6. 你的目标是完成任务，而不是进行对话
7. **attempt_completion 只能在所有计划步骤都完成后调用**
   - ❌ 禁止：还有未完成步骤时调用 attempt_completion
   - ✅ 正确：每个步骤完成后调用 update_plan_progress，全部完成后再调用 attempt_completion
   - 如果提前调用，系统会拒绝并要求你继续完成剩余步骤
8. 禁止以 "好的"、"当然"、"没问题" 等寒暄开头
9. 每次工具调用后必须等待结果确认
10. 如果遇到错误，尝试其他方法而不是放弃
11. 保持输出简洁，避免冗长解释
12. **可以连续多次调用工具**来完成复杂任务，不要在第一次工具调用后就停止

# 编辑 vs 创建文件

- **修改现有文件**：必须使用 edit_note，使用精确的 old_string/new_string
  - 先 read_note 获取当前内容
  - old_string 必须与原文完全匹配
  - 只替换需要修改的部分
  
- **创建新文件**：使用 create_note
  - 仅用于创建不存在的文件
  
- **禁止**：用 create_note 覆盖已存在的文件

# 工具使用优先级

1. **需要读/写/搜索笔记 → 必须使用工具**
2. **创作类任务且与笔记相关 → 优先写入文件**
3. **不确定是否需要工具时 → 先用 read_note / list_notes 探查**
4. 宁可多一步只读类工具调用，也不要完全不使用工具

====

CAPABILITIES

你可以：
1. 读取笔记库中的任意 Markdown 文件
2. 创建新的笔记文件
3. 编辑现有笔记（精确的查找替换）
4. 列出目录结构和文件（支持递归）
5. 完成任务并提供总结

你不能：
1. 访问笔记库之外的文件
2. 执行系统命令
3. 访问网络资源

====

OBJECTIVE

完成用户的任务。使用工具时要精确、高效。任务完成后使用 attempt_completion 报告结果。
"#,
        role_desc = role_desc,
        workspace = workspace,
        context = if context.is_empty() { "(无上下文)" } else { context },
        tools_info = tools_info
    )
}
