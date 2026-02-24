//! Deep Research 图构建器

use std::sync::Arc;
use tauri::AppHandle;

use crate::agent::deep_research::crawler::JinaClient;
use crate::agent::deep_research::nodes::*;
use crate::agent::deep_research::tavily::TavilyClient;
use crate::agent::deep_research::types::*;
use crate::agent::llm_client::LlmClient;
use forge::runtime::constants::END;
use forge::runtime::error::{GraphError, GraphResult, Interrupt};
use forge::runtime::executor::CompiledGraph;
use forge::runtime::graph::StateGraph;

/// Deep Research 执行上下文
#[derive(Clone)]
pub struct DeepResearchContext {
    pub app: AppHandle,
    pub llm: Arc<LlmClient>,
    pub config: DeepResearchConfig,
    pub tavily: Option<Arc<TavilyClient>>,
    pub jina: Option<Arc<JinaClient>>,
}

impl DeepResearchContext {
    pub fn new(app: AppHandle, config: DeepResearchConfig) -> Self {
        // 复用 AgentConfig 创建 LlmClient
        let agent_config = crate::agent::types::AgentConfig {
            provider: config.provider.clone(),
            model: config.model.clone(),
            api_key: config.api_key.clone(),
            base_url: config.base_url.clone(),
            temperature: config.temperature,
            ..Default::default()
        };
        let llm = Arc::new(LlmClient::new(agent_config));

        // 创建 Tavily 客户端（如果启用且有 API Key）
        let tavily = if config.enable_web_search {
            config
                .tavily_api_key
                .as_ref()
                .map(|key| Arc::new(TavilyClient::new(key.clone())))
        } else {
            None
        };

        // 创建 Jina 客户端（如果启用网络搜索）
        // Jina Reader 免费版不需要 API Key，但有速率限制
        let jina = if config.enable_web_search {
            Some(Arc::new(JinaClient::new(None)))
        } else {
            None
        };

        Self {
            app,
            llm,
            config,
            tavily,
            jina,
        }
    }
}

/// 构建 Deep Research 图
pub fn build_deep_research_graph(
    ctx: DeepResearchContext,
) -> GraphResult<CompiledGraph<DeepResearchState>> {
    let mut graph = StateGraph::<DeepResearchState>::new();

    // ============ 添加节点 ============

    // 1. 分析主题节点（支持 interrupt）
    let ctx_analyze = ctx.clone();
    graph.add_node("analyze_topic", move |state: DeepResearchState| {
        let ctx = ctx_analyze.clone();
        async move {
            match analyze_topic_node(&ctx.app, &ctx.llm, state.clone()).await {
                Ok(result) => {
                    let mut state = result.state;
                    state.goto = result.next_node.unwrap_or_default();
                    Ok(state)
                }
                Err(e) if e.starts_with("INTERRUPT:") => {
                    // 解析 interrupt 信息
                    let interrupt_json = e.trim_start_matches("INTERRUPT:");
                    if let Ok(interrupt) = serde_json::from_str::<Interrupt>(interrupt_json) {
                        Err(GraphError::Interrupted(vec![interrupt]))
                    } else {
                        Err(GraphError::ExecutionError {
                            node: "analyze_topic".to_string(),
                            message: e,
                        })
                    }
                }
                Err(e) => Err(GraphError::ExecutionError {
                    node: "analyze_topic".to_string(),
                    message: e,
                }),
            }
        }
    });

    // 2. 搜索笔记节点
    let ctx_search = ctx.clone();
    graph.add_node("search_notes", move |state: DeepResearchState| {
        let ctx = ctx_search.clone();
        let max_results = ctx.config.max_search_results;
        let max_web_results = ctx.config.max_web_search_results;
        let tavily = ctx.tavily.clone();
        async move {
            let result = search_notes_node(
                &ctx.app,
                &ctx.llm,
                state,
                max_results,
                tavily.as_ref(),
                max_web_results,
            )
            .await
            .map_err(|e| GraphError::ExecutionError {
                node: "search_notes".to_string(),
                message: e,
            })?;
            let mut state = result.state;
            state.goto = result.next_node.unwrap_or_default();
            Ok(state)
        }
    });

    // 3. 爬取网页节点
    let ctx_crawl = ctx.clone();
    graph.add_node("crawl_web", move |state: DeepResearchState| {
        let ctx = ctx_crawl.clone();
        let jina = ctx.jina.clone();
        let max_pages = ctx.config.max_web_search_results.min(10); // 最多爬取 10 个网页
        async move {
            let result = crawl_web_node(&ctx.app, state, jina.as_ref(), max_pages)
                .await
                .map_err(|e| GraphError::ExecutionError {
                    node: "crawl_web".to_string(),
                    message: e,
                })?;
            let mut state = result.state;
            state.goto = result.next_node.unwrap_or_default();
            Ok(state)
        }
    });

    // 4. 阅读笔记节点
    let ctx_read = ctx.clone();
    graph.add_node("read_notes", move |state: DeepResearchState| {
        let ctx = ctx_read.clone();
        let max_notes = ctx.config.max_notes_to_read;
        async move {
            let result = read_notes_node(&ctx.app, &ctx.llm, state, max_notes)
                .await
                .map_err(|e| GraphError::ExecutionError {
                    node: "read_notes".to_string(),
                    message: e,
                })?;
            let mut state = result.state;
            state.goto = result.next_node.unwrap_or_default();
            Ok(state)
        }
    });

    // 5. 生成大纲节点
    let ctx_outline = ctx.clone();
    graph.add_node("generate_outline", move |state: DeepResearchState| {
        let ctx = ctx_outline.clone();
        async move {
            let result = generate_outline_node(&ctx.app, &ctx.llm, state)
                .await
                .map_err(|e| GraphError::ExecutionError {
                    node: "generate_outline".to_string(),
                    message: e,
                })?;
            let mut state = result.state;
            state.goto = result.next_node.unwrap_or_default();
            Ok(state)
        }
    });

    // 5. 撰写报告节点
    let ctx_write = ctx.clone();
    graph.add_node("write_report", move |state: DeepResearchState| {
        let ctx = ctx_write.clone();
        let include_citations = ctx.config.include_citations;
        async move {
            let result = write_report_node(&ctx.app, &ctx.llm, state, include_citations)
                .await
                .map_err(|e| GraphError::ExecutionError {
                    node: "write_report".to_string(),
                    message: e,
                })?;
            let mut state = result.state;
            state.goto = result.next_node.unwrap_or_default();
            Ok(state)
        }
    });

    // 6. 审校报告节点
    let ctx_review = ctx.clone();
    graph.add_node("review_report", move |state: DeepResearchState| {
        let ctx = ctx_review.clone();
        let include_citations = ctx.config.include_citations;
        async move {
            let result = review_report_node(&ctx.app, &ctx.llm, state, include_citations)
                .await
                .map_err(|e| GraphError::ExecutionError {
                    node: "review_report".to_string(),
                    message: e,
                })?;
            let mut state = result.state;
            state.goto = result.next_node.unwrap_or_default();
            Ok(state)
        }
    });

    // ============ 定义边 ============

    // 入口点
    graph.set_entry_point("analyze_topic");

    // 线性流程（带错误处理）
    graph.add_conditional_edges_sync(
        "analyze_topic",
        |state: &DeepResearchState| {
            if matches!(state.phase, ResearchPhase::Error) {
                END.to_string()
            } else if !state.goto.is_empty() {
                state.goto.clone()
            } else {
                "search_notes".to_string()
            }
        },
        None,
    );

    graph.add_conditional_edges_sync(
        "search_notes",
        |state: &DeepResearchState| {
            if matches!(state.phase, ResearchPhase::Error) {
                END.to_string()
            } else if !state.goto.is_empty() {
                state.goto.clone()
            } else {
                "crawl_web".to_string()
            }
        },
        None,
    );

    graph.add_conditional_edges_sync(
        "crawl_web",
        |state: &DeepResearchState| {
            if matches!(state.phase, ResearchPhase::Error) {
                END.to_string()
            } else if !state.goto.is_empty() {
                state.goto.clone()
            } else {
                "read_notes".to_string()
            }
        },
        None,
    );

    graph.add_conditional_edges_sync(
        "read_notes",
        |state: &DeepResearchState| {
            if matches!(state.phase, ResearchPhase::Error) {
                END.to_string()
            } else if !state.goto.is_empty() {
                state.goto.clone()
            } else {
                "generate_outline".to_string()
            }
        },
        None,
    );

    graph.add_conditional_edges_sync(
        "generate_outline",
        |state: &DeepResearchState| {
            if matches!(state.phase, ResearchPhase::Error) {
                END.to_string()
            } else if !state.goto.is_empty() {
                state.goto.clone()
            } else {
                "write_report".to_string()
            }
        },
        None,
    );

    graph.add_conditional_edges_sync(
        "write_report",
        |state: &DeepResearchState| {
            if matches!(state.phase, ResearchPhase::Error) {
                END.to_string()
            } else if !state.goto.is_empty() {
                state.goto.clone()
            } else {
                "review_report".to_string()
            }
        },
        None,
    );

    // 结束点
    graph.set_finish_point("review_report");

    // 编译图
    graph.compile()
}

/// 获取 Deep Research 图的可视化描述
pub fn describe_deep_research_graph() -> String {
    r#"
Deep Research Graph Structure:
==============================

    ┌─────────────────┐
    │     START       │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  analyze_topic  │ ─── 分析研究主题，提取关键词
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  search_notes   │ ─── 搜索笔记库
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │    crawl_web    │ ─── 爬取网络内容（可选）
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │   read_notes    │ ─── 批量读取笔记内容
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │generate_outline │ ─── 生成报告大纲
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  write_report   │ ─── 撰写研究报告（流式输出）
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ review_report   │ ─── 审校结构/引用并必要修订
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │      END        │
    └─────────────────┘
"#
    .to_string()
}
