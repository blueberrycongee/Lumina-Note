//! Simplified orchestrator — builds the initial graph state for the wiki-aware agent.

use crate::agent::types::{
    AgentConfig, AgentStatus, ExecuteStageState, GraphState, Message, TaskContext, TaskState,
};

pub fn build_initial_graph_state(
    messages: Vec<Message>,
    task: String,
    context: TaskContext,
    _config: &AgentConfig,
) -> GraphState {
    GraphState {
        messages,
        task: TaskState {
            user_task: task,
            workspace_path: context.workspace_path,
            active_note_path: context.active_note_path,
            active_note_content: context.active_note_content,
            file_tree: context.file_tree,
            auto_approve: _config.auto_approve,
        },
        execute: ExecuteStageState::default(),
        status: AgentStatus::Running,
        goto: String::new(),
    }
}
