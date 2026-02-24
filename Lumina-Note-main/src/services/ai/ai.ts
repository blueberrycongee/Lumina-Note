/**
 * AI Service for chat and file modifications
 * 
 * 注意：LLM 调用已统一到 @/services/llm
 * 此文件保留业务逻辑（文件引用解析、编辑建议等）
 */

import { 
  callLLM, 
  setLLMConfig, 
  getLLMConfig,
  type Message,
  type LLMConfig,
  type IntentType,
} from "@/services/llm";
import { getCurrentTranslations } from "@/stores/useLocaleStore";

// 重新导出 Message 类型以保持兼容
export type { Message };

export interface FileReference {
  path: string;
  name: string;
  content?: string;
}

export interface EditSuggestion {
  filePath: string;
  originalContent: string;
  newContent: string;
  description: string;
}

// AIConfig 别名，保持向后兼容
export type AIConfig = LLMConfig;

/**
 * 设置 AI 配置 (桥接到统一配置)
 */
export function setAIConfig(newConfig: Partial<AIConfig>) {
  setLLMConfig(newConfig);
}

/**
 * 获取 AI 配置 (桥接到统一配置)
 */
export function getAIConfig(): AIConfig {
  return getLLMConfig();
}

// Parse @file references from message
export function parseFileReferences(message: string): string[] {
  const regex = /@\[([^\]]+)\]|@(\S+\.md)/g;
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(message)) !== null) {
    matches.push(match[1] || match[2]);
  }
  return matches;
}

// Build system prompt for file editing
function buildSystemPrompt(files: FileReference[], intent?: IntentType): string {
  const t = getCurrentTranslations();
  const chatPrompt = t.prompts.chat;
  const editPrompt = t.prompts.edit;
  const routerPrompt = t.prompts.router;
  
  // 如果是闲聊意图，使用极简 Prompt
  if (intent === "chat") {
    let prompt = chatPrompt.system;
    if (files.length > 0) {
      prompt += `\n\n${chatPrompt.contextFiles}\n`;
      for (const file of files) {
        prompt += `\n=== ${file.name} ===\n${file.content || chatPrompt.emptyFile}\n`;
      }
    }
    return prompt;
  }

  // 闪卡意图：使用编辑能力并显式注入路由语义，避免意图漂移
  if (intent === "flashcard") {
    let prompt = `${editPrompt.system}\n\n${routerPrompt.system}\n\nFocus on flashcard generation and review workflows.`;
    if (files.length > 0) {
      prompt += `\n\n${editPrompt.currentFiles}\n`;
      for (const file of files) {
        prompt += `\n=== ${file.name} ===\n`;
        prompt += file.content || editPrompt.contentNotLoaded;
        prompt += `\n=== ${editPrompt.fileEnd} ===\n`;
      }
    }
    return prompt;
  }

  // 其他意图（如 edit, organize, complex）使用完整 Prompt
  let prompt = editPrompt.system;

  if (files.length > 0) {
    prompt += `\n\n${editPrompt.currentFiles}\n`;
    for (const file of files) {
      prompt += `\n=== ${file.name} ===\n`;
      prompt += file.content || editPrompt.contentNotLoaded;
      prompt += `\n=== ${editPrompt.fileEnd} ===\n`;
    }
  }

  return prompt;
}

// Parse AI response for edit suggestions
export function parseEditSuggestions(response: string): EditSuggestion[] {
  const t = getCurrentTranslations();
  const suggestions: EditSuggestion[] = [];
  const editRegex = /<edit file="([^"]+)">([\s\S]*?)<\/edit>/g;
  
  let match;
  while ((match = editRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2];
    
    const descMatch = content.match(/<description>([\s\S]*?)<\/description>/);
    const origMatch = content.match(/<original>([\s\S]*?)<\/original>/);
    const modMatch = content.match(/<modified>([\s\S]*?)<\/modified>/);
    
    if (origMatch && modMatch) {
      suggestions.push({
        filePath,
        originalContent: origMatch[1].trim(),
        newContent: modMatch[1].trim(),
        description: descMatch ? descMatch[1].trim() : t.ai.editSuggestionDefault,
      });
    }
  }
  
  return suggestions;
}

// Chat response with token usage
export interface ChatResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Chat API (使用统一的 LLM 服务)
 */
export async function chat(
  messages: Message[],
  files: FileReference[] = [],
  configOverride?: Partial<LLMConfig>,
  options?: { intent?: IntentType }
): Promise<ChatResponse> {
  const systemPrompt = buildSystemPrompt(files, options?.intent);
  
  // 构建完整消息列表
  const fullMessages: Message[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  try {
    // 使用统一的 LLM 服务
    const response = await callLLM(fullMessages, { useDefaultTemperature: true }, configOverride);

    return {
      content: response.content,
      usage: response.usage ? {
        prompt_tokens: response.usage.promptTokens,
        completion_tokens: response.usage.completionTokens,
        total_tokens: response.usage.totalTokens,
      } : undefined,
    };
  } catch (error) {
    throw error;
  }
}

// Apply edit suggestion to content
export function applyEdit(content: string, suggestion: EditSuggestion): string {
  const t = getCurrentTranslations();
  const originalContent = suggestion.originalContent;
  const newContent = suggestion.newContent;
  
  // Try exact match first
  if (content.includes(originalContent)) {
    console.log("[applyEdit] Exact match found");
    return content.replace(originalContent, newContent);
  }
  
  // Try flexible whitespace match (Regex)
  // This handles CRLF vs LF, and different indentation styles
  try {
    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Split by whitespace and join with \s+ to allow any whitespace sequence
    // We trim the ends to avoid matching leading/trailing whitespace issues
    const pattern = escapeRegExp(originalContent).replace(/\s+/g, '\\s+');
    const regex = new RegExp(pattern);
    const match = content.match(regex);
    
    if (match && match.index !== undefined) {
      console.log("[applyEdit] Flexible whitespace match found");
      return content.substring(0, match.index) + newContent + content.substring(match.index + match[0].length);
    }
  } catch (e) {
    console.warn("[applyEdit] Regex match failed", e);
  }
  
  // Try line-by-line fuzzy match
  const contentLines = content.split("\n");
  const origLines = originalContent.trim().split("\n").map(l => l.trim());
  
  // Find the first line that matches
  let startIdx = -1;
  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() === origLines[0]) {
      // Check if subsequent lines match
      let allMatch = true;
      for (let j = 0; j < origLines.length && i + j < contentLines.length; j++) {
        if (contentLines[i + j].trim() !== origLines[j]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        startIdx = i;
        break;
      }
    }
  }
  
  if (startIdx !== -1) {
    console.log("[applyEdit] Fuzzy match found at line", startIdx);
    const before = contentLines.slice(0, startIdx).join("\n");
    const after = contentLines.slice(startIdx + origLines.length).join("\n");
    return (before ? before + "\n" : "") + newContent + (after ? "\n" + after : "");
  }
  
  // Last resort: try to find any significant overlap
  const firstOrigLine = origLines[0];
  if (firstOrigLine && firstOrigLine.length > 10) {
    for (let i = 0; i < contentLines.length; i++) {
      if (contentLines[i].includes(firstOrigLine.substring(0, Math.min(30, firstOrigLine.length)))) {
        console.log("[applyEdit] Partial match found at line", i);
        const before = contentLines.slice(0, i).join("\n");
        const after = contentLines.slice(i + origLines.length).join("\n");
        return (before ? before + "\n" : "") + newContent + (after ? "\n" + after : "");
      }
    }
  }
  
  // If still no match, insert at a reasonable position or append
  console.warn("[applyEdit] No match found, appending new content");
  return content + `\n\n<!-- ${t.ai.editMarker} -->\n` + newContent;
}
