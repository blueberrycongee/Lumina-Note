/**
 * AI 制卡工具
 * 
 * 从笔记内容自动生成闪卡
 */

import { ToolExecutor, ToolResult, ToolContext } from '../../types';
import { FlashcardType, Flashcard } from '../../../types/flashcard';
import { generateCardMarkdown, generateCardFilename } from '@/services/flashcard/flashcard';
import { INITIAL_SM2_STATE } from '@/services/flashcard/sm2';
import { writeFile, exists, createDir } from '@/lib/tauri';
import { resolve } from '@/lib/path';
import { useFileStore } from '@/stores/useFileStore';
import { toolMsg } from './messages';

export const GenerateFlashcardsTool: ToolExecutor = {
  name: 'generate_flashcards',
  requiresApproval: true,

  async execute(
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> {
    const {
      content,
      source_note,
      deck = 'Default',
      types = ['basic', 'cloze'],
      count = 5,
      language = 'zh',
    } = params as {
      content: string;
      source_note?: string;
      deck?: string;
      types?: FlashcardType[];
      count?: number;
      language?: string;
    };

    if (!content) {
      return {
        success: false,
        content: '',
        error: `${toolMsg.invalidParams()}: content required`,
      };
    }

    // 构建 AI 提示词
    const prompt = buildGenerationPrompt(content, types, count, language);
    
    // 这里返回提示词，让 Agent 继续处理
    // 实际的卡片生成由 Agent 的 LLM 完成
    return {
      success: true,
      content: `请根据以下内容生成 ${count} 张闪卡：

## 源内容
${content}

## 生成要求
${prompt}

## 输出格式
请为每张卡片调用 create_flashcard 工具，参数如下：
- deck: "${deck}"
- source: "${source_note || ''}"
- type: 卡片类型 (${types.join('/')})
- 以及对应类型的内容字段

生成完成后，使用 attempt_completion 报告结果。`,
    };
  },
};

/**
 * 构建生成提示词
 */
function buildGenerationPrompt(
  _content: string,
  types: FlashcardType[],
  count: number,
  language: string
): string {
  const typeInstructions: Record<FlashcardType, string> = {
    basic: `
**问答卡 (basic)**：
- front: 简洁的问题
- back: 准确的答案
- 适合：概念定义、事实记忆`,
    
    'basic-reversed': `
**双向卡 (basic-reversed)**：
- front: 术语/单词
- back: 定义/翻译
- 会自动生成反向卡片`,
    
    cloze: `
**填空卡 (cloze)**：
- text: 包含 {{c1::答案}} 格式的句子
- 支持多个填空：{{c1::第一个}}, {{c2::第二个}}
- 适合：公式、代码、关键句`,
    
    mcq: `
**选择题 (mcq)**：
- question: 问题
- options: 4个选项数组
- answer: 正确答案索引 (0-3)
- 适合：辨析易混淆概念`,
    
    list: `
**列表题 (list)**：
- question: 问题
- items: 正确顺序的列表
- ordered: 是否需要按顺序
- 适合：步骤、流程、枚举`,
  };

  const selectedInstructions = types
    .map(t => typeInstructions[t])
    .join('\n');

  return `
生成 ${count} 张高质量闪卡，遵循以下原则：

1. **原子化**：每张卡片只测试一个知识点
2. **清晰**：问题明确，答案简洁
3. **实用**：关注核心概念，避免琐碎细节
4. **多样**：混合使用不同卡片类型

可用的卡片类型：
${selectedInstructions}

语言：${language === 'zh' ? '中文' : 'English'}
`;
}

// ==================== 创建单张卡片的工具 ====================

export const CreateFlashcardTool: ToolExecutor = {
  name: 'create_flashcard',
  requiresApproval: false,

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const {
      type = 'basic',
      deck = 'Default',
      source,
      front,
      back,
      text,
      question,
      options,
      answer,
      items,
      ordered,
      explanation,
    } = params as Partial<Flashcard> & { type: FlashcardType };

    // 验证必需字段
    if (type === 'basic' || type === 'basic-reversed') {
      if (!front || !back) {
        return {
          success: false,
          content: '',
          error: `${toolMsg.invalidParams()}: basic card needs front and back`,
        };
      }
    } else if (type === 'cloze') {
      if (!text) {
        return {
          success: false,
          content: '',
          error: `${toolMsg.invalidParams()}: cloze card needs text with {{c1::answer}}`,
        };
      }
    } else if (type === 'mcq') {
      if (!question || !options || answer === undefined) {
        return {
          success: false,
          content: '',
          error: `${toolMsg.invalidParams()}: mcq card needs question, options, answer`,
        };
      }
    } else if (type === 'list') {
      if (!question || !items) {
        return {
          success: false,
          content: '',
          error: `${toolMsg.invalidParams()}: list card needs question and items`,
        };
      }
    }

    // 构建卡片数据
    const card: Partial<Flashcard> = {
      ...INITIAL_SM2_STATE,
      type,
      deck,
      source,
      front,
      back,
      text,
      question,
      options: options as string[],
      answer: answer as number,
      items: items as string[],
      ordered: ordered as boolean,
      explanation: explanation as string,
      created: new Date().toISOString().split('T')[0],
    };

    // 生成文件名和内容
    const filename = generateCardFilename(card);
    const folder = 'Flashcards';
    const notePath = `${folder}/${filename}`;
    const content = generateCardMarkdown(card);

    // 使用 Tauri API 创建文件
    try {
      const workspacePath = context.workspacePath;
      
      if (!workspacePath || workspacePath === '') {
        return {
          success: false,
          content: '',
          error: `${toolMsg.failed()}: workspace path not found`,
        };
      }
      
      console.log('[CreateFlashcard] workspacePath:', workspacePath);
      
      const folderPath = resolve(workspacePath, folder);
      const filePath = resolve(workspacePath, notePath);
      
      console.log('[CreateFlashcard] Creating file:', filePath);
      
      // 确保目录存在
      if (!(await exists(folderPath))) {
        await createDir(folderPath, { recursive: true });
        console.log('[CreateFlashcard] Created folder:', folderPath);
      }
      
      // 创建文件
      await writeFile(filePath, content);
      console.log('[CreateFlashcard] File created successfully');

      // 延迟刷新文件树
      setTimeout(() => {
        useFileStore.getState().refreshFileTree();
      }, 100);

      return {
        success: true,
        content: `${toolMsg.flashcard.created()}: ${notePath}

Type: ${type}
Deck: ${deck}
${type === 'basic' || type === 'basic-reversed' ? `Question: ${front}` : ''}
${type === 'cloze' ? `Content: ${text?.slice(0, 50)}...` : ''}
${type === 'mcq' ? `Question: ${question}` : ''}
${type === 'list' ? `Question: ${question}` : ''}`,
      };
    } catch (error) {
      console.error('[CreateFlashcard] Error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: '',
        error: `${toolMsg.failed()}: ${errorMessage || 'unknown error'}`,
      };
    }
  },
};
