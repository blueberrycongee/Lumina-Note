/**
 * Agent 评估测试用例
 * 从 YAML 转换为 TypeScript，便于前端使用
 */

export interface TestCase {
  id: string;
  name: string;
  category: 'basic' | 'complex' | 'edge-case';
  input: string;
  expectedTools?: string[];
  expectedPlanSteps?: number;
  evaluationCriteria?: string[];
  maxLoopIterations?: number;
}

// ============ 基础测试用例 ============
// 与 tests/agent-eval/fixtures/test-vault/ 中的测试数据对应

export const basicTestCases: TestCase[] = [
  // 读取类
  {
    id: 'basic_read_001',
    name: '读取日记',
    category: 'basic',
    input: '帮我看一下 daily/2024-12-15.md 的内容',
    expectedTools: ['read'],
  },
  {
    id: 'basic_read_002',
    name: '读取项目笔记大纲',
    category: 'basic',
    input: '给我看一下 projects/lumina-note.md 的结构',
    expectedTools: ['read'],
  },

  // 搜索类
  {
    id: 'basic_search_001',
    name: '搜索 React 相关笔记',
    category: 'basic',
    input: '帮我找一下包含 React 的笔记',
    expectedTools: ['grep'],
  },
  {
    id: 'basic_search_002',
    name: '列出笔记库文件',
    category: 'basic',
    input: '看看笔记库里有什么文件',
    expectedTools: ['list'],
  },
  {
    id: 'basic_search_003',
    name: '搜索 TODO 项',
    category: 'basic',
    input: '搜索所有包含 TODO 的内容',
    expectedTools: ['grep'],
  },
  {
    id: 'basic_search_004',
    name: '搜索 Rust 学习笔记',
    category: 'basic',
    input: '找一下关于 Rust 所有权的笔记',
    expectedTools: ['grep'],
  },

  // 创建类
  {
    id: 'basic_create_001',
    name: '创建新笔记',
    category: 'basic',
    input: '创建一个新笔记叫做 test-new-note.md，内容是"这是测试笔记"',
    expectedTools: ['write'],
  },
  {
    id: 'basic_create_002',
    name: '创建今日日记',
    category: 'basic',
    input: '在 daily 文件夹创建今天的日记，标题是"2024-12-17 周二"',
    expectedTools: ['write'],
  },

  // 编辑类
  {
    id: 'basic_edit_001',
    name: '添加内容到日记',
    category: 'basic',
    input: '在 daily/2024-12-15.md 的"今日计划"下面添加一个新的 TODO: 测试 Agent',
    expectedTools: ['read', 'edit'],
  },
  {
    id: 'basic_edit_002',
    name: '标记任务完成',
    category: 'basic',
    input: '把 daily/2024-12-15.md 里的"TODO: 完成 Agent 评估系统开发"改成 DONE',
    expectedTools: ['read', 'edit'],
  },

  // 组织类
  {
    id: 'basic_organize_001',
    name: '移动笔记到归档',
    category: 'basic',
    input: '把 notes/meeting-template.md 移到 archive 文件夹',
    expectedTools: ['bash'],
  },

  // 简单聊天
  {
    id: 'basic_chat_001',
    name: '简单问候',
    category: 'basic',
    input: '你好',
    expectedTools: [],
  },
];

// ============ 复杂测试用例 ============

export const complexTestCases: TestCase[] = [
  {
    id: 'complex_001',
    name: '汇总所有 TODO',
    category: 'complex',
    input: '找出笔记库中所有的 TODO 待办事项，按文件分组列出来',
    expectedTools: ['grep', 'read'],
    expectedPlanSteps: 3,
    evaluationCriteria: [
      '找到所有 TODO 项',
      '包含 daily/ 和 projects/ 中的 TODO',
      '按文件分组展示',
    ],
  },
  {
    id: 'complex_002',
    name: '总结项目进度',
    category: 'complex',
    input: '阅读 projects 文件夹下的所有笔记，总结一下各个项目的进度',
    expectedTools: ['list', 'read'],
    expectedPlanSteps: 4,
    evaluationCriteria: [
      '读取了所有项目笔记',
      '识别出 Lumina Note 和 Agent 评估两个项目',
      '总结了完成/进行中/计划中的状态',
    ],
  },
  {
    id: 'complex_003',
    name: '创建周报',
    category: 'complex',
    input: '根据 daily/2024-12-15.md 和 daily/2024-12-16.md 的内容，创建一个周报总结 weekly-report.md',
    expectedTools: ['read', 'write'],
    expectedPlanSteps: 4,
    evaluationCriteria: [
      '读取了两天的日记',
      '提取了关键工作内容',
      '生成了结构清晰的周报',
    ],
  },
  {
    id: 'complex_004',
    name: '整理学习笔记',
    category: 'complex',
    input: '看看 notes 文件夹下有哪些学习笔记，给我一个学习路线图',
    expectedTools: ['list', 'read'],
    expectedPlanSteps: 3,
    evaluationCriteria: [
      '识别出 React、Rust、LLM Agent 相关笔记',
      '理解了笔记内容',
      '给出了合理的学习路线建议',
    ],
  },
  {
    id: 'complex_005',
    name: '批量标记完成',
    category: 'complex',
    input: '把 daily/2024-12-15.md 里所有的 TODO 都改成 DONE',
    expectedTools: ['read', 'edit'],
    expectedPlanSteps: 3,
    maxLoopIterations: 10,
    evaluationCriteria: [
      '找到所有 TODO 标记',
      '正确替换为 DONE',
      '保持其他内容不变',
    ],
  },
];

// ============ 边界测试用例 ============

export const edgeCaseTestCases: TestCase[] = [
  {
    id: 'edge_001',
    name: '不存在的文件',
    category: 'edge-case',
    input: '读取 not-exist-file-12345.md 的内容',
    expectedTools: ['read'],
    evaluationCriteria: ['优雅地报告文件不存在'],
  },
  {
    id: 'edge_002',
    name: '模糊请求',
    category: 'edge-case',
    input: '帮我改一下那个文件',
    expectedTools: [],
    evaluationCriteria: ['询问用户澄清具体是哪个文件'],
  },
  {
    id: 'edge_003',
    name: '不支持的操作',
    category: 'edge-case',
    input: '帮我发送邮件给张三',
    expectedTools: [],
    evaluationCriteria: ['告知用户该操作不支持'],
  },
  {
    id: 'edge_004',
    name: '空文件夹',
    category: 'edge-case',
    input: '列出 empty-folder 文件夹的内容',
    expectedTools: ['list'],
    evaluationCriteria: ['正确处理空结果'],
  },
  {
    id: 'edge_005',
    name: '特殊字符路径',
    category: 'edge-case',
    input: '读取 notes/react-notes.md',
    expectedTools: ['read'],
    evaluationCriteria: ['正确处理包含特殊字符的路径'],
  },
];

// 所有测试用例
export const allTestCases: TestCase[] = [
  ...basicTestCases,
  ...complexTestCases,
  ...edgeCaseTestCases,
];

// 按类别获取
export function getTestCasesByCategory(category: string): TestCase[] {
  return allTestCases.filter(tc => tc.category === category);
}
