//! Deep Research 类型定义

use serde::{Deserialize, Serialize};
use crate::langgraph::state::GraphState as LangGraphState;

/// 研究阶段
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ResearchPhase {
    /// 初始化
    Init,
    /// 分析主题
    AnalyzingTopic,
    /// 等待用户澄清
    WaitingForClarification,
    /// 搜索笔记
    SearchingNotes,
    /// 搜索网络
    SearchingWeb,
    /// 爬取网页
    CrawlingWeb,
    /// 阅读笔记
    ReadingNotes,
    /// 生成大纲
    GeneratingOutline,
    /// 撰写报告
    WritingReport,
    /// 完成
    Completed,
    /// 错误
    Error,
}

impl Default for ResearchPhase {
    fn default() -> Self {
        Self::Init
    }
}

/// 报告风格
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ReportStyle {
    /// 详细报告（包含完整内容和分析）
    Detailed,
    /// 摘要报告（精简要点）
    Summary,
    /// 大纲报告（结构化列表）
    Outline,
}

impl Default for ReportStyle {
    fn default() -> Self {
        Self::Detailed
    }
}

/// 笔记引用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteReference {
    /// 文件路径
    pub path: String,
    /// 笔记标题
    pub title: String,
    /// 相关性分数
    pub score: f32,
    /// 匹配的内容片段
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
}

/// 已读取的笔记内容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteContent {
    /// 文件路径
    pub path: String,
    /// 笔记标题
    pub title: String,
    /// 完整内容
    pub content: String,
    /// 内容摘要（由 LLM 生成）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

/// 网络搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchResult {
    /// 标题
    pub title: String,
    /// URL
    pub url: String,
    /// 内容摘要
    pub content: String,
    /// 相关性分数
    #[serde(default)]
    pub score: f32,
}

/// 爬取的网页内容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrawledPageContent {
    /// 原始 URL
    pub url: String,
    /// 页面标题
    pub title: String,
    /// 提取的内容（Markdown 格式）
    pub content: String,
}

/// 报告大纲
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportOutline {
    /// 报告标题
    pub title: String,
    /// 章节列表
    pub sections: Vec<OutlineSection>,
}

/// 大纲章节
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutlineSection {
    /// 章节标题
    pub heading: String,
    /// 要点列表
    pub points: Vec<String>,
    /// 相关笔记
    pub related_notes: Vec<String>,
}

/// Deep Research 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepResearchConfig {
    /// LLM 提供商
    pub provider: String,
    /// 模型名称
    pub model: String,
    /// API Key
    pub api_key: String,
    /// Base URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    /// 温度
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    /// 最大搜索结果数
    #[serde(default = "default_max_search_results")]
    pub max_search_results: usize,
    /// 最大阅读笔记数
    #[serde(default = "default_max_notes_to_read")]
    pub max_notes_to_read: usize,
    /// 报告风格
    #[serde(default)]
    pub report_style: ReportStyle,
    /// 是否包含引用来源
    #[serde(default = "default_true")]
    pub include_citations: bool,
    /// 语言
    #[serde(default = "default_locale")]
    pub locale: String,
    
    // ============ 网络搜索配置 ============
    /// 是否启用网络搜索
    #[serde(default)]
    pub enable_web_search: bool,
    /// Tavily API Key（用于网络搜索）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tavily_api_key: Option<String>,
    /// 网络搜索最大结果数
    #[serde(default = "default_web_search_results")]
    pub max_web_search_results: usize,
}

fn default_web_search_results() -> usize { 10 }

fn default_temperature() -> f32 { 0.7 }
fn default_max_search_results() -> usize { 20 }
fn default_max_notes_to_read() -> usize { 10 }
fn default_true() -> bool { true }
fn default_locale() -> String { "zh-CN".to_string() }

impl Default for DeepResearchConfig {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            model: "gpt-4o-mini".to_string(),
            api_key: String::new(),
            base_url: None,
            temperature: default_temperature(),
            max_search_results: default_max_search_results(),
            max_notes_to_read: default_max_notes_to_read(),
            report_style: ReportStyle::default(),
            include_citations: true,
            locale: default_locale(),
            enable_web_search: false,
            tavily_api_key: None,
            max_web_search_results: default_web_search_results(),
        }
    }
}

/// Deep Research 图状态
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeepResearchState {
    /// 研究主题（用户输入）
    pub topic: String,
    /// 工作区路径
    pub workspace_path: String,
    /// 搜索范围（可选，指定文件夹）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_scope: Option<String>,
    /// 搜索模式
    #[serde(default)]
    pub search_mode: SearchMode,
    /// 预搜索的笔记（由前端 RAG 提供）
    #[serde(default)]
    pub pre_searched_notes: Vec<NoteReference>,
    /// 当前阶段
    #[serde(default)]
    pub phase: ResearchPhase,
    /// 分析后的关键词
    #[serde(default)]
    pub keywords: Vec<String>,
    /// 找到的相关笔记
    #[serde(default)]
    pub found_notes: Vec<NoteReference>,
    /// 网络搜索结果
    #[serde(default)]
    pub web_search_results: Vec<WebSearchResult>,
    /// 爬取的网页内容
    #[serde(default)]
    pub crawled_pages: Vec<CrawledPageContent>,
    /// 已读取的笔记内容
    #[serde(default)]
    pub read_notes: Vec<NoteContent>,
    /// 报告大纲
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outline: Option<ReportOutline>,
    /// 最终报告（Markdown）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub report: Option<String>,
    /// 报告流式内容（逐步生成）
    #[serde(default)]
    pub report_chunks: Vec<String>,
    /// 下一个节点
    #[serde(default)]
    pub goto: String,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 用户澄清的输入（interrupt 恢复后填充）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clarification: Option<String>,
}

impl LangGraphState for DeepResearchState {
    fn get_next(&self) -> Option<&str> {
        if self.goto.is_empty() {
            None
        } else {
            Some(&self.goto)
        }
    }
    
    fn set_next(&mut self, next: Option<String>) {
        self.goto = next.unwrap_or_default();
    }
    
    fn is_complete(&self) -> bool {
        matches!(self.phase, ResearchPhase::Completed | ResearchPhase::Error)
    }
    
    fn mark_complete(&mut self) {
        self.phase = ResearchPhase::Completed;
    }
}

/// Deep Research 事件（发送给前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
#[serde(rename_all = "snake_case")]
pub enum DeepResearchEvent {
    /// 阶段变化
    PhaseChange { phase: ResearchPhase, message: String },
    /// 关键词提取完成
    KeywordsExtracted { keywords: Vec<String> },
    /// 找到笔记
    NotesFound { notes: Vec<NoteReference> },
    /// 网络搜索完成
    WebSearchComplete { results: Vec<WebSearchResult> },
    /// 正在爬取网页
    CrawlingPage { url: String, title: String, index: usize, total: usize },
    /// 网页爬取完成
    PageCrawled { url: String, title: String, content_preview: String },
    /// 正在阅读笔记
    ReadingNote { path: String, title: String, index: usize, total: usize },
    /// 笔记读取完成
    NoteRead { path: String, title: String, summary: Option<String> },
    /// 大纲生成
    OutlineGenerated { outline: ReportOutline },
    /// 报告块（流式输出）
    ReportChunk { content: String },
    /// 需要用户澄清
    NeedsClarification { 
        question: String,
        suggestions: Vec<String>,
        interrupt_id: String,
    },
    /// 完成
    Complete { report: String },
    /// 错误
    Error { message: String },
}

/// Deep Research 请求（从前端传入）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepResearchRequest {
    /// 研究主题
    pub topic: String,
    /// 工作区路径
    pub workspace_path: String,
    /// 搜索范围（可选，文件夹路径）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_scope: Option<String>,
    /// 报告风格
    #[serde(default)]
    pub report_style: ReportStyle,
    /// 是否包含引用
    #[serde(default = "default_true")]
    pub include_citations: bool,
    /// 预搜索的笔记（由前端 RAG 提供，如果用户配置了 Embedding）
    /// 如果为空，后端会使用关键词搜索
    #[serde(default)]
    pub pre_searched_notes: Vec<NoteReference>,
}

/// 搜索模式
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SearchMode {
    /// 语义搜索（需要 Embedding 配置）
    Semantic,
    /// 关键词搜索（无需配置）
    Keyword,
    /// 混合搜索（先语义后关键词补充）
    Hybrid,
}

impl Default for SearchMode {
    fn default() -> Self {
        Self::Keyword
    }
}
