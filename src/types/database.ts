/**
 * Dataview-style Database Types
 * 
 * 架构：笔记 YAML frontmatter = 真相来源
 * - 数据库定义：vault/Databases/*.db.json（只存列定义，不存数据）
 * - 行数据：从笔记 YAML 动态读取
 * - 双向同步：编辑表格 → 写回笔记 YAML
 */

// ==================== 列类型定义 ====================

export type ColumnType = 
  | 'text'
  | 'number'
  | 'select'
  | 'multi-select'
  | 'date'
  | 'checkbox'
  | 'url'
  | 'formula'
  | 'relation';

// Select 选项
export interface SelectOption {
  id: string;
  name: string;
  color: SelectColor;
}

export type SelectColor = 
  | 'gray' | 'brown' | 'orange' | 'yellow' | 'green' 
  | 'blue' | 'purple' | 'pink' | 'red';

// 列定义
export interface DatabaseColumn {
  id: string;
  name: string;
  type: ColumnType;
  width?: number; // 列宽度，可选
  
  // Select/Multi-select 选项
  options?: SelectOption[];
  
  // Number 格式
  numberFormat?: 'number' | 'percent' | 'currency';
  
  // Date 格式
  dateFormat?: 'full' | 'date' | 'time' | 'relative';
  includeTime?: boolean;
  
  // Formula 公式
  formula?: string;
  
  // Relation 关联
  relationDbId?: string; // 关联的数据库 ID
}

// ==================== 单元格值类型 ====================

export type CellValue = 
  | string                    // text, url
  | number                    // number
  | boolean                   // checkbox
  | string[]                  // multi-select (option ids)
  | DateValue                 // date
  | null;

export interface DateValue {
  start: string;  // ISO 日期字符串
  end?: string;   // 可选的结束日期（范围）
}

// ==================== 行数据 ====================

/**
 * 数据库行（从笔记 YAML 动态读取）
 */
export interface DatabaseRow {
  id: string;                        // 稳定行 ID（frontmatter.noteId）
  notePath: string;                  // 笔记文件路径
  noteTitle: string;                 // 笔记标题（从文件名或 YAML title 读取）
  cells: Record<string, CellValue>;  // columnId/columnName -> value
  createdAt: string;
  updatedAt: string;
}

/**
 * 兼容旧版本的行数据（用于迁移）
 */
export interface LegacyDatabaseRow {
  id: string;
  cells: Record<string, CellValue>;
  createdAt: string;
  updatedAt: string;
}

// ==================== 视图定义 ====================

export type ViewType = 'table' | 'kanban' | 'calendar' | 'gallery';

export interface DatabaseView {
  id: string;
  name: string;
  type: ViewType;
  
  // 列显示/隐藏
  visibleColumns?: string[]; // 如果为空则显示所有
  
  // 排序
  sorts?: SortRule[];
  
  // 筛选
  filters?: FilterGroup;
  
  // 分组 (Kanban 视图)
  groupBy?: string; // columnId
  
  // 日历视图日期列
  dateColumn?: string;
  calendarEmptyDateStrategy?: 'show' | 'hide';
}

export interface SortRule {
  columnId: string;
  direction: 'asc' | 'desc';
}

export interface FilterRule {
  id: string;
  columnId: string;
  operator: FilterOperator;
  value: CellValue;
}

export type FilterOperator = 
  | 'equals' | 'not_equals'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with'
  | 'is_empty' | 'is_not_empty'
  | 'greater_than' | 'less_than'
  | 'greater_equal' | 'less_equal'
  | 'is_checked' | 'is_not_checked'
  | 'date_is' | 'date_before' | 'date_after';

export interface FilterGroup {
  type: 'and' | 'or';
  rules: (FilterRule | FilterGroup)[];
}

// ==================== 数据库主体 ====================

/**
 * 数据库定义（只存结构，不存数据）
 * 行数据从笔记 YAML 动态读取
 */
export interface Database {
  id: string;
  name: string;
  icon?: string; // emoji 或 lucide 图标名
  description?: string;
  noteFolder?: string; // 新建/复制行时笔记默认落盘目录（相对 vault）
  
  // 列定义
  columns: DatabaseColumn[];
  
  // 注意：不再存储 rows，数据从笔记 YAML 动态读取
  // rows 字段仅用于兼容旧版本，加载时会忽略
  
  // 视图列表
  views: DatabaseView[];
  activeViewId: string;
  
  // 元数据
  createdAt: string;
  updatedAt: string;
}

/**
 * 运行时数据库状态（包含动态加载的行）
 */
export interface DatabaseWithRows extends Database {
  rows: DatabaseRow[];  // 从笔记动态加载的行
}

/**
 * 旧版数据库格式（用于迁移）
 */
export interface LegacyDatabase {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  noteFolder?: string;
  columns: DatabaseColumn[];
  rows: LegacyDatabaseRow[];  // 旧版直接存储行
  views: DatabaseView[];
  activeViewId: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 工具函数类型 ====================

export interface CreateDatabaseOptions {
  name: string;
  icon?: string;
  description?: string;
  template?: 'blank' | 'task' | 'project' | 'reading' | 'flashcard';
}

// 预置模板
export const DATABASE_TEMPLATES: Record<string, Partial<Database>> = {
  blank: {
    columns: [
      { id: 'title', name: 'Title', type: 'text' },
    ],
    views: [
      { id: 'default', name: 'Table', type: 'table' }
    ],
  },
  flashcard: {
    columns: [
      { id: 'deck', name: 'Deck', type: 'text' },
      { id: 'type', name: 'Type', type: 'select',
        options: [
          { id: 'basic', name: 'Basic', color: 'blue' },
          { id: 'basic-reversed', name: 'Reversed', color: 'purple' },
          { id: 'cloze', name: 'Cloze', color: 'green' },
          { id: 'mcq', name: 'Multiple choice', color: 'orange' },
          { id: 'list', name: 'List', color: 'yellow' },
        ]
      },
      { id: 'front', name: 'Front', type: 'text' },
      { id: 'due', name: 'Due', type: 'date' },
      { id: 'ease', name: 'Ease', type: 'number' },
      { id: 'interval', name: 'Interval', type: 'number' },
      { id: 'repetitions', name: 'Repetitions', type: 'number' },
      { id: 'source', name: 'Source', type: 'text' },
    ],
    views: [
      { id: 'table', name: 'Table', type: 'table' },
      { id: 'kanban', name: 'Decks', type: 'kanban', groupBy: 'deck' }
    ],
  },
  task: {
    columns: [
      { id: 'title', name: 'Task', type: 'text' },
      { 
        id: 'status', 
        name: 'Status', 
        type: 'select',
        options: [
          { id: 'todo', name: 'Todo', color: 'gray' },
          { id: 'doing', name: 'In progress', color: 'blue' },
          { id: 'done', name: 'Done', color: 'green' },
        ]
      },
      { id: 'priority', name: 'Priority', type: 'select',
        options: [
          { id: 'high', name: 'High', color: 'red' },
          { id: 'medium', name: 'Medium', color: 'yellow' },
          { id: 'low', name: 'Low', color: 'gray' },
        ]
      },
      { id: 'dueDate', name: 'Due date', type: 'date' },
      { id: 'done', name: 'Done', type: 'checkbox' },
    ],
    views: [
      { id: 'table', name: 'Table', type: 'table' },
      { id: 'kanban', name: 'Kanban', type: 'kanban', groupBy: 'status' }
    ],
  },
  project: {
    columns: [
      { id: 'title', name: 'Project name', type: 'text' },
      { id: 'status', name: 'Status', type: 'select',
        options: [
          { id: 'planning', name: 'Planning', color: 'gray' },
          { id: 'active', name: 'Active', color: 'blue' },
          { id: 'paused', name: 'Paused', color: 'yellow' },
          { id: 'completed', name: 'Completed', color: 'green' },
        ]
      },
      { id: 'startDate', name: 'Start date', type: 'date' },
      { id: 'endDate', name: 'End date', type: 'date' },
      { id: 'progress', name: 'Progress', type: 'number', numberFormat: 'percent' },
      { id: 'url', name: 'Link', type: 'url' },
    ],
    views: [
      { id: 'table', name: 'Table', type: 'table' },
    ],
  },
  reading: {
    columns: [
      { id: 'title', name: 'Book title', type: 'text' },
      { id: 'author', name: 'Author', type: 'text' },
      { id: 'status', name: 'Status', type: 'select',
        options: [
          { id: 'want', name: 'Want to read', color: 'gray' },
          { id: 'reading', name: 'Reading', color: 'blue' },
          { id: 'finished', name: 'Finished', color: 'green' },
        ]
      },
      { id: 'rating', name: 'Rating', type: 'number' },
      { id: 'tags', name: 'Tags', type: 'multi-select',
        options: [
          { id: 'fiction', name: 'Fiction', color: 'purple' },
          { id: 'tech', name: 'Tech', color: 'blue' },
          { id: 'self-help', name: 'Self-improvement', color: 'green' },
        ]
      },
      { id: 'startDate', name: 'Start reading', type: 'date' },
      { id: 'finishDate', name: 'Finish reading', type: 'date' },
    ],
    views: [
      { id: 'table', name: 'Table', type: 'table' },
      { id: 'kanban', name: 'Kanban', type: 'kanban', groupBy: 'status' }
    ],
  }
};

// Select 颜色映射
export const SELECT_COLORS: Record<SelectColor, { bg: string; text: string; border: string }> = {
  gray: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-300' },
  brown: { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-800 dark:text-amber-200', border: 'border-amber-400' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-700 dark:text-orange-200', border: 'border-orange-400' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200', border: 'border-yellow-400' },
  green: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-200', border: 'border-green-400' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-200', border: 'border-blue-400' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900', text: 'text-purple-700 dark:text-purple-200', border: 'border-purple-400' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-900', text: 'text-pink-700 dark:text-pink-200', border: 'border-pink-400' },
  red: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-700 dark:text-red-200', border: 'border-red-400' },
};
