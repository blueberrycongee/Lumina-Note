import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Database,
  DatabaseColumn,
  DatabaseRow,
  DatabaseView,
  DatabaseWithRows,
  CellValue,
  CreateDatabaseOptions,
  SelectOption,
  SortRule,
  FilterGroup,
  ColumnType,
} from "@/types/database";
import { DATABASE_TEMPLATES } from "@/types/database";
import { readFile, saveFile, exists, createDir } from "@/lib/tauri";
import { parseFrontmatter, updateFrontmatter, getTitleFromPath } from "@/services/markdown/frontmatter";
import { useFileStore } from "./useFileStore";
import { useSplitStore } from "./useSplitStore";
import { getCurrentTranslations } from "@/stores/useLocaleStore";
import { applyFilters } from "./databaseFilter";

// ==================== 工具函数 ====================

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// 将名称转换为安全的文件名/ID
function slugify(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')  // 替换 Windows 非法字符
    .replace(/\s+/g, '-')           // 空格转连字符
    .replace(/-+/g, '-')            // 多个连字符合并
    .replace(/^-|-$/g, '');         // 移除首尾连字符
}

function localizeTemplate(
  templateId: CreateDatabaseOptions['template'] | undefined,
  template: Partial<Database>
): Partial<Database> {
  const t = getCurrentTranslations();
  const content = (t.database as any).templateContent?.[templateId || 'blank'];
  if (!content) return template;

  const columns = template.columns?.map((col) => {
    const name = content.columns?.[col.id as keyof typeof content.columns] || col.name;
    const optionNames = content.options?.[col.id as keyof typeof content.options];
    const options = col.options?.map((opt) => ({
      ...opt,
      name: optionNames?.[opt.id as keyof typeof optionNames] || opt.name,
    }));
    return { ...col, name, options };
  });

  const views = template.views?.map((view) => {
    const viewName = content.views?.[view.type as keyof typeof content.views] || view.name;
    return { ...view, name: viewName };
  });

  return { ...template, columns, views };
}

// 确保文件名唯一（如果已存在则添加数字后缀）
async function ensureUniquePath(basePath: string, ext: string): Promise<string> {
  let path = `${basePath}${ext}`;
  let counter = 1;
  while (await exists(path)) {
    path = `${basePath}-${counter}${ext}`;
    counter++;
  }
  return path;
}

function getDbDir(): string {
  const vaultPath = useFileStore.getState().vaultPath;
  if (!vaultPath) throw new Error("No vault path set");
  return `${vaultPath}/Databases`;
}

function getDbPath(dbId: string): string {
  return `${getDbDir()}/${dbId}.db.json`;
}

// 格式化 YAML 值
function formatYamlValue(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'object' && 'start' in value) {
    // DateValue
    return value.end ? `${value.start} - ${value.end}` : value.start;
  }
  return String(value);
}

// ==================== Store Interface ====================

interface DatabaseState {
  // 已加载的数据库（包含运行时行数据）
  databases: Record<string, DatabaseWithRows>;
  
  // 当前打开的数据库 ID
  currentDbId: string | null;
  
  // 编辑状态
  editingCell: { rowId: string; columnId: string } | null;
  
  // ===== 加载/保存 =====
  loadDatabase: (dbId: string) => Promise<DatabaseWithRows | null>;
  saveDatabase: (dbId: string) => Promise<void>;
  listDatabases: () => Promise<string[]>;
  
  // ===== Dataview: 从笔记加载行 =====
  loadRowsFromNotes: (dbId: string) => Promise<DatabaseRow[]>;
  refreshRows: (dbId: string) => Promise<void>;
  
  // ===== 数据库操作 =====
  createDatabase: (options: CreateDatabaseOptions) => Promise<string>;
  deleteDatabase: (dbId: string) => Promise<void>;
  renameDatabase: (dbId: string, name: string) => void;
  setCurrentDb: (dbId: string | null) => void;
  
  // ===== 列操作 =====
  addColumn: (dbId: string, column: Partial<DatabaseColumn>) => void;
  updateColumn: (dbId: string, columnId: string, updates: Partial<DatabaseColumn>) => void;
  deleteColumn: (dbId: string, columnId: string) => void;
  reorderColumns: (dbId: string, columnIds: string[]) => void;
  
  // ===== 行操作 (Dataview: 操作笔记 YAML) =====
  addRow: (dbId: string, cells?: Record<string, CellValue>) => Promise<string>;
  updateCell: (dbId: string, rowId: string, columnId: string, value: CellValue) => Promise<boolean>;
  deleteRow: (dbId: string, rowId: string) => Promise<void>;
  duplicateRow: (dbId: string, rowId: string) => Promise<string>;
  reorderRows: (dbId: string, rowIds: string[]) => void;
  
  // ===== 视图操作 =====
  addView: (dbId: string, view: Partial<DatabaseView>) => string;
  updateView: (dbId: string, viewId: string, updates: Partial<DatabaseView>) => void;
  deleteView: (dbId: string, viewId: string) => void;
  setActiveView: (dbId: string, viewId: string) => void;
  
  // ===== Select 选项操作 =====
  addSelectOption: (dbId: string, columnId: string, option: Omit<SelectOption, 'id'>) => string;
  updateSelectOption: (dbId: string, columnId: string, optionId: string, updates: Partial<SelectOption>) => void;
  deleteSelectOption: (dbId: string, columnId: string, optionId: string) => void;
  
  // ===== 编辑状态 =====
  setEditingCell: (cell: { rowId: string; columnId: string } | null) => void;
  
  // ===== 排序和筛选 =====
  setSorts: (dbId: string, viewId: string, sorts: SortRule[]) => void;
  setFilters: (dbId: string, viewId: string, filters: FilterGroup | undefined) => void;
  
  // ===== 获取处理后的数据 =====
  getFilteredSortedRows: (dbId: string) => DatabaseRow[];
}

// ==================== Store 实现 ====================

export const useDatabaseStore = create<DatabaseState>()(
  persist(
    (set, get) => ({
      databases: {},
      currentDbId: null,
      editingCell: null,
      
      // ===== 加载/保存 =====
      loadDatabase: async (dbId: string) => {
        const path = getDbPath(dbId);
        try {
          const fileExists = await exists(path);
          if (!fileExists) {
            console.warn(`Database file not found: ${path}`);
            return null;
          }
          
          const content = await readFile(path);
          const dbDef = JSON.parse(content) as Database;
          
          // 从笔记加载行数据
          const rows = await get().loadRowsFromNotes(dbId);
          
          const dbWithRows: DatabaseWithRows = {
            ...dbDef,
            rows,
          };
          
          set((state) => ({
            databases: { ...state.databases, [dbId]: dbWithRows }
          }));
          
          return dbWithRows;
        } catch (error) {
          console.error(`Failed to load database ${dbId}:`, error);
          return null;
        }
      },
      
      saveDatabase: async (dbId: string) => {
        const db = get().databases[dbId];
        if (!db) return;
        
        const dir = getDbDir();
        const dirExists = await exists(dir);
        if (!dirExists) {
          await createDir(dir);
        }
        
        // 只保存数据库定义，不保存 rows（rows 在笔记 YAML 中）
        const { rows: _, ...dbDef } = db;
        
        const path = getDbPath(dbId);
        const content = JSON.stringify(dbDef, null, 2);
        await saveFile(path, content);
      },
      
      listDatabases: async () => {
        const dir = getDbDir();
        try {
          const dirExists = await exists(dir);
          if (!dirExists) return [];
          
          return Object.keys(get().databases);
        } catch {
          return [];
        }
      },
      
      // ===== Dataview: 从笔记加载行 =====
      loadRowsFromNotes: async (dbId: string) => {
        const vaultPath = useFileStore.getState().vaultPath;
        if (!vaultPath) return [];
        
        // 先读取数据库定义获取列映射
        const dbPath = getDbPath(dbId);
        let columns: DatabaseColumn[] = [];
        try {
          const dbContent = await readFile(dbPath);
          const dbDef = JSON.parse(dbContent) as Database;
          columns = dbDef.columns;
        } catch {
          // 数据库定义不存在，使用空列
        }
        
        // 构建列名到 ID 的映射
        const nameToId = new Map<string, string>();
        for (const col of columns) {
          nameToId.set(col.name.toLowerCase(), col.id);
        }
        
        const fileTree = useFileStore.getState().fileTree;
        const rows: DatabaseRow[] = [];
        const seenPaths = new Set<string>();
        
        // 递归收集所有 .md 文件
        const collectMdFiles = (entries: typeof fileTree): string[] => {
          const files: string[] = [];
          for (const entry of entries) {
            if (entry.isDirectory && entry.children) {
              files.push(...collectMdFiles(entry.children));
            } else if (entry.name.endsWith('.md')) {
              files.push(entry.path);
            }
          }
          return files;
        };
        
        const mdFiles = collectMdFiles(fileTree);

        // 特殊处理：闪卡数据库额外显式扫描 Flashcards 目录，防止某些环境下未出现在 fileTree 中
        const extraMdFiles: string[] = [];
        if (dbId === "flashcards") {
          try {
            const { readDir } = await import("@tauri-apps/plugin-fs");
            const { join } = await import("@tauri-apps/api/path");

            const candidateDirs = [
              await join(vaultPath, "Flashcards"),
              await join(vaultPath, "flashcard"),
              await join(vaultPath, "flashcards"),
            ];

            for (const dir of candidateDirs) {
              try {
                const entries = await readDir(dir);
                for (const entry of entries) {
                  if (entry.name?.endsWith(".md")) {
                    const filePath = await join(dir, entry.name);
                    extraMdFiles.push(filePath);
                  }
                }
              } catch {
                // 目录不存在时忽略
              }
            }
          } catch (error) {
            console.warn("[Database] Failed to scan Flashcards directories:", error);
          }
        }

        const allMdFiles = Array.from(new Set<string>([...mdFiles, ...extraMdFiles]));
        
        // 读取每个文件的 frontmatter
        for (const filePath of allMdFiles) {
          try {
            const content = await readFile(filePath);
            const { frontmatter, hasFrontmatter } = parseFrontmatter(content);
            
            // 检查是否属于此数据库
            if (hasFrontmatter && frontmatter.db === dbId) {
              // 构建 cells，使用列 ID 作为键
              const cells: Record<string, CellValue> = {};
              for (const [key, value] of Object.entries(frontmatter)) {
                if (!['db', 'createdAt', 'updatedAt'].includes(key)) {
                  // 尝试通过列名找到列 ID，否则直接使用 key
                  const columnId = nameToId.get(key.toLowerCase()) || key;
                  
                  // 根据列类型转换值
                  const column = columns.find(c => c.id === columnId);
                  if (column?.type === 'date' && typeof value === 'string' && value) {
                    // 日期字符串转 DateValue 对象
                    cells[columnId] = { start: value };
                  } else {
                    cells[columnId] = value as CellValue;
                  }
                }
              }
              
              if (!seenPaths.has(filePath)) {
                const row: DatabaseRow = {
                  id: filePath,
                  notePath: filePath,
                  noteTitle: (frontmatter.title as string) || getTitleFromPath(filePath),
                  cells,
                  createdAt: (frontmatter.createdAt as string) || new Date().toISOString(),
                  updatedAt: (frontmatter.updatedAt as string) || new Date().toISOString(),
                };
                
                rows.push(row);
                seenPaths.add(filePath);
              }
            }
          } catch (error) {
            console.warn(`Failed to read note ${filePath}:`, error);
          }
        }
        
        return rows;
      },
      
      refreshRows: async (dbId: string) => {
        const rows = await get().loadRowsFromNotes(dbId);
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          return {
            databases: {
              ...state.databases,
              [dbId]: { ...db, rows }
            }
          };
        });
      },
      
      // ===== 数据库操作 =====
      createDatabase: async (options: CreateDatabaseOptions) => {
        // 使用数据库名称生成 ID（更有意义）
        // 闪卡数据库固定使用 flashcards，便于与 YAML db 字段对应
        const baseId = options.template === 'flashcard'
          ? 'flashcards'
          : (slugify(options.name) || generateId());
        const dbDir = getDbDir();
        
        // 确保目录存在
        const dirExists = await exists(dbDir);
        if (!dirExists) {
          await createDir(dbDir);
        }
        
        // 确保 ID 唯一
        let dbId = baseId;
        let counter = 1;
        while (await exists(`${dbDir}/${dbId}.db.json`)) {
          dbId = `${baseId}-${counter}`;
          counter++;
        }
        const rawTemplate = options.template ? DATABASE_TEMPLATES[options.template] : DATABASE_TEMPLATES.blank;
        const template = localizeTemplate(options.template, rawTemplate);
        const t = getCurrentTranslations();
        const now = new Date().toISOString();
        
        const dbWithRows: DatabaseWithRows = {
          id: dbId,
          name: options.name,
          icon: options.icon,
          description: options.description,
          columns: template.columns?.map(col => ({ ...col, id: col.id || generateId() })) || [
            { id: generateId(), name: t.database.templateContent.blank.columns.title, type: 'text' as ColumnType }
          ],
          rows: [], // 运行时为空，数据从笔记加载
          views: template.views?.map(v => ({ ...v, id: v.id || generateId() })) || [
            { id: generateId(), name: t.database.templateContent.blank.views.table, type: 'table' as const }
          ],
          activeViewId: '',
          createdAt: now,
          updatedAt: now,
        };
        
        // 设置活动视图
        dbWithRows.activeViewId = dbWithRows.views[0]?.id || '';
        
        set((state) => ({
          databases: { ...state.databases, [dbId]: dbWithRows },
          currentDbId: dbId,
        }));
        
        // 保存到文件（只保存定义，不保存 rows）
        await get().saveDatabase(dbId);
        
        return dbId;
      },
      
      deleteDatabase: async (dbId: string) => {
        // TODO: 删除文件
        set((state) => {
          const { [dbId]: _, ...rest } = state.databases;
          return {
            databases: rest,
            currentDbId: state.currentDbId === dbId ? null : state.currentDbId,
          };
        });
      },
      
      renameDatabase: (dbId: string, name: string) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: { ...db, name, updatedAt: new Date().toISOString() }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      setCurrentDb: (dbId: string | null) => {
        set({ currentDbId: dbId });
      },
      
      // ===== 列操作 =====
      addColumn: (dbId: string, column: Partial<DatabaseColumn>) => {
        const t = getCurrentTranslations();
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          const newColumn: DatabaseColumn = {
            id: generateId(),
            name: column.name || t.database.newColumn,
            type: column.type || 'text',
            ...column,
          };
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: [...db.columns, newColumn],
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      updateColumn: (dbId: string, columnId: string, updates: Partial<DatabaseColumn>) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: db.columns.map(col =>
                  col.id === columnId ? { ...col, ...updates } : col
                ),
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      deleteColumn: (dbId: string, columnId: string) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: db.columns.filter(col => col.id !== columnId),
                rows: db.rows.map(row => {
                  const { [columnId]: _, ...restCells } = row.cells;
                  return { ...row, cells: restCells };
                }),
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      reorderColumns: (dbId: string, columnIds: string[]) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          const columnMap = new Map(db.columns.map(c => [c.id, c]));
          const reordered = columnIds.map(id => columnMap.get(id)).filter(Boolean) as DatabaseColumn[];
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: reordered,
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      // ===== 行操作 (Dataview: 操作笔记 YAML) =====
      addRow: async (dbId: string, cells?: Record<string, CellValue>) => {
        const t = getCurrentTranslations();
        const vaultPath = useFileStore.getState().vaultPath;
        if (!vaultPath) throw new Error("No vault path");
        
        const db = get().databases[dbId];
        if (!db) throw new Error("Database not found");
        
        const now = new Date().toISOString();
        
        // 查找标题列（支持常见列名 + 当前语言模板名）
        const titleColumnNames = [
          t.database.templateContent.blank.columns.title,
          t.database.templateContent.task.columns.title,
          t.database.templateContent.project.columns.title,
          t.database.templateContent.reading.columns.title,
          'title',
          'name',
        ].map((name) => name.toLowerCase());
        const titleColumn = db.columns.find(c => 
          titleColumnNames.includes(c.name.toLowerCase())
        );
        
        // 获取标题值：优先从 cells 中获取，否则用默认名
        let titleValue = '';
        if (titleColumn && cells) {
          // cells 可能用列名或列 ID 作为 key
          titleValue = String(cells[titleColumn.id] || cells[titleColumn.name] || '');
        }
        
        // 如果没有标题，用数据库名 + 日期时间
        if (!titleValue) {
          const dateStr = new Date().toISOString().slice(0, 10);
          titleValue = `${db.name}-${dateStr}`;
        }
        
        // 生成安全的文件名
        const safeFileName = slugify(titleValue) || generateId();
        const basePath = `${vaultPath}/${safeFileName}`;
        const notePath = await ensureUniquePath(basePath, '.md');
        const noteName = notePath.split('/').pop()?.replace('.md', '') || safeFileName;
        
        // 构建列 ID 到列名的映射
        const idToName = new Map<string, string>();
        for (const col of db.columns) {
          idToName.set(col.id, col.name);
        }
        
        // 最终标题值（用于 frontmatter）
        const finalTitle = titleValue || noteName;
        
        // 构建 YAML 内容（使用列名）
        const yamlLines = [
          `db: ${dbId}`,
          `title: ${finalTitle}`,
          `createdAt: ${now}`,
          `updatedAt: ${now}`,
        ];
        
        if (cells) {
          for (const [columnId, value] of Object.entries(cells)) {
            const columnName = idToName.get(columnId) || columnId;
            if (!['db', 'title', 'createdAt', 'updatedAt'].includes(columnName.toLowerCase())) {
              yamlLines.push(`${columnName}: ${formatYamlValue(value)}`);
            }
          }
        }
        
        // 创建笔记文件
        const noteContent = `---
${yamlLines.join('\n')}
---

# ${finalTitle}

`;
        
        await saveFile(notePath, noteContent);
        
        // 创建新行并添加到状态
        const newRow: DatabaseRow = {
          id: notePath,
          notePath,
          noteTitle: finalTitle,
          cells: cells || {},
          createdAt: now,
          updatedAt: now,
        };
        
        set((state) => {
          const currentDb = state.databases[dbId];
          if (!currentDb) return state;
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...currentDb,
                rows: [...currentDb.rows, newRow],
              }
            }
          };
        });
        
        // 刷新文件树
        useFileStore.getState().refreshFileTree();
        
        return notePath;
      },
      
      updateCell: async (dbId: string, rowId: string, columnId: string, value: CellValue) => {
        const db = get().databases[dbId];
        if (!db) return false;
        
        const row = db.rows.find(r => r.id === rowId);
        if (!row) return false;
        
        // 找到列名（YAML 使用列名作为键）
        const column = db.columns.find(c => c.id === columnId);
        const yamlKey = column?.name || columnId;
        
        const now = new Date().toISOString();
        
        try {
          // 读取笔记内容
          const content = await readFile(row.notePath);
          
          // 更新 YAML（使用列名）
          const newContent = updateFrontmatter(content, {
            [yamlKey]: value,
            updatedAt: now,
          });
          
          // 保存笔记
          await saveFile(row.notePath, newContent);
          
          // 如果该笔记在编辑器中打开，刷新编辑器内容
          useFileStore.getState().reloadFileIfOpen(row.notePath);
          // 如果该笔记在分栏视图中打开，刷新分栏内容
          useSplitStore.getState().reloadSecondaryIfOpen(row.notePath);
          
          // 更新状态（使用列 ID）
          set((state) => {
            const currentDb = state.databases[dbId];
            if (!currentDb) return state;
            
            return {
              databases: {
                ...state.databases,
                [dbId]: {
                  ...currentDb,
                  rows: currentDb.rows.map(r =>
                    r.id === rowId
                      ? { ...r, cells: { ...r.cells, [columnId]: value }, updatedAt: now }
                      : r
                  ),
                }
              }
            };
          });
          return true;
        } catch (error) {
          console.error(`Failed to update cell in ${row.notePath}:`, error);
          return false;
        }
      },
      
      deleteRow: async (dbId: string, rowId: string) => {
        const db = get().databases[dbId];
        if (!db) return;
        
        const row = db.rows.find(r => r.id === rowId);
        if (!row) return;
        
        try {
          // 读取笔记，移除 db 字段（不删除笔记，只是解除关联）
          const content = await readFile(row.notePath);
          const newContent = updateFrontmatter(content, { db: undefined });
          await saveFile(row.notePath, newContent);
          
          // 从状态中移除
          set((state) => {
            const currentDb = state.databases[dbId];
            if (!currentDb) return state;
            
            return {
              databases: {
                ...state.databases,
                [dbId]: {
                  ...currentDb,
                  rows: currentDb.rows.filter(r => r.id !== rowId),
                }
              }
            };
          });
        } catch (error) {
          console.error(`Failed to remove row ${rowId}:`, error);
        }
      },
      
      duplicateRow: async (dbId: string, rowId: string) => {
        const vaultPath = useFileStore.getState().vaultPath;
        if (!vaultPath) throw new Error("No vault path");
        
        const db = get().databases[dbId];
        if (!db) throw new Error("Database not found");
        
        const sourceRow = db.rows.find(r => r.id === rowId);
        if (!sourceRow) throw new Error("Row not found");
        
        const now = new Date().toISOString();
        const newTitle = `${sourceRow.noteTitle} (副本)`;
        const notePath = `${vaultPath}/${newTitle.replace(/[\\/:*?"<>|]/g, '-')}.md`;
        
        // 复制笔记内容
        try {
          const originalContent = await readFile(sourceRow.notePath);
          const newContent = updateFrontmatter(originalContent, {
            title: newTitle,
            createdAt: now,
            updatedAt: now,
          });
          
          await saveFile(notePath, newContent);
          
          // 添加到状态
          const newRow: DatabaseRow = {
            id: notePath,
            notePath,
            noteTitle: newTitle,
            cells: { ...sourceRow.cells, title: newTitle },
            createdAt: now,
            updatedAt: now,
          };
          
          set((state) => {
            const currentDb = state.databases[dbId];
            if (!currentDb) return state;
            
            const sourceIndex = currentDb.rows.findIndex(r => r.id === rowId);
            const newRows = [...currentDb.rows];
            newRows.splice(sourceIndex + 1, 0, newRow);
            
            return {
              databases: {
                ...state.databases,
                [dbId]: {
                  ...currentDb,
                  rows: newRows,
                }
              }
            };
          });
          
          useFileStore.getState().refreshFileTree();
          
          return notePath;
        } catch (error) {
          console.error(`Failed to duplicate row:`, error);
          throw error;
        }
      },
      
      reorderRows: (dbId: string, rowIds: string[]) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          const rowMap = new Map(db.rows.map(r => [r.id, r]));
          const reordered = rowIds.map(id => rowMap.get(id)).filter(Boolean) as DatabaseRow[];
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                rows: reordered,
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      // ===== 视图操作 =====
      addView: (dbId: string, view: Partial<DatabaseView>) => {
        const t = getCurrentTranslations();
        const viewId = generateId();
        
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          const newView: DatabaseView = {
            id: viewId,
            name: view.name || t.database.newView,
            type: view.type || 'table',
            ...view,
          };
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                views: [...db.views, newView],
                activeViewId: viewId,
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
        
        return viewId;
      },
      
      updateView: (dbId: string, viewId: string, updates: Partial<DatabaseView>) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                views: db.views.map(v =>
                  v.id === viewId ? { ...v, ...updates } : v
                ),
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      deleteView: (dbId: string, viewId: string) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db || db.views.length <= 1) return state; // 至少保留一个视图
          
          const newViews = db.views.filter(v => v.id !== viewId);
          const activeViewId = db.activeViewId === viewId ? newViews[0].id : db.activeViewId;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                views: newViews,
                activeViewId,
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      setActiveView: (dbId: string, viewId: string) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: { ...db, activeViewId: viewId }
            }
          };
        });
      },
      
      // ===== Select 选项操作 =====
      addSelectOption: (dbId: string, columnId: string, option: Omit<SelectOption, 'id'>) => {
        const optionId = generateId();
        
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: db.columns.map(col =>
                  col.id === columnId
                    ? {
                        ...col,
                        options: [...(col.options || []), { ...option, id: optionId }]
                      }
                    : col
                ),
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
        
        return optionId;
      },
      
      updateSelectOption: (dbId: string, columnId: string, optionId: string, updates: Partial<SelectOption>) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: db.columns.map(col =>
                  col.id === columnId
                    ? {
                        ...col,
                        options: col.options?.map(opt =>
                          opt.id === optionId ? { ...opt, ...updates } : opt
                        )
                      }
                    : col
                ),
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      deleteSelectOption: (dbId: string, columnId: string, optionId: string) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: db.columns.map(col =>
                  col.id === columnId
                    ? {
                        ...col,
                        options: col.options?.filter(opt => opt.id !== optionId)
                      }
                    : col
                ),
                // 同时清除行中使用该选项的值
                rows: db.rows.map(row => {
                  const cellValue = row.cells[columnId];
                  if (cellValue === optionId) {
                    const { [columnId]: _, ...restCells } = row.cells;
                    return { ...row, cells: restCells };
                  }
                  if (Array.isArray(cellValue)) {
                    return {
                      ...row,
                      cells: {
                        ...row.cells,
                        [columnId]: cellValue.filter(v => v !== optionId)
                      }
                    };
                  }
                  return row;
                }),
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      // ===== 编辑状态 =====
      setEditingCell: (cell) => {
        set({ editingCell: cell });
      },
      
      // ===== 排序和筛选 =====
      setSorts: (dbId: string, viewId: string, sorts: SortRule[]) => {
        get().updateView(dbId, viewId, { sorts });
      },
      
      setFilters: (dbId: string, viewId: string, filters: FilterGroup | undefined) => {
        get().updateView(dbId, viewId, { filters });
      },
      
      // ===== 获取处理后的数据 =====
      getFilteredSortedRows: (dbId: string) => {
        const db = get().databases[dbId];
        if (!db) return [];
        
        const view = db.views.find(v => v.id === db.activeViewId);
        if (!view) return db.rows;
        
        let rows = [...db.rows];
        
        // 应用筛选
        if (view.filters && view.filters.rules.length > 0) {
          rows = applyFilters(rows, view.filters, db.columns);
        }
        
        // 应用排序
        if (view.sorts && view.sorts.length > 0) {
          rows = applySorts(rows, view.sorts, db.columns);
        }
        
        return rows;
      },
    }),
    {
      name: "lumina-database-store",
      partialize: (state) => ({
        // 只持久化当前数据库 ID，数据库内容存在文件中
        currentDbId: state.currentDbId,
      }),
    }
  )
);

// ==================== 筛选/排序辅助函数 ====================

function applySorts(rows: DatabaseRow[], sorts: SortRule[], columns: DatabaseColumn[]): DatabaseRow[] {
  return [...rows].sort((a, b) => {
    for (const sort of sorts) {
      const column = columns.find(c => c.id === sort.columnId);
      if (!column) continue;
      
      const aValue = a.cells[sort.columnId];
      const bValue = b.cells[sort.columnId];
      
      let comparison = 0;
      
      if (aValue === null || aValue === undefined) {
        comparison = 1;
      } else if (bValue === null || bValue === undefined) {
        comparison = -1;
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
        comparison = (aValue ? 1 : 0) - (bValue ? 1 : 0);
      }
      
      if (comparison !== 0) {
        return sort.direction === 'desc' ? -comparison : comparison;
      }
    }
    return 0;
  });
}
