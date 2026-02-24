/**
 * Flashcard Types - AI 制卡系统类型定义
 * 
 * 复用 Database 系统架构：
 * - 卡片存储为 .md 笔记文件
 * - YAML frontmatter 存储卡片数据和 SM-2 状态
 * - .db.json 定义数据库结构
 */

// ==================== 卡片类型 ====================

export type FlashcardType = 
  | 'basic'           // 基础问答：front -> back
  | 'basic-reversed'  // 双向问答：自动生成反向卡
  | 'cloze'           // 填空题：{{c1::answer}} 语法
  | 'mcq'             // 选择题：多选项单答案
  | 'list';           // 列表题：按顺序回忆

// ==================== 卡片内容结构 ====================

/** 基础问答卡片 */
export interface BasicCard {
  type: 'basic';
  front: string;      // 问题/正面
  back: string;       // 答案/背面
}

/** 双向问答卡片 */
export interface BasicReversedCard {
  type: 'basic-reversed';
  front: string;      // 正面（如：英文单词）
  back: string;       // 背面（如：中文释义）
  // 复习时自动生成两张卡：front->back 和 back->front
}

/** 填空卡片 */
export interface ClozeCard {
  type: 'cloze';
  text: string;       // 包含 {{c1::answer}} 格式的文本
  // 支持多个填空：{{c1::first}}, {{c2::second}}
  // 每个 cN 生成一张独立的卡片
}

/** 选择题卡片 */
export interface McqCard {
  type: 'mcq';
  question: string;   // 问题
  options: string[];  // 选项列表
  answer: number;     // 正确答案索引 (0-based)
  explanation?: string; // 解释（可选）
}

/** 列表题卡片 */
export interface ListCard {
  type: 'list';
  question: string;   // 问题
  items: string[];    // 正确顺序的列表项
  ordered: boolean;   // 是否需要按顺序
}

export type FlashcardContent = 
  | BasicCard 
  | BasicReversedCard 
  | ClozeCard 
  | McqCard 
  | ListCard;

// ==================== SM-2 算法状态 ====================

export interface SM2State {
  ease: number;         // 难度因子 (1.3 - 2.5+)，默认 2.5
  interval: number;     // 间隔天数
  repetitions: number;  // 连续正确次数
  due: string;          // 下次复习日期 (ISO 格式 YYYY-MM-DD)
  lastReview?: string;  // 上次复习日期
}

/** 复习评分 */
export type ReviewRating = 
  | 0   // Again - 完全忘记
  | 1   // Hard - 勉强记得
  | 2   // Good - 正常记得
  | 3;  // Easy - 轻松记得

// ==================== 完整卡片数据 ====================

export interface Flashcard extends SM2State {
  // 元数据
  id: string;           // 笔记路径作为 ID
  notePath: string;     // 笔记文件路径
  deck: string;         // 牌组名称（支持层级：父/子）
  tags?: string[];      // 标签
  source?: string;      // 来源笔记链接 [[note]]
  created: string;      // 创建日期
  
  // 卡片内容（根据 type 不同结构不同）
  type: FlashcardType;
  front?: string;       // basic, basic-reversed
  back?: string;        // basic, basic-reversed
  text?: string;        // cloze
  question?: string;    // mcq, list
  options?: string[];   // mcq
  answer?: number;      // mcq
  items?: string[];     // list
  ordered?: boolean;    // list
  explanation?: string; // mcq
}

// ==================== 牌组 ====================

export interface Deck {
  id: string;           // 牌组 ID
  name: string;         // 牌组名称
  parentId?: string;    // 父牌组 ID（支持层级）
  description?: string;
  created: string;
  
  // 统计（运行时计算）
  totalCards?: number;
  dueCards?: number;
  newCards?: number;
}

// ==================== 复习会话 ====================

export interface ReviewSession {
  deckId: string;
  cards: Flashcard[];   // 待复习卡片队列
  currentIndex: number;
  startTime: string;
  
  // 统计
  reviewed: number;
  correct: number;
  incorrect: number;
}

// ==================== AI 制卡请求 ====================

export interface GenerateCardsRequest {
  content: string;      // 源内容（笔记文本或选中文本）
  sourceNote?: string;  // 来源笔记路径
  deck: string;         // 目标牌组
  types: FlashcardType[]; // 要生成的卡片类型
  count?: number;       // 生成数量（可选）
  language?: string;    // 语言偏好
}

export interface GenerateCardsResponse {
  cards: Omit<Flashcard, 'id' | 'notePath' | keyof SM2State | 'created'>[];
  suggestions?: string; // AI 的额外建议
}

// ==================== 数据库模板 ====================

/** Flashcard 数据库列定义 */
export const FLASHCARD_DATABASE_COLUMNS = [
  { id: 'deck', name: 'Deck', type: 'text' as const },
  { id: 'type', name: 'Type', type: 'select' as const, 
    options: [
      { id: 'basic', name: 'Basic', color: 'blue' as const },
      { id: 'basic-reversed', name: 'Reversed', color: 'purple' as const },
      { id: 'cloze', name: 'Cloze', color: 'green' as const },
      { id: 'mcq', name: 'Multiple choice', color: 'orange' as const },
      { id: 'list', name: 'List', color: 'yellow' as const },
    ]
  },
  { id: 'front', name: 'Front', type: 'text' as const },
  { id: 'due', name: 'Due', type: 'date' as const },
  { id: 'ease', name: 'Ease', type: 'number' as const },
  { id: 'interval', name: 'Interval', type: 'number' as const },
  { id: 'repetitions', name: 'Repetitions', type: 'number' as const },
  { id: 'source', name: 'Source', type: 'text' as const },
];
