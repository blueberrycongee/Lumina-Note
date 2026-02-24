/**
 * YAML Frontmatter 解析和写入工具
 * 用于 Dataview 风格数据库：笔记即数据
 */
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface FrontmatterData {
  [key: string]: unknown;
}

export interface ParsedNote {
  frontmatter: FrontmatterData;
  content: string;
  hasFrontmatter: boolean;
  parseError?: string;
}

/**
 * 解析 Markdown 文件的 YAML frontmatter
 */
export function parseFrontmatter(markdown: string): ParsedNote {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
  const match = markdown.match(frontmatterRegex);
  
  if (!match) {
    return {
      frontmatter: {},
      content: markdown,
      hasFrontmatter: false,
    };
  }
  
  const yamlContent = match[1];
  const content = markdown.slice(match[0].length);
  
  try {
    const parsed = parseYaml(yamlContent);
    const frontmatter =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as FrontmatterData)
        : {};
    return {
      frontmatter,
      content,
      hasFrontmatter: true,
    };
  } catch (error) {
    console.error("Failed to parse frontmatter:", error);
    return {
      frontmatter: {},
      content: markdown,
      hasFrontmatter: false,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 清理对象中的 undefined，避免序列化到 frontmatter。
 */
function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefined(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => [k, stripUndefined(v)] as const)
        .filter(([, v]) => v !== undefined),
    );
  }

  return value;
}

/**
 * 将 frontmatter 对象转换为 YAML 字符串
 */
export function stringifyFrontmatter(data: FrontmatterData): string {
  const cleaned = stripUndefined(data) as FrontmatterData;
  return stringifyYaml(cleaned, {
    lineWidth: 0,
    defaultKeyType: "PLAIN",
  }).trimEnd();
}

/**
 * 更新 Markdown 文件的 frontmatter
 */
export function updateFrontmatter(
  markdown: string,
  updates: Partial<FrontmatterData>
): string {
  const parsed = parseFrontmatter(markdown);
  
  // 合并更新
  const newFrontmatter = { ...parsed.frontmatter, ...updates };
  
  // 移除 undefined 值
  for (const key of Object.keys(newFrontmatter)) {
    if (newFrontmatter[key] === undefined) {
      delete newFrontmatter[key];
    }
  }
  
  const yamlString = stringifyFrontmatter(newFrontmatter);
  
  if (Object.keys(newFrontmatter).length === 0) {
    return parsed.content;
  }
  
  return `---\n${yamlString}\n---\n\n${parsed.content}`;
}

/**
 * 为笔记添加 frontmatter（如果没有的话）
 */
export function ensureFrontmatter(
  markdown: string,
  defaultData: FrontmatterData = {}
): string {
  const parsed = parseFrontmatter(markdown);
  
  if (parsed.hasFrontmatter) {
    return markdown;
  }
  
  if (Object.keys(defaultData).length === 0) {
    return markdown;
  }
  
  const yamlString = stringifyFrontmatter(defaultData);
  return `---\n${yamlString}\n---\n\n${markdown}`;
}

/**
 * 从笔记路径提取标题（文件名不含扩展名）
 */
export function getTitleFromPath(path: string): string {
  const fileName = path.split(/[/\\]/).pop() || '';
  return fileName.replace(/\.md$/i, '');
}

/**
 * 检查笔记是否属于某个数据库
 */
export function belongsToDatabase(
  frontmatter: FrontmatterData,
  dbId: string
): boolean {
  const dbValue = frontmatter.db;
  if (dbValue === undefined || dbValue === null) return false;
  return String(dbValue) === dbId;
}
