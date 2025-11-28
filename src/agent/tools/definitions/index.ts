/**
 * 工具定义汇总
 */

import { ToolDefinition } from "../../types";

// ============ read_note ============

export const readNoteDefinition: ToolDefinition = {
  name: "read_note",
  description: "读取一个或多个笔记文件的内容",
  parameters: [
    {
      name: "paths",
      type: "array",
      required: true,
      description: "要读取的笔记路径列表，相对于笔记库根目录",
    },
  ],
  definition: `## read_note
描述: 读取一个或多个笔记文件的内容。返回带行号的内容，便于后续编辑时定位。

参数:
- paths: (必需) 要读取的笔记路径列表，相对于笔记库根目录，JSON 数组格式

用法:
<read_note>
<paths>["notes/daily/2024-01-15.md", "notes/projects/idea.md"]</paths>
</read_note>

注意:
- 可以一次读取多个文件
- 返回内容带行号，格式如 "1 | # 标题"
- 如果文件不存在会返回错误信息
- 路径必须是相对于笔记库根目录的相对路径`,
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

// ============ write_note ============

export const writeNoteDefinition: ToolDefinition = {
  name: "write_note",
  description: "创建新笔记或完全覆盖现有笔记",
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
  definition: `## write_note
描述: 创建新笔记或完全覆盖现有笔记的内容。

参数:
- path: (必需) 笔记路径，相对于笔记库根目录
- content: (必需) 完整的笔记内容

用法:
<write_note>
<path>notes/new-note.md</path>
<content># 新笔记标题

这是笔记内容。

## 章节一

更多内容...</content>
</write_note>

注意:
- 如果文件已存在，将完全覆盖
- 会自动创建不存在的父目录
- 适合创建新文件或完全重写文件
- 对于部分修改，请使用 edit_note`,
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

// ============ move_note ============

export const moveNoteDefinition: ToolDefinition = {
  name: "move_note",
  description: "移动或重命名笔记文件",
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
  definition: `## move_note
描述: 移动或重命名笔记文件。

参数:
- from: (必需) 源文件路径，相对于笔记库根目录
- to: (必需) 目标文件路径，相对于笔记库根目录

用法:
<move_note>
<from>notes/inbox/idea.md</from>
<to>notes/projects/new-project.md</to>
</move_note>

注意:
- 会自动创建目标目录（如果不存在）
- 如果目标文件已存在，操作将失败
- 可用于重命名文件（在同一目录内移动）`,
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

// ============ 导出所有定义 ============

export function getAllToolDefinitions(): ToolDefinition[] {
  return [
    readNoteDefinition,
    editNoteDefinition,
    writeNoteDefinition,
    listNotesDefinition,
    moveNoteDefinition,
    searchNotesDefinition,
    attemptCompletionDefinition,
  ];
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return getAllToolDefinitions().find((t) => t.name === name);
}
