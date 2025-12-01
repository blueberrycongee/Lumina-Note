/**
 * 统一的消息发送 Hook
 * 处理 @ 引用文件的读取、显示消息构建、发送逻辑
 */

import { useCallback } from "react";
import { readFile } from "@/lib/tauri";

export interface ReferencedFile {
  path: string;
  name: string;
  isFolder: boolean;
}

export interface SendOptions {
  message: string;
  referencedFiles: ReferencedFile[];
}

export interface ProcessedMessage {
  displayMessage: string;  // 用于前端显示（用户输入 + 文件标签）
  fullMessage: string;     // 发送给 AI（包含文件完整内容）
  fileContext: string;     // 引用文件的内容（用于上下文）
}

/**
 * 处理消息和引用文件，构建显示消息和完整消息
 */
export async function processMessageWithFiles(
  message: string,
  referencedFiles: ReferencedFile[]
): Promise<ProcessedMessage> {
  // 构建显示消息（用户输入 + 文件名标签）
  const fileLabels = referencedFiles
    .filter(f => !f.isFolder)
    .map(f => `[📎 ${f.name}]`)
    .join(" ");
  
  const trimmedMessage = message.trim();
  const displayMessage = fileLabels 
    ? `${trimmedMessage}${trimmedMessage ? " " : ""}${fileLabels}`
    : trimmedMessage;

  // 读取引用文件的内容（用于发送给 AI）
  let fileContext = "";
  for (const file of referencedFiles) {
    if (!file.isFolder) {
      try {
        const content = await readFile(file.path);
        fileContext += `\n\n--- 引用文件: ${file.name} ---\n${content}`;
      } catch (e) {
        console.error(`Failed to read file ${file.path}:`, e);
      }
    }
  }

  // 完整消息（包含文件内容，发送给 AI）
  const fullMessage = fileContext
    ? `${trimmedMessage}\n\n[用户引用的文件内容]${fileContext}`
    : trimmedMessage;

  return {
    displayMessage,
    fullMessage,
    fileContext: fileContext.trim(),
  };
}

/**
 * Hook: 提供统一的消息处理函数
 */
export function useChatSend() {
  const processMessage = useCallback(async (
    message: string,
    referencedFiles: ReferencedFile[]
  ): Promise<ProcessedMessage> => {
    return processMessageWithFiles(message, referencedFiles);
  }, []);

  return { processMessage };
}
