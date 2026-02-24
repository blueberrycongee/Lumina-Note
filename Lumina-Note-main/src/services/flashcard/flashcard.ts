/**
 * Flashcard 工具函数
 * 
 * 处理卡片内容解析、填空语法、YAML 转换等
 */

import { 
  Flashcard, 
  ClozeCard,
  FLASHCARD_DATABASE_COLUMNS 
} from '@/types/flashcard';
import { INITIAL_SM2_STATE } from './sm2';
import { getCurrentTranslations } from '@/stores/useLocaleStore';

// ==================== 填空语法解析 ====================

/** 填空正则：{{c1::answer}} 或 {{c1::answer::hint}} */
const CLOZE_REGEX = /\{\{c(\d+)::([^}]+?)(?:::([^}]+))?\}\}/g;

function normalizeScalarString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  if (lower === 'undefined' || lower === 'null') return undefined;
  return trimmed;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const result = value
      .map(item => String(item).trim())
      .filter(Boolean);
    return result.length > 0 ? result : undefined;
  }

  const scalar = normalizeScalarString(value);
  if (!scalar) return undefined;

  const candidates = [scalar, scalar.replace(/\\"/g, '"')];
  for (const candidate of candidates) {
    if (candidate.startsWith('[') && candidate.endsWith(']')) {
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) {
          const result = parsed
            .map(item => String(item).trim())
            .filter(Boolean);
          return result.length > 0 ? result : undefined;
        }
      } catch {
        // ignore parse failure and continue fallback
      }
    }
  }

  if (scalar.includes(',')) {
    const split = scalar
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    return split.length > 0 ? split : undefined;
  }

  return [scalar];
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
  }
  return undefined;
}

function stripFrontmatter(markdown: string): string {
  const match = markdown.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? markdown.slice(match[0].length) : markdown;
}

function extractBasicFromBody(markdownContent?: string): { front?: string; back?: string } {
  if (!markdownContent) return {};

  const body = stripFrontmatter(markdownContent).trim();
  if (!body) return {};

  const lines = body.split('\n');
  const headingIndex = lines.findIndex(line => line.trim().startsWith('## '));

  if (headingIndex >= 0) {
    const heading = lines[headingIndex]
      .trim()
      .slice(3)
      .trim()
      .replace(/^(问[:：]\s*|問[:：]\s*|q[:：]\s*|question[:：]\s*)/i, '');
    const back = lines.slice(headingIndex + 1).join('\n').trim();
    return {
      front: normalizeScalarString(heading),
      back: normalizeScalarString(back),
    };
  }

  const firstContentIndex = lines.findIndex(line => line.trim().length > 0);
  if (firstContentIndex < 0) return {};

  const front = lines[firstContentIndex].trim();
  const back = lines.slice(firstContentIndex + 1).join('\n').trim();
  return {
    front: normalizeScalarString(front),
    back: normalizeScalarString(back),
  };
}

/**
 * 解析填空文本，提取所有填空
 */
export function parseCloze(text: string): { 
  index: number; 
  answer: string; 
  hint?: string;
}[] {
  const clozes: { index: number; answer: string; hint?: string }[] = [];
  let match;
  
  while ((match = CLOZE_REGEX.exec(text)) !== null) {
    clozes.push({
      index: parseInt(match[1], 10),
      answer: match[2],
      hint: match[3],
    });
  }
  
  // 重置正则状态
  CLOZE_REGEX.lastIndex = 0;
  
  return clozes;
}

/**
 * 获取填空卡片的唯一填空索引列表
 */
export function getClozeIndices(text: string): number[] {
  const clozes = parseCloze(text);
  return [...new Set(clozes.map(c => c.index))].sort((a, b) => a - b);
}

/**
 * 渲染填空卡片正面（隐藏指定索引的答案）
 */
export function renderClozeFront(text: string, activeIndex: number): string {
  return text.replace(CLOZE_REGEX, (_match, index, answer, hint) => {
    if (parseInt(index, 10) === activeIndex) {
      // 当前填空：显示空白或提示
      return hint ? `[${hint}]` : '[...]';
    }
    // 其他填空：显示答案
    return answer;
  });
}

/**
 * 渲染填空卡片背面（显示所有答案，高亮当前）
 */
export function renderClozeBack(text: string, activeIndex: number): string {
  return text.replace(CLOZE_REGEX, (_match, index, answer) => {
    if (parseInt(index, 10) === activeIndex) {
      // 当前填空：高亮显示
      return `**${answer}**`;
    }
    return answer;
  });
}

// ==================== 卡片生成 ====================

/**
 * 从填空卡片生成多张复习卡（每个 cN 一张）
 */
export function expandClozeCard(card: ClozeCard & { deck: string; source?: string }): Omit<Flashcard, 'id' | 'notePath'>[] {
  const indices = getClozeIndices(card.text);
  const today = new Date().toISOString().split('T')[0];
  
  return indices.map(index => ({
    ...INITIAL_SM2_STATE,
    type: 'cloze' as const,
    deck: card.deck,
    text: card.text,
    source: card.source,
    created: today,
    // 存储当前激活的填空索引
    _clozeIndex: index,
  } as any));
}

/**
 * 从双向卡片生成两张复习卡
 */
export function expandReversedCard(card: { 
  front: string; 
  back: string; 
  deck: string; 
  source?: string;
}): Omit<Flashcard, 'id' | 'notePath'>[] {
  const today = new Date().toISOString().split('T')[0];
  
  return [
    // 正向：front -> back
    {
      ...INITIAL_SM2_STATE,
      type: 'basic' as const,
      deck: card.deck,
      front: card.front,
      back: card.back,
      source: card.source,
      created: today,
    },
    // 反向：back -> front
    {
      ...INITIAL_SM2_STATE,
      type: 'basic' as const,
      deck: card.deck,
      front: card.back,
      back: card.front,
      source: card.source,
      created: today,
      _reversed: true,
    } as any,
  ];
}

// ==================== YAML 转换 ====================

/**
 * 将卡片数据转换为 YAML frontmatter 对象
 */
export function cardToYaml(card: Partial<Flashcard>): Record<string, any> {
  const yaml: Record<string, any> = {
    db: 'flashcards',
  };
  
  // 基础字段
  if (card.type) yaml.type = card.type;
  if (card.deck) yaml.deck = card.deck;
  if (card.source) yaml.source = card.source;
  const tags = normalizeStringArray(card.tags as unknown);
  if (tags?.length) yaml.tags = tags;
  
  // 内容字段（根据类型）
  if (card.front) yaml.front = card.front;
  if (card.back) yaml.back = card.back;
  if (card.text) yaml.text = card.text;
  if (card.question) yaml.question = card.question;
  const options = normalizeStringArray(card.options as unknown);
  if (options?.length) yaml.options = options;
  if (card.answer !== undefined) yaml.answer = card.answer;
  const items = normalizeStringArray(card.items as unknown);
  if (items?.length) yaml.items = items;
  if (card.ordered !== undefined) yaml.ordered = card.ordered;
  if (card.explanation) yaml.explanation = card.explanation;
  
  // SM-2 状态
  yaml.ease = card.ease ?? INITIAL_SM2_STATE.ease;
  yaml.interval = card.interval ?? INITIAL_SM2_STATE.interval;
  yaml.repetitions = card.repetitions ?? INITIAL_SM2_STATE.repetitions;
  yaml.due = card.due ?? INITIAL_SM2_STATE.due;
  if (card.lastReview) yaml.lastReview = card.lastReview;
  
  // 元数据
  yaml.created = card.created ?? new Date().toISOString().split('T')[0];
  
  return yaml;
}

/**
 * 从 YAML frontmatter 解析卡片数据
 */
export function yamlToCard(
  yaml: Record<string, any>,
  notePath: string,
  markdownContent?: string
): Flashcard | null {
  if (yaml.db !== 'flashcards') return null;

  const type = normalizeScalarString(yaml.type) || 'basic';
  const basicFallback = (type === 'basic' || type === 'basic-reversed')
    ? extractBasicFromBody(markdownContent)
    : {};

  return {
    id: notePath,
    notePath,
    type: type as Flashcard['type'],
    deck: yaml.deck || 'Default',
    
    // 内容字段
    front: normalizeScalarString(yaml.front) || basicFallback.front,
    back: normalizeScalarString(yaml.back) || basicFallback.back,
    text: normalizeScalarString(yaml.text),
    question: normalizeScalarString(yaml.question),
    options: normalizeStringArray(yaml.options),
    answer: normalizeNumber(yaml.answer),
    items: normalizeStringArray(yaml.items),
    ordered: normalizeBoolean(yaml.ordered),
    explanation: normalizeScalarString(yaml.explanation),
    
    // SM-2 状态
    ease: yaml.ease ?? INITIAL_SM2_STATE.ease,
    interval: yaml.interval ?? INITIAL_SM2_STATE.interval,
    repetitions: yaml.repetitions ?? INITIAL_SM2_STATE.repetitions,
    due: yaml.due ?? INITIAL_SM2_STATE.due,
    lastReview: yaml.lastReview,
    
    // 元数据
    source: yaml.source,
    tags: normalizeStringArray(yaml.tags),
    created: yaml.created ?? new Date().toISOString().split('T')[0],
  };
}

// ==================== 卡片笔记生成 ====================

/**
 * 生成卡片笔记的 Markdown 内容
 */
export function generateCardMarkdown(card: Partial<Flashcard>): string {
  const t = getCurrentTranslations();
  const yaml = cardToYaml(card);
  
  // 构建 YAML frontmatter
  const yamlLines = ['---'];
  for (const [key, value] of Object.entries(yaml)) {
    if (Array.isArray(value)) {
      yamlLines.push(`${key}:`);
      value.forEach(item => yamlLines.push(`  - ${JSON.stringify(item)}`));
    } else if (typeof value === 'string' && value.includes('\n')) {
      yamlLines.push(`${key}: |`);
      value.split('\n').forEach(line => yamlLines.push(`  ${line}`));
    } else {
      yamlLines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  yamlLines.push('---');
  yamlLines.push('');
  
  // 添加卡片内容作为笔记正文（方便阅读）
  if (card.type === 'basic' || card.type === 'basic-reversed') {
    yamlLines.push(`## ${t.flashcard.markdownQuestionPrefix} ${card.front ?? ''}`);
    yamlLines.push('');
    yamlLines.push(card.back ?? '');
  } else if (card.type === 'cloze') {
    yamlLines.push(`## ${t.flashcard.markdownClozeTitle}`);
    yamlLines.push('');
    yamlLines.push(card.text || '');
  } else if (card.type === 'mcq') {
    yamlLines.push(`## ${card.question ?? ''}`);
    yamlLines.push('');
    card.options?.forEach((opt, i) => {
      const marker = i === card.answer ? '✓' : ' ';
      yamlLines.push(`- [${marker}] ${opt}`);
    });
  } else if (card.type === 'list') {
    yamlLines.push(`## ${card.question ?? ''}`);
    yamlLines.push('');
    card.items?.forEach((item, i) => {
      yamlLines.push(`${i + 1}. ${item}`);
    });
  }
  
  // 添加来源链接
  if (card.source) {
    yamlLines.push('');
    yamlLines.push(`---`);
    yamlLines.push(`${t.flashcard.markdownSourceLabel}: ${card.source}`);
  }
  
  return yamlLines.join('\n');
}

/**
 * 生成卡片文件名
 */
export function generateCardFilename(card: Partial<Flashcard>): string {
  const timestamp = Date.now();
  const prefix = card.type || 'card';
  
  // 从内容生成简短标题
  let title = '';
  if (card.front) {
    title = card.front.slice(0, 30);
  } else if (card.text) {
    title = card.text.replace(CLOZE_REGEX, '$2').slice(0, 30);
  } else if (card.question) {
    title = card.question.slice(0, 30);
  }
  
  // 清理文件名
  title = title
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .trim();
  
  return `${prefix}_${title}_${timestamp}.md`;
}

// ==================== 数据库模板 ====================

/**
 * 获取 Flashcard 数据库定义
 */
export function getFlashcardDatabaseTemplate() {
  const t = getCurrentTranslations();
  const templateContent = t.database.templateContent?.flashcard;
  const templateMeta = t.database.createDialog?.templates?.flashcard;
  const columns = FLASHCARD_DATABASE_COLUMNS.map((col) => {
    const localizedName = templateContent?.columns?.[col.id as keyof typeof templateContent.columns];
    const optionNames = templateContent?.options?.[col.id as keyof typeof templateContent.options];
    const options = col.options?.map((opt) => ({
      ...opt,
      name: optionNames?.[opt.id as keyof typeof optionNames] || opt.name,
    }));
    return {
      ...col,
      name: localizedName || col.name,
      options,
    };
  });

  return {
    id: 'flashcards',
    name: t.flashcard.decks,
    icon: '🎴',
    description: templateMeta?.desc || '',
    columns,
    views: [
      { id: 'table', name: templateContent?.views?.table || 'Table', type: 'table' as const },
      { id: 'kanban', name: templateContent?.views?.kanban || 'Kanban', type: 'kanban' as const, groupBy: 'deck' },
    ],
    activeViewId: 'table',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
