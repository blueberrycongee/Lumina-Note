/**
 * YAML Frontmatter 解析和写入工具
 * 用于 Dataview 风格数据库：笔记即数据
 */

export interface FrontmatterData {
  [key: string]: unknown;
}

export interface ParsedNote {
  frontmatter: FrontmatterData;
  content: string;
  hasFrontmatter: boolean;
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
    const frontmatter = parseYaml(yamlContent);
    return {
      frontmatter,
      content,
      hasFrontmatter: true,
    };
  } catch (error) {
    console.error('Failed to parse frontmatter:', error);
    return {
      frontmatter: {},
      content: markdown,
      hasFrontmatter: false,
    };
  }
}

/**
 * 简单的 YAML 解析器（支持基本类型）
 */
function parseYaml(yaml: string): FrontmatterData {
  const result: FrontmatterData = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentArray: unknown[] | null = null;
  
  for (const line of lines) {
    // 跳过空行和注释
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }
    
    // 数组项: - value
    const arrayItemMatch = line.match(/^\s+-\s+(.*)$/);
    if (arrayItemMatch && currentKey && currentArray) {
      const value = parseYamlValue(arrayItemMatch[1].trim());
      currentArray.push(value);
      continue;
    }
    
    // 键值对: key: value（支持中文键名）
    const keyValueMatch = line.match(/^([^\s:]+):\s*(.*)$/);
    if (keyValueMatch) {
      const key = keyValueMatch[1];
      const rawValue = keyValueMatch[2].trim();
      
      // 如果值为空，可能是数组开始
      if (!rawValue) {
        currentKey = key;
        currentArray = [];
        result[key] = currentArray;
      } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        // 内联数组: [a, b, c]
        result[key] = parseInlineArray(rawValue);
        currentKey = null;
        currentArray = null;
      } else {
        result[key] = parseYamlValue(rawValue);
        currentKey = null;
        currentArray = null;
      }
    }
  }
  
  return result;
}

/**
 * 解析 YAML 值
 */
function parseYamlValue(value: string): unknown {
  // 去除引号
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  
  // 布尔值
  if (value === 'true') return true;
  if (value === 'false') return false;
  
  // null
  if (value === 'null' || value === '~') return null;
  
  // 数字
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  
  // 日期 (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value; // 保持字符串格式
  }
  
  // WikiLink: [[note]]
  if (value.startsWith('[[') && value.endsWith(']]')) {
    return value;
  }
  
  return value;
}

/**
 * 解析内联数组 [a, b, c]
 */
function parseInlineArray(value: string): unknown[] {
  const inner = value.slice(1, -1).trim();
  if (!inner) return [];
  
  return inner.split(',').map(item => parseYamlValue(item.trim()));
}

/**
 * 将 frontmatter 对象转换为 YAML 字符串
 */
export function stringifyFrontmatter(data: FrontmatterData): string {
  const lines: string[] = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
        // 简单数组用内联格式
        const items = value.map(v => stringifyValue(v)).join(', ');
        lines.push(`${key}: [${items}]`);
      } else {
        // 复杂数组用多行格式
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${stringifyValue(item)}`);
        }
      }
    } else {
      lines.push(`${key}: ${stringifyValue(value)}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * 序列化单个值
 */
function stringifyValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // 需要引号的情况
    if (value.includes(':') || value.includes('#') || 
        value.includes('\n') || value.startsWith(' ') ||
        value.endsWith(' ')) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  // 处理 DateValue 对象 { start: string, end?: string }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('start' in obj && typeof obj.start === 'string') {
      // DateValue 对象
      if ('end' in obj && typeof obj.end === 'string') {
        return `"${obj.start} ~ ${obj.end}"`;
      }
      return obj.start;
    }
    // 其他对象转 JSON
    return JSON.stringify(value);
  }
  return String(value);
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
  return frontmatter.db === dbId;
}
