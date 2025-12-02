/**
 * 工具定义汇总
 */

import { ToolDefinition } from "../../types";

// ============ read_note ============

export const readNoteDefinition: ToolDefinition = {
  name: "read_note",
  description: "读取笔记文件的内容",
  parameters: [
    {
      name: "path",
      type: "string",
      required: true,
      description: "要读取的笔记路径，相对于笔记库根目录",
    },
  ],
  definition: `## read_note
描述: 读取笔记文件的内容。返回带行号的内容，便于后续编辑时定位。

参数:
- path: (必需) 笔记路径，相对于笔记库根目录

用法:
<read_note>
<path>notes/daily/2024-01-15.md</path>
</read_note>

读取多个文件时，分别调用即可。

返回格式:
- 每行带行号，如 "1 | # 标题"
- 如果文件不存在会返回错误信息`,
};

// ============ edit_note ============

export const editNoteDefinition: ToolDefinition = {
  name: "edit_note",
  description: "对笔记进行精确的查找替换修改",
  parameters: [
    {
      name: "path",
      type: "string",
      required: true,
      description: "要编辑的笔记路径",
    },
    {
      name: "edits",
      type: "array",
      required: true,
      description: "编辑操作数组，每个操作包含 search 和 replace",
    },
  ],
  definition: `## edit_note
描述: 对笔记进行精确的查找替换修改。使用 SEARCH/REPLACE 方式。

参数:
- path: (必需) 要编辑的笔记路径，相对于笔记库根目录
- edits: (必需) 编辑操作数组，JSON 格式，每个操作包含:
  - search: 要查找的原始内容 (必须与文件内容完全匹配)
  - replace: 替换后的新内容

用法:
<edit_note>
<path>notes/daily/2024-01-15.md</path>
<edits>[
  {
    "search": "## 待办事项\\n- [ ] 任务1",
    "replace": "## 待办事项\\n- [x] 任务1"
  }
]</edits>
</edit_note>

重要:
- search 内容必须与文件中的内容完全一致（包括换行和空格）
- 可以进行多处修改，按顺序应用
- 修改前请先用 read_note 确认当前内容
- 如果 search 内容找不到，修改将失败`,
};

// ============ create_note ============

export const createNoteDefinition: ToolDefinition = {
  name: "create_note",
  description: "创建新的笔记文件",
  parameters: [
    {
      name: "path",
      type: "string",
      required: true,
      description: "笔记路径",
    },
    {
      name: "content",
      type: "string",
      required: true,
      description: "笔记内容",
    },
  ],
  definition: `## create_note
描述: 创建新的笔记文件。仅用于创建不存在的文件。

参数:
- path: (必需) 笔记路径，相对于笔记库根目录
- content: (必需) 完整的笔记内容

用法:
<create_note>
<path>notes/new-note.md</path>
<content># 新笔记标题

这是笔记内容。

## 章节一

更多内容...</content>
</create_note>

重要:
- 仅用于创建新文件
- 会自动创建不存在的父目录
- 修改现有文件必须使用 edit_note，不要用 create_note 覆盖
- 如果你想修改文件，请用 edit_note 的 search/replace 方式`,
};

// ============ list_notes ============

export const listNotesDefinition: ToolDefinition = {
  name: "list_notes",
  description: "列出指定目录下的笔记文件",
  parameters: [
    {
      name: "directory",
      type: "string",
      required: false,
      description: "要列出的目录路径，默认为根目录",
    },
    {
      name: "recursive",
      type: "boolean",
      required: false,
      description: "是否递归列出子目录，默认 true",
    },
  ],
  definition: `## list_notes
描述: 列出指定目录下的笔记文件和子目录。

参数:
- directory: (可选) 目录路径，相对于笔记库根目录，默认为根目录
- recursive: (可选) 是否递归列出子目录内容，默认 true

用法:
<list_notes>
<directory>notes/daily</directory>
<recursive>true</recursive>
</list_notes>

返回格式:
- 文件列表，包含文件名和修改时间
- 子目录会以 "/" 结尾
- 按字母顺序排列`,
};

// ============ create_folder ============

export const createFolderDefinition: ToolDefinition = {
  name: "create_folder",
  description: "创建新目录",
  parameters: [
    {
      name: "path",
      type: "string",
      required: true,
      description: "要创建的目录路径",
    },
  ],
  definition: `## create_folder
描述: 创建新的目录文件夹。

参数:
- path: (必需) 目录路径，相对于笔记库根目录

用法:
<create_folder>
<path>notes/new-category</path>
</create_folder>

注意:
- 如果父目录不存在，会自动递归创建
- 如果目录已存在，会返回错误`,
};

// ============ move_file ============

export const moveFileDefinition: ToolDefinition = {
  name: "move_file",
  description: "移动文件或笔记到新目录",
  parameters: [
    {
      name: "from",
      type: "string",
      required: true,
      description: "源文件路径",
    },
    {
      name: "to",
      type: "string",
      required: true,
      description: "目标文件路径",
    },
  ],
  definition: `## move_file
描述: 移动文件或笔记到新目录。

参数:
- from: (必需) 源文件路径，相对于笔记库根目录
- to: (必需) 目标文件路径，相对于笔记库根目录

用法:
<move_file>
<from>notes/inbox/idea.md</from>
<to>notes/projects/new-project.md</to>
</move_file>

注意:
- 会自动创建目标目录（如果不存在）
- 如果目标文件已存在，操作将失败
- 仅用于移动文件位置，如需重命名请使用 rename_file`,
};

// ============ rename_file ============

export const renameFileDefinition: ToolDefinition = {
  name: "rename_file",
  description: "重命名文件、笔记或文件夹",
  parameters: [
    {
      name: "path",
      type: "string",
      required: true,
      description: "原文件/文件夹路径",
    },
    {
      name: "new_name",
      type: "string",
      required: true,
      description: "新名称（不含路径）",
    },
  ],
  definition: `## rename_file
描述: 重命名文件、笔记或文件夹（在同一目录下）。

参数:
- path: (必需) 原文件或文件夹路径，相对于笔记库根目录
- new_name: (必需) 新名称，不包含路径

用法:
<rename_file>
<path>notes/old-name.md</path>
<new_name>new-name.md</new_name>
</rename_file>

注意:
- 仅修改名称，不改变目录
- 如果新名称已存在，操作将失败`,
};

// ============ search_notes ============

export const searchNotesDefinition: ToolDefinition = {
  name: "search_notes",
  description: "语义搜索笔记库，基于内容相似性找到相关笔记",
  parameters: [
    {
      name: "query",
      type: "string",
      required: true,
      description: "搜索查询，用自然语言描述要找的内容",
    },
    {
      name: "directory",
      type: "string",
      required: false,
      description: "限定搜索范围的目录",
    },
    {
      name: "limit",
      type: "number",
      required: false,
      description: "返回结果数量，默认 10",
    },
  ],
  definition: `## search_notes
描述: 语义搜索笔记库。基于内容相似性找到相关笔记，而不是简单的关键词匹配。

参数:
- query: (必需) 搜索查询，用自然语言描述你要找的内容
- directory: (可选) 限定搜索范围的目录路径
- limit: (可选) 返回结果数量，默认 10

用法:
<search_notes>
<query>机器学习的反向传播算法</query>
<directory>notes/tech</directory>
<limit>5</limit>
</search_notes>

返回:
- 相关笔记列表，包含路径、相关度分数、相关片段
- 结果按相关度从高到低排序

适用场景:
- 查找与某个主题相关的笔记
- 发现笔记间的关联
- 基于描述找到具体内容`,
};

// ============ attempt_completion ============

export const attemptCompletionDefinition: ToolDefinition = {
  name: "attempt_completion",
  description: "标记任务完成并提供结果总结",
  parameters: [
    {
      name: "result",
      type: "string",
      required: true,
      description: "任务完成的结果描述",
    },
  ],
  definition: `## attempt_completion
描述: 当任务完成时调用此工具。用于向用户报告任务结果。

参数:
- result: (必需) 任务完成的结果描述，简洁说明做了什么

用法:
<attempt_completion>
<result>已完成以下操作：
1. 读取了 daily/2024-01-15.md
2. 修改了待办事项状态
3. 添加了新的笔记内容</result>
</attempt_completion>

重要:
- 只有在任务真正完成后才使用此工具
- result 应该是用户友好的总结
- 调用此工具后，Agent 循环将结束`,
};

// ============ delete_note ============

export const deleteNoteDefinition: ToolDefinition = {
  name: "delete_note",
  description: "删除指定的笔记文件",
  parameters: [
    {
      name: "path",
      type: "string",
      required: true,
      description: "要删除的笔记路径，相对于笔记库根目录",
    },
  ],
  definition: `## delete_note
描述: 永久删除指定的笔记文件。此操作不可撤销！

参数:
- path: (必需) 要删除的笔记路径，相对于笔记库根目录

用法:
<delete_note>
<path>notes/old-note.md</path>
</delete_note>

警告:
- 删除操作不可撤销
- 删除前请确认这是用户想要的
- 如果文件不存在会返回错误`,
};

// ============ grep_search ============

export const grepSearchDefinition: ToolDefinition = {
  name: "grep_search",
  description: "全文搜索笔记库，支持正则表达式",
  parameters: [
    {
      name: "query",
      type: "string",
      required: true,
      description: "搜索关键词或正则表达式",
    },
    {
      name: "directory",
      type: "string",
      required: false,
      description: "限定搜索范围的目录路径",
    },
    {
      name: "regex",
      type: "boolean",
      required: false,
      description: "是否启用正则表达式模式，默认 false",
    },
    {
      name: "case_sensitive",
      type: "boolean",
      required: false,
      description: "是否区分大小写，默认 false",
    },
    {
      name: "limit",
      type: "number",
      required: false,
      description: "返回结果数量上限，默认 50",
    },
  ],
  definition: `## grep_search
描述: 在笔记库中进行全文搜索，支持正则表达式。比 search_notes 更适合精确匹配。

参数:
- query: (必需) 搜索关键词或正则表达式
- directory: (可选) 限定搜索范围的目录路径
- regex: (可选) 是否启用正则表达式模式，默认 false
- case_sensitive: (可选) 是否区分大小写，默认 false
- limit: (可选) 返回结果数量上限，默认 50

用法:
<grep_search>
<query>TODO|FIXME</query>
<regex>true</regex>
<directory>notes/projects</directory>
</grep_search>

返回:
- 匹配的文件路径、行号和内容
- 按匹配顺序排列

适用场景:
- 查找特定关键词
- 使用正则表达式搜索模式
- 比语义搜索更精确的文本匹配`,
};

// ============ semantic_search ============

export const semanticSearchDefinition: ToolDefinition = {
  name: "semantic_search",
  description: "语义搜索笔记库，基于内容含义找到相关笔记",
  parameters: [
    {
      name: "query",
      type: "string",
      required: true,
      description: "搜索查询，用自然语言描述要找的内容",
    },
    {
      name: "directory",
      type: "string",
      required: false,
      description: "限定搜索范围的目录",
    },
    {
      name: "limit",
      type: "number",
      required: false,
      description: "返回结果数量，默认 10",
    },
    {
      name: "min_score",
      type: "number",
      required: false,
      description: "最低相似度分数 (0-1)，默认 0.3",
    },
  ],
  definition: `## semantic_search
描述: 使用 AI 嵌入进行语义搜索。理解查询含义，找到语义相关的内容。

参数:
- query: (必需) 自然语言查询，描述你想找的内容
- directory: (可选) 限定搜索范围的目录路径
- limit: (可选) 返回结果数量，默认 10
- min_score: (可选) 最低相似度分数 (0-1)，默认 0.3

用法:
<semantic_search>
<query>关于时间管理的技巧和方法</query>
<limit>5</limit>
<min_score>0.5</min_score>
</semantic_search>

返回:
- 相关笔记列表，包含路径、相似度、相关片段
- 结果按相似度从高到低排序

注意:
- 需要先在设置中配置 embedding API 并建立索引
- 与 grep_search 不同，这是基于语义而非关键词的搜索
- 适合模糊查询、概念搜索`,
};

// ============ query_database ============

export const queryDatabaseDefinition: ToolDefinition = {
  name: "query_database",
  description: "查询数据库结构和行数据",
  parameters: [
    {
      name: "database_id",
      type: "string",
      required: true,
      description: "数据库 ID",
    },
    {
      name: "filter_column",
      type: "string",
      required: false,
      description: "过滤列名",
    },
    {
      name: "filter_value",
      type: "string",
      required: false,
      description: "过滤值（模糊匹配）",
    },
    {
      name: "limit",
      type: "number",
      required: false,
      description: "返回行数上限，默认 20",
    },
  ],
  definition: `## query_database
描述: 查询数据库的列结构和行数据。会返回所有列名、类型和可选值。

参数:
- database_id: (必需) 数据库 ID
- filter_column: (可选) 按列名过滤
- filter_value: (可选) 过滤值（模糊匹配）
- limit: (可选) 返回行数上限，默认 20

用法:
<query_database>
<database_id>阅读</database_id>
</query_database>

返回示例:
数据库: **阅读** (ID: 阅读)

## 列结构
- **书名** (text)
- **作者** (text)
- **状态** (select): 可选值 [想读, 在读, 已读]
- **开始阅读** (date)

## 数据
| 书名 | 作者 | 状态 | 开始阅读 |
| --- | --- | --- | --- |
| 三体 | 刘慈欣 | 已读 | 2025-01-01 |

重要:
- 添加行前必须先用此工具查看列结构
- 列名必须完全匹配（如"开始阅读"而不是"开始阅读日期"）
- select/multi-select 列必须使用显示的可选值`,
};

// ============ add_database_row ============

export const addDatabaseRowDefinition: ToolDefinition = {
  name: "add_database_row",
  description: "向数据库添加新行（创建笔记）",
  parameters: [
    {
      name: "database_id",
      type: "string",
      required: true,
      description: "数据库 ID",
    },
    {
      name: "cells",
      type: "object",
      required: false,
      description: "单元格值，键为列名，值为对应内容",
    },
  ],
  definition: `## add_database_row
描述: 向数据库添加新行。这会创建一个新笔记，并在其 frontmatter 中设置数据。

参数:
- database_id: (必需) 数据库 ID
- cells: (可选) 单元格值，JSON 对象格式，键为列名

## 使用步骤（必须遵循）

1. **先用 query_database 查看数据库内容**（检查是否已存在相同记录）:
<query_database>
<database_id>阅读笔记</database_id>
</query_database>

2. **检查查询结果**:
   - 如果已存在相同记录（如同名书籍），告知用户而不是重复添加
   - 仔细阅读返回的"列结构"，了解每列的名称和可选值

3. **根据列结构添加新行**:
<add_database_row>
<database_id>阅读笔记</database_id>
<cells>{"书名": "百年孤独", "作者": "加西亚·马尔克斯", "状态": "在读", "开始阅读": "2024-12-03"}</cells>
</add_database_row>

## 重要规则

1. **列名必须使用 query_database 返回的精确名称**
   - 查看返回的"## 列结构"部分
   - 使用完全一致的列名

2. **select/multi-select 使用返回的可选值名称**
   - 查看"可选值 [...]"中的选项
   - 直接使用显示的选项名（系统会自动转换为 ID）
   
3. **date 列使用 YYYY-MM-DD 格式**

4. **禁止重复添加**: 如果数据中已存在相同记录，不要再添加`,
};

// ============ get_backlinks ============

export const getBacklinksDefinition: ToolDefinition = {
  name: "get_backlinks",
  description: "获取笔记的反向链接",
  parameters: [
    {
      name: "note_name",
      type: "string",
      required: true,
      description: "笔记名称（不含 .md 后缀）",
    },
    {
      name: "include_context",
      type: "boolean",
      required: false,
      description: "是否包含链接所在的上下文内容，默认 true",
    },
  ],
  definition: `## get_backlinks
描述: 获取链接到指定笔记的所有笔记（反向链接）。

参数:
- note_name: (必需) 笔记名称（不含 .md 后缀）
- include_context: (可选) 是否显示链接上下文，默认 true

用法:
<get_backlinks>
<note_name>项目计划</note_name>
<include_context>true</include_context>
</get_backlinks>

返回:
- 反向链接列表
- 每个链接的来源笔记、行号
- 包含链接的上下文行（如果启用）

适用场景:
- 了解笔记间的关系
- 发现知识网络
- 评估笔记的重要性`,
};

// ============ ask_user ============

export const askUserDefinition: ToolDefinition = {
  name: "ask_user",
  description: "向用户提问并等待回复",
  parameters: [
    {
      name: "question",
      type: "string",
      required: true,
      description: "要问用户的问题",
    },
    {
      name: "options",
      type: "array",
      required: false,
      description: "可选的选项列表",
    },
  ],
  definition: `## ask_user
描述: 当需要用户确认或提供更多信息时使用。Agent 会暂停等待用户回复。

参数:
- question: (必需) 要问用户的问题
- options: (可选) 提供选项供用户选择

用法:
<ask_user>
<question>你想删除这个笔记还是归档它？</question>
<options>["删除", "归档到 archive 目录", "取消操作"]</options>
</ask_user>

行为:
- 调用后 Agent 会暂停
- 等待用户在聊天中回复
- 用户回复后继续执行

适用场景:
- 需要用户确认危险操作
- 需要用户澄清需求
- 提供多个选择让用户决定`,
};

// ============ 导出所有定义 ============

export function getAllToolDefinitions(): ToolDefinition[] {
  return [
    readNoteDefinition,
    editNoteDefinition,
    createNoteDefinition,
    listNotesDefinition,
    createFolderDefinition,
    moveFileDefinition,
    renameFileDefinition,
    searchNotesDefinition,
    attemptCompletionDefinition,
    deleteNoteDefinition,
    grepSearchDefinition,
    semanticSearchDefinition,
    queryDatabaseDefinition,
    addDatabaseRowDefinition,
    getBacklinksDefinition,
    askUserDefinition,
  ];
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return getAllToolDefinitions().find((t) => t.name === name);
}
