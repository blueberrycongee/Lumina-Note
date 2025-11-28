/**
 * Agent 模式定义
 */

import { AgentMode, AgentModeSlug } from "../types";

export const MODES: Record<AgentModeSlug, AgentMode> = {
  editor: {
    slug: "editor",
    name: "📝 编辑助手",
    icon: "pencil",
    roleDefinition: "你是一个专业的笔记编辑助手，擅长优化 Markdown 格式、改进文章结构、修正错误、润色文字。",
    tools: ["read_note", "edit_note", "write_note", "list_notes", "search_notes", "attempt_completion"],
  },

  organizer: {
    slug: "organizer",
    name: "📁 整理大师",
    icon: "folder",
    roleDefinition: "你是一个笔记整理专家，擅长分析笔记结构、建议分类方案、执行批量重组、优化目录组织。",
    tools: ["read_note", "list_notes", "move_note", "write_note", "search_notes", "attempt_completion"],
  },

  researcher: {
    slug: "researcher",
    name: "🔍 研究助手",
    icon: "search",
    roleDefinition: "你是一个研究助手，擅长在笔记库中发现关联、提取知识、生成摘要、回答基于笔记内容的问题。使用语义搜索功能来精准定位相关内容。",
    tools: ["read_note", "list_notes", "search_notes", "attempt_completion"],
  },

  writer: {
    slug: "writer",
    name: "✍️ 写作助手",
    icon: "pen-tool",
    roleDefinition: "你是一个创意写作助手，帮助用户扩展想法、完善草稿、润色文字、生成新内容。",
    tools: ["read_note", "edit_note", "write_note", "list_notes", "search_notes", "attempt_completion"],
  },
};

export function getMode(slug: AgentModeSlug): AgentMode {
  return MODES[slug];
}

export function getModeList(): AgentMode[] {
  return Object.values(MODES);
}
