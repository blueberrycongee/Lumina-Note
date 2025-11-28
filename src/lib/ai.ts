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
} from "@/services/llm";

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
function buildSystemPrompt(files: FileReference[]): string {
  let prompt = `你是一个智能笔记助手，专门帮助用户编辑和改进 Markdown 笔记。

你的能力：
1. 理解和分析笔记内容
2. 根据用户需求修改笔记
3. 优化数学公式的表达
4. 改进文章结构和逻辑

当用户要求修改文件时，请使用以下格式输出修改：

<edit file="文件路径">
<description>修改说明</description>
<original>
原始内容（用于定位，必须与当前文件内容完全匹配）
</original>
<modified>
修改后的内容
</modified>
</edit>

重要说明：
- <original> 中的内容必须是文件的【当前实际内容】，不是之前建议修改的内容
- 请始终以下面提供的最新文件内容为准
- 忽略对话历史中之前的修改建议，用户可能已拒绝那些修改
- 如果有多处修改，可以使用多个 <edit> 块
`;

  if (files.length > 0) {
    prompt += "\n\n【当前文件的最新内容】（以此为准）：\n";
    for (const file of files) {
      prompt += `\n=== ${file.name} ===\n`;
      prompt += file.content || "(内容未加载)";
      prompt += "\n=== 文件结束 ===\n";
    }
  }

  return prompt;
}

// Parse AI response for edit suggestions
export function parseEditSuggestions(response: string): EditSuggestion[] {
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
        description: descMatch ? descMatch[1].trim() : "内容修改",
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
  files: FileReference[] = []
): Promise<ChatResponse> {
  const systemPrompt = buildSystemPrompt(files);
  
  // 构建完整消息列表
  const fullMessages: Message[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  // 使用统一的 LLM 服务
  const response = await callLLM(fullMessages);

  return {
    content: response.content,
    usage: response.usage ? {
      prompt_tokens: response.usage.promptTokens,
      completion_tokens: response.usage.completionTokens,
      total_tokens: response.usage.totalTokens,
    } : undefined,
  };
}

// Apply edit suggestion to content
export function applyEdit(content: string, suggestion: EditSuggestion): string {
  const originalContent = suggestion.originalContent;
  const newContent = suggestion.newContent;
  
  // Try exact match first
  if (content.includes(originalContent)) {
    console.log("[applyEdit] Exact match found");
    return content.replace(originalContent, newContent);
  }
  
  // Try normalized match (normalize whitespace)
  const normalizeWhitespace = (s: string) => s.replace(/\r\n/g, "\n").replace(/\t/g, "  ");
  const normalizedContent = normalizeWhitespace(content);
  const normalizedOriginal = normalizeWhitespace(originalContent);
  
  if (normalizedContent.includes(normalizedOriginal)) {
    console.log("[applyEdit] Normalized match found");
    // Find the position and replace
    const idx = normalizedContent.indexOf(normalizedOriginal);
    return content.substring(0, idx) + newContent + content.substring(idx + originalContent.length);
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
  return content + "\n\n<!-- AI 修改 -->\n" + newContent;
}
