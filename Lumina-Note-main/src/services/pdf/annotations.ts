/**
 * PDF 批注 Markdown 读写工具
 * 
 * 批注文件格式:
 * ```markdown
 * # 📝 批注 - 论文名.pdf
 * 
 * ## 第 3 页
 * 
 * > 这是高亮的文本内容
 * 
 * 我的笔记：这段话很重要...
 * 
 * [📍 跳转](lumina://pdf?file=path.pdf&page=3&id=ann-001)
 * 
 * ---
 * ```
 */

import type { Annotation, AnnotationFile, TextPosition, AnnotationColor, AnnotationType } from '@/types/annotation';
import { getCurrentTranslations } from '@/stores/useLocaleStore';

/**
 * 生成唯一的批注 ID
 */
export function generateAnnotationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `ann-${timestamp}-${random}`;
}

/**
 * 获取批注文件路径（与 PDF 同目录）
 */
export function getAnnotationFilePath(pdfPath: string): string {
  // 移除 .pdf 扩展名，添加 .annotations.md
  return pdfPath.replace(/\.pdf$/i, '.annotations.md');
}

/**
 * 从 PDF 路径提取文件名
 */
export function getPdfFileName(pdfPath: string): string {
  return pdfPath.split(/[/\\]/).pop() || 'unknown.pdf';
}

/**
 * 解析批注 Markdown 文件
 */
export function parseAnnotationsMarkdown(content: string, pdfPath: string): AnnotationFile {
  const pdfName = getPdfFileName(pdfPath);
  const annotations: Annotation[] = [];

  // Locale-agnostic parsing:
  // - We don't rely on localized "第 X 页"/"Page X" strings.
  // - We split by markdown `##` headings and extract the first number as a hint,
  //   but each annotation can also infer pageIndex from link/position metadata.
  const headingRegex = /^##\s+(.+)$/gm;
  const headings: Array<{ title: string; index: number; endOfLine: number }> = [];

  let h: RegExpExecArray | null;
  while ((h = headingRegex.exec(content)) !== null) {
    headings.push({ title: (h[1] ?? '').trim(), index: h.index, endOfLine: headingRegex.lastIndex });
  }

  if (headings.length === 0) {
    // Fallback: parse everything after the title line.
    const body = content.replace(/^#.*\n/, '').trim();
    annotations.push(...parseAnnotationBlock(body, undefined, pdfPath));
  } else {
    for (let i = 0; i < headings.length; i++) {
      const current = headings[i];
      const next = headings[i + 1];
      const blockStart = current.endOfLine;
      const blockEnd = next ? next.index : content.length;
      const blockContent = content.slice(blockStart, blockEnd).trim();

      const headingPageMatch = current.title.match(/(\d+)/);
      const headingPageIndex = headingPageMatch ? Number.parseInt(headingPageMatch[1], 10) : undefined;

      annotations.push(...parseAnnotationBlock(blockContent, headingPageIndex, pdfPath));
    }
  }
  
  return {
    pdfPath,
    pdfName,
    annotations,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 解析单个页面块中的批注
 */
function parseAnnotationBlock(blockContent: string, headingPageIndex: number | undefined, _pdfPath: string): Annotation[] {
  const annotations: Annotation[] = [];
  
  // 匹配引用块（高亮文本）
  const quoteRegex = /^> (.+)$/gm;
  // 匹配跳转链接（不依赖本地化文案），并提取 query string
  const linkRegex = /\[📍[^\]]*\]\(lumina:\/\/pdf\?([^)]+)\)/;
  // 匹配位置数据（隐藏在 HTML 注释中）
  const positionRegex = /<!--\s*position:\s*(\{[\s\S]*?\})\s*-->/;
  // 匹配颜色和类型
  const metaRegex = /<!--\s*meta:\s*(\{[\s\S]*?\})\s*-->/;
  
  // 分割成多个批注（每个以引用开头）
  const annotationBlocks = blockContent.split(/\n(?=>)/);
  
  for (const block of annotationBlocks) {
    if (!block.trim()) continue;
    
    const quoteMatch = block.match(quoteRegex);
    const linkMatch = block.match(linkRegex);
    const positionMatch = block.match(positionRegex);
    const metaMatch = block.match(metaRegex);
    
    if (!quoteMatch || quoteMatch.length === 0) continue;
    
    // 提取高亮文本
    const selectedText = quoteMatch.map(q => q.replace(/^> /, '')).join('\n');
    
    // 提取 link 元数据（id/page 等）
    let pageIndexFromLink: number | undefined;
    let idFromLink: string | undefined;
    if (linkMatch?.[1]) {
      try {
        const params = new URLSearchParams(linkMatch[1]);
        const page = params.get('page');
        const id = params.get('id');
        if (page) pageIndexFromLink = Number.parseInt(page, 10);
        if (id) idFromLink = id;
      } catch {
        // ignore
      }
    }
    const id = idFromLink ?? generateAnnotationId();
    
    // 提取位置信息
    let position: TextPosition = {
      pageIndex: headingPageIndex ?? pageIndexFromLink ?? 1,
      rects: [],
    };
    if (positionMatch) {
      try {
        position = JSON.parse(positionMatch[1]);
      } catch (e) {
        // 使用默认位置
      }
    }

    const pageIndex = position.pageIndex ?? pageIndexFromLink ?? headingPageIndex ?? 1;
    
    // 提取元数据
    let type: AnnotationType = 'highlight';
    let color: AnnotationColor = 'yellow';
    let createdAt = new Date().toISOString();
    let updatedAt = createdAt;
    
    if (metaMatch) {
      try {
        const meta = JSON.parse(metaMatch[1]);
        type = meta.type || type;
        color = meta.color || color;
        createdAt = meta.createdAt || createdAt;
        updatedAt = meta.updatedAt || updatedAt;
      } catch (e) {
        // 使用默认值
      }
    }
    
    // 提取笔记（非引用、非链接、非注释的行）
    const noteLines = block
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed && 
               trimmed !== '---' &&
               !trimmed.startsWith('>') && 
               !trimmed.startsWith('[📍') &&
               !trimmed.startsWith('<!--');
      });
    const note = noteLines.join('\n').trim() || undefined;
    
    annotations.push({
      id,
      type,
      color,
      pageIndex,
      selectedText,
      note,
      position,
      createdAt,
      updatedAt,
    });
  }
  
  return annotations;
}

/**
 * 将批注数据序列化为 Markdown
 */
export function stringifyAnnotationsMarkdown(file: AnnotationFile): string {
  const t = getCurrentTranslations();
  const lines: string[] = [];
  
  // 标题
  lines.push(`# 📝 ${t.pdfViewer.annotation.exportTitle} - ${file.pdfName}`);
  lines.push('');
  
  // 按页码分组
  const byPage = new Map<number, Annotation[]>();
  for (const ann of file.annotations) {
    const page = ann.pageIndex;
    if (!byPage.has(page)) {
      byPage.set(page, []);
    }
    byPage.get(page)!.push(ann);
  }
  
  // 按页码排序
  const sortedPages = Array.from(byPage.keys()).sort((a, b) => a - b);
  
  for (const pageIndex of sortedPages) {
    const pageAnnotations = byPage.get(pageIndex)!;
    
    lines.push(`## ${t.pdfViewer.annotation.exportPage.replace("{page}", String(pageIndex))}`);
    lines.push('');
    
    for (const ann of pageAnnotations) {
      // 引用块
      const textLines = ann.selectedText.split('\n');
      for (const textLine of textLines) {
        lines.push(`> ${textLine}`);
      }
      lines.push('');
      
      // 笔记
      if (ann.note) {
        lines.push(ann.note);
        lines.push('');
      }
      
      // 跳转链接
      const encodedPath = encodeURIComponent(file.pdfPath);
      lines.push(`[📍 ${t.pdfViewer.annotation.exportJump}](lumina://pdf?file=${encodedPath}&page=${pageIndex}&id=${ann.id})`);
      lines.push('');
      
      // 位置数据（隐藏）
      lines.push(`<!-- position: ${JSON.stringify(ann.position)} -->`);
      
      // 元数据（隐藏）
      const meta = {
        type: ann.type,
        color: ann.color,
        createdAt: ann.createdAt,
        updatedAt: ann.updatedAt,
      };
      lines.push(`<!-- meta: ${JSON.stringify(meta)} -->`);
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * 添加批注到文件
 */
export function addAnnotation(file: AnnotationFile, annotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>): AnnotationFile {
  const now = new Date().toISOString();
  const newAnnotation: Annotation = {
    ...annotation,
    id: generateAnnotationId(),
    createdAt: now,
    updatedAt: now,
  };
  
  return {
    ...file,
    annotations: [...file.annotations, newAnnotation],
    updatedAt: now,
  };
}

/**
 * 更新批注
 */
export function updateAnnotation(file: AnnotationFile, id: string, updates: Partial<Annotation>): AnnotationFile {
  const now = new Date().toISOString();
  
  return {
    ...file,
    annotations: file.annotations.map(ann =>
      ann.id === id
        ? { ...ann, ...updates, updatedAt: now }
        : ann
    ),
    updatedAt: now,
  };
}

/**
 * 删除批注
 */
export function deleteAnnotation(file: AnnotationFile, id: string): AnnotationFile {
  return {
    ...file,
    annotations: file.annotations.filter(ann => ann.id !== id),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 创建空的批注文件
 */
export function createEmptyAnnotationFile(pdfPath: string): AnnotationFile {
  const now = new Date().toISOString();
  return {
    pdfPath,
    pdfName: getPdfFileName(pdfPath),
    annotations: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 解析 lumina:// 协议链接
 */
export function parseLuminaLink(url: string): { file?: string; page?: number; id?: string } | null {
  if (!url.startsWith('lumina://pdf?')) {
    return null;
  }
  
  try {
    const params = new URLSearchParams(url.replace('lumina://pdf?', ''));
    return {
      file: params.get('file') ? decodeURIComponent(params.get('file')!) : undefined,
      page: params.get('page') ? parseInt(params.get('page')!, 10) : undefined,
      id: params.get('id') || undefined,
    };
  } catch {
    return null;
  }
}
