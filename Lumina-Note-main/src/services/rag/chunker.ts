/**
 * Markdown 分块器
 * 将 Markdown 文档分割为语义块，针对笔记场景优化
 */

import type { Chunk, ChunkMetadata, RAGConfig } from "./types";

export class MarkdownChunker {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(config: RAGConfig) {
    this.chunkSize = config.chunkSize;
    this.chunkOverlap = config.chunkOverlap;
  }

  /**
   * 更新配置
   */
  updateConfig(config: RAGConfig): void {
    this.chunkSize = config.chunkSize;
    this.chunkOverlap = config.chunkOverlap;
  }

  /**
   * 将 Markdown 文档分割为语义块
   */
  chunk(content: string, filePath: string, fileModified?: number): Chunk[] {
    if (!content.trim()) {
      return [];
    }

    const chunks: Chunk[] = [];
    const lines = content.split("\n");
    
    let currentChunk: string[] = [];
    let currentHeading = this.extractTitle(content, filePath);
    let startLine = 1;
    let currentLength = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLength = line.length + 1; // +1 for newline
      
      // 检测标题 (# ## ### etc.)
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      
      if (headingMatch) {
        // 保存当前块（如果有内容）
        if (currentChunk.length > 0 && this.hasContent(currentChunk)) {
          chunks.push(this.createChunk(
            currentChunk.join("\n"),
            filePath,
            currentHeading,
            startLine,
            i,
            fileModified
          ));
        }
        
        // 开始新块
        currentHeading = headingMatch[2].trim();
        currentChunk = [line];
        startLine = i + 1;
        currentLength = lineLength;
      } else {
        currentChunk.push(line);
        currentLength += lineLength;
        
        // 检查块大小限制
        if (currentLength > this.chunkSize) {
          // 尝试在合适的位置分割
          const splitPoint = this.findSplitPoint(currentChunk);
          
          if (splitPoint > 0) {
            // 分割块
            const firstPart = currentChunk.slice(0, splitPoint);
            const secondPart = currentChunk.slice(splitPoint);
            
            if (this.hasContent(firstPart)) {
              chunks.push(this.createChunk(
                firstPart.join("\n"),
                filePath,
                currentHeading,
                startLine,
                startLine + splitPoint - 1,
                fileModified
              ));
            }
            
            // 保留一些重叠内容
            const overlapLines = this.getOverlapLines(firstPart);
            currentChunk = [...overlapLines, ...secondPart];
            startLine = i - secondPart.length - overlapLines.length + 2;
            currentLength = currentChunk.join("\n").length;
          } else {
            // 强制分割
            if (this.hasContent(currentChunk)) {
              chunks.push(this.createChunk(
                currentChunk.join("\n"),
                filePath,
                currentHeading,
                startLine,
                i + 1,
                fileModified
              ));
            }
            currentChunk = [];
            startLine = i + 2;
            currentLength = 0;
          }
        }
      }
    }

    // 处理最后一块
    if (currentChunk.length > 0 && this.hasContent(currentChunk)) {
      chunks.push(this.createChunk(
        currentChunk.join("\n"),
        filePath,
        currentHeading,
        startLine,
        lines.length,
        fileModified
      ));
    }

    return chunks;
  }

  /**
   * 从文档提取标题
   */
  private extractTitle(content: string, filePath: string): string {
    // 尝试从内容中提取 # 标题
    const titleMatch = content.match(/^#\s+(.+)/m);
    if (titleMatch) {
      return titleMatch[1].trim();
    }
    
    // 从文件名提取
    const fileName = filePath.split("/").pop() || filePath;
    return fileName.replace(/\.md$/, "");
  }

  /**
   * 创建 Chunk 对象
   */
  private createChunk(
    content: string,
    filePath: string,
    heading: string,
    startLine: number,
    endLine: number,
    fileModified?: number
  ): Chunk {
    const metadata: ChunkMetadata = {
      filePath,
      heading,
      startLine,
      endLine,
      fileModified,
    };

    return {
      id: `${filePath}:${startLine}-${endLine}`,
      content: content.trim(),
      metadata,
    };
  }

  /**
   * 检查内容是否有实际文本（排除纯空白）
   */
  private hasContent(lines: string[]): boolean {
    return lines.some(line => line.trim().length > 0);
  }

  /**
   * 找到合适的分割点
   * 优先在段落边界分割
   */
  private findSplitPoint(lines: string[]): number {
    // 从后往前找空行（段落边界）
    for (let i = lines.length - 1; i > lines.length / 2; i--) {
      if (lines[i].trim() === "") {
        return i;
      }
    }
    
    // 找列表项边界
    for (let i = lines.length - 1; i > lines.length / 2; i--) {
      if (lines[i].match(/^[-*+]\s/) || lines[i].match(/^\d+\.\s/)) {
        return i;
      }
    }
    
    // 找不到好的分割点
    return Math.floor(lines.length * 0.75);
  }

  /**
   * 获取重叠内容
   */
  private getOverlapLines(lines: string[]): string[] {
    // 计算需要保留的行数
    let charCount = 0;
    let overlapLines: string[] = [];
    
    for (let i = lines.length - 1; i >= 0 && charCount < this.chunkOverlap; i--) {
      overlapLines.unshift(lines[i]);
      charCount += lines[i].length + 1;
    }
    
    return overlapLines;
  }
}
