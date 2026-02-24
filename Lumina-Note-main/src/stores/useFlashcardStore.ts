/**
 * Flashcard Store - 闪卡状态管理
 * 
 * 管理卡片数据、复习会话、牌组统计
 */

import { create } from 'zustand';
import { 
  Flashcard, 
  Deck, 
  ReviewSession, 
  ReviewRating,
  FlashcardType 
} from '../types/flashcard';
import { calculateNextReview, isDue, calculateDeckStats, INITIAL_SM2_STATE } from '@/services/flashcard/sm2';
import { yamlToCard, generateCardMarkdown, generateCardFilename } from '@/services/flashcard/flashcard';
import { parseFrontmatter, updateFrontmatter } from '@/services/markdown/frontmatter';
import { useFileStore } from './useFileStore';
import { createFile, saveFile, deleteFile } from '../lib/tauri';
import { getCurrentTranslations } from '@/stores/useLocaleStore';
import { reportOperationError } from '@/lib/reportError';

type ReviewSummary = {
  deckId: string;
  reviewed: number;
  correct: number;
  incorrect: number;
  endedAt: string;
};

const FLASHCARD_YAML_PATCH_FIELDS: (keyof Flashcard)[] = [
  'type',
  'deck',
  'source',
  'tags',
  'front',
  'back',
  'text',
  'question',
  'options',
  'answer',
  'items',
  'ordered',
  'explanation',
  'ease',
  'interval',
  'repetitions',
  'due',
  'lastReview',
  'created',
];

const buildYamlPatchFromUpdates = (updates: Partial<Flashcard>): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  for (const key of FLASHCARD_YAML_PATCH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      patch[key] = updates[key];
    }
  }
  return patch;
};

// ==================== Store 类型 ====================

interface FlashcardState {
  // 数据
  cards: Map<string, Flashcard>;  // notePath -> Flashcard
  decks: Deck[];
  
  // 复习会话
  currentSession: ReviewSession | null;
  lastReviewSummary: ReviewSummary | null;
  
  // UI 状态
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadCards: () => Promise<void>;
  addCard: (card: Partial<Flashcard> & { type: FlashcardType; deck?: string; tags?: string[] }, folder?: string) => Promise<string>;
  updateCard: (notePath: string, updates: Partial<Flashcard>) => Promise<void>;
  deleteCard: (notePath: string) => Promise<void>;
  
  // 复习
  startReview: (deckId?: string, options?: { allowAhead?: boolean }) => boolean;
  submitReview: (rating: ReviewRating) => Promise<void>;
  skipCard: () => void;
  endReview: () => void;
  clearError: () => void;
  
  // 牌组
  getDecks: () => Deck[];
  getDeckStats: (deckId: string) => { total: number; new: number; due: number; learning: number };
  getDueCards: (deckId?: string) => Flashcard[];
  getCardsByDeck: (deckId: string) => Flashcard[];
  deleteDeck: (deckId: string) => Promise<void>;
  
  // 工具
  parseNoteAsCard: (notePath: string, yaml: Record<string, any>) => void;
  removeCardByPath: (notePath: string) => void;
}

// ==================== Store 实现 ====================

export const useFlashcardStore = create<FlashcardState>((set, get) => ({
  cards: new Map(),
  decks: [],
  currentSession: null,
  lastReviewSummary: null,
  isLoading: false,
  error: null,

  /**
   * 从笔记库加载所有闪卡
   */
  loadCards: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const fileStore = useFileStore.getState();
      const vaultPath = fileStore.vaultPath;
      
      if (!vaultPath) {
        set({ isLoading: false, cards: new Map() });
        return;
      }
      
      // 扫描 Flashcards 目录下的所有 .md 文件
      const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs');
      const { join } = await import('@tauri-apps/api/path');
      
      const flashcardsDir = await join(vaultPath, 'Flashcards');
      const newCards = new Map<string, Flashcard>();
      const failedFiles: string[] = [];
      
      try {
        const scanDir = async (dirPath: string, relativeDir: string): Promise<void> => {
          const entries = await readDir(dirPath);

          for (const entry of entries) {
            if (!entry.name) continue;

            const absolutePath = await join(dirPath, entry.name);
            const relativePath = `${relativeDir}/${entry.name}`;

            if (entry.isDirectory) {
              await scanDir(absolutePath, relativePath);
              continue;
            }

            if (!entry.name.endsWith('.md')) continue;

            try {
              const content = await readTextFile(absolutePath);
              const parsed = parseFrontmatter(content);
              if (parsed.parseError) {
                throw new Error(parsed.parseError);
              }
              const yaml = parsed.frontmatter as Record<string, unknown>;

              if (yaml.db === 'flashcards') {
                const card = yamlToCard(yaml, relativePath, content);
                if (card) {
                  newCards.set(relativePath, card);
                }
              }
            } catch (e) {
              failedFiles.push(relativePath);
              console.warn(`Failed to parse flashcard: ${relativePath}`, e);
            }
          }
        };

        await scanDir(flashcardsDir, 'Flashcards');
      } catch (e) {
        // Flashcards 目录可能不存在
        console.log('Flashcards directory not found or empty');
      }

      if (failedFiles.length > 0) {
        const t = getCurrentTranslations();
        const preview = failedFiles.slice(0, 5).join(', ');
        const userMessage = `${t.flashcard.loadFailed}: ${failedFiles.length}`;
        set({ cards: newCards, isLoading: false, error: userMessage });
        reportOperationError({
          source: 'FlashcardStore.loadCards',
          action: 'Parse flashcards',
          error: new Error(`Failed files: ${preview}`),
          userMessage,
          level: 'warning',
        });
        return;
      }

      set({ cards: newCards, isLoading: false, error: null });
    } catch (error) {
      const t = getCurrentTranslations();
      const message = error instanceof Error ? error.message : t.flashcard.loadFailed;
      set({ isLoading: false, error: message });
      reportOperationError({
        source: 'FlashcardStore.loadCards',
        action: 'Load flashcards',
        error,
        userMessage: message,
      });
    }
  },

  /**
   * 添加新卡片（创建笔记文件）
   */
  addCard: async (cardData, folder = 'Flashcards') => {
    const fileStore = useFileStore.getState();
    const vaultPath = fileStore.vaultPath;
    
    if (!vaultPath) {
      throw new Error(getCurrentTranslations().common.openWorkspaceFirst);
    }

    try {
      // 生成文件名和路径
      const filename = generateCardFilename(cardData);
      const separator = vaultPath.includes('\\') ? '\\' : '/';
      const fullPath = `${vaultPath}${separator}${folder}${separator}${filename}`;
      const notePath = `${folder}/${filename}`;
      
      // 生成 Markdown 内容
      const content = generateCardMarkdown(cardData);
      
      // 创建文件并写入内容
      await createFile(fullPath);
      await saveFile(fullPath, content);
      
      // 刷新文件树
      await fileStore.refreshFileTree();
      
      // 添加到 store
      const card: Flashcard = {
        ...INITIAL_SM2_STATE,
        ...cardData,
        id: notePath,
        notePath,
        deck: cardData.deck || 'Default',
        created: new Date().toISOString().split('T')[0],
      } as Flashcard;
      
      set(state => {
        const newCards = new Map(state.cards);
        newCards.set(notePath, card);
        return { cards: newCards, error: null };
      });
      
      return notePath;
    } catch (error) {
      const message = reportOperationError({
        source: 'FlashcardStore.addCard',
        action: 'Create flashcard',
        error,
        userMessage: getCurrentTranslations().flashcard.loadFailed,
      });
      set({ error: message });
      throw error;
    }
  },

  /**
   * 更新卡片（更新笔记 YAML）
   */
  updateCard: async (notePath, updates) => {
    const fileStore = useFileStore.getState();
    const vaultPath = fileStore.vaultPath;
    const card = get().cards.get(notePath);
    
    if (!card || !vaultPath) return;
    
    const updatedCard = { ...card, ...updates };
    const separator = vaultPath.includes('\\') ? '\\' : '/';
    const fullPath = `${vaultPath}${separator}${notePath.replace(/\//g, separator)}`;

    try {
      // 优先仅更新 frontmatter，避免重写正文导致内容丢失
      const yamlPatch = buildYamlPatchFromUpdates(updates);
      let content = generateCardMarkdown(updatedCard);

      if (Object.keys(yamlPatch).length > 0) {
        try {
          const { readTextFile } = await import('@tauri-apps/plugin-fs');
          const existing = await readTextFile(fullPath);
          content = updateFrontmatter(existing, yamlPatch);
        } catch {
          // 文件不存在或读取失败时，回退到完整重写
        }
      }

      await saveFile(fullPath, content);
      
      // 更新 store
      set(state => {
        const newCards = new Map(state.cards);
        newCards.set(notePath, updatedCard);
        return { cards: newCards, error: null };
      });
    } catch (error) {
      const t = getCurrentTranslations();
      const message = reportOperationError({
        source: 'FlashcardStore.updateCard',
        action: 'Update flashcard',
        error,
        userMessage: t.flashcard.loadFailed,
      });
      set({ error: message });
      throw error;
    }
  },

  /**
   * 删除卡片
   */
  deleteCard: async (notePath) => {
    const fileStore = useFileStore.getState();
    const vaultPath = fileStore.vaultPath;
    
    if (!vaultPath) return;
    
    try {
      const separator = vaultPath.includes('\\') ? '\\' : '/';
      const fullPath = `${vaultPath}${separator}${notePath.replace(/\//g, separator)}`;
      await deleteFile(fullPath);
      
      set(state => {
        const newCards = new Map(state.cards);
        newCards.delete(notePath);
        return { cards: newCards, error: null };
      });
    } catch (error) {
      const message = reportOperationError({
        source: 'FlashcardStore.deleteCard',
        action: 'Delete flashcard',
        error,
      });
      set({ error: message });
      throw error;
    }
  },

  /**
   * 开始复习会话
   */
  startReview: (deckId, options) => {
    const allowAhead = options?.allowAhead ?? false;
    const deckCards = Array.from(get().cards.values()).filter((card) => {
      if (deckId && deckId !== 'all' && card.deck !== deckId) {
        return false;
      }
      return true;
    });

    const reviewCards = allowAhead
      ? [...deckCards].sort((a, b) => a.due.localeCompare(b.due))
      : deckCards.filter((card) => isDue(card.due));

    if (reviewCards.length === 0) {
      set({ error: getCurrentTranslations().flashcard.noCardsToReview });
      return false;
    }
    
    // 随机打乱顺序
    const queue = allowAhead
      ? reviewCards
      : [...reviewCards].sort(() => Math.random() - 0.5);
    
    set({
      currentSession: {
        deckId: deckId || 'all',
        cards: queue,
        currentIndex: 0,
        startTime: new Date().toISOString(),
        reviewed: 0,
        correct: 0,
        incorrect: 0,
      },
      error: null,
      lastReviewSummary: null,
    });
    return true;
  },

  /**
   * 提交复习评分
   */
  submitReview: async (rating) => {
    const session = get().currentSession;
    if (!session) return;
    
    const currentCard = session.cards[session.currentIndex];
    if (!currentCard) return;
    
    // 计算新的 SM-2 状态
    const newState = calculateNextReview(currentCard, rating);
    
    // 更新卡片
    try {
      await get().updateCard(currentCard.notePath, newState);
    } catch {
      return;
    }
    
    // 更新会话统计
    set(state => {
      if (!state.currentSession) return state;
      
      const newSession = {
        ...state.currentSession,
        currentIndex: state.currentSession.currentIndex + 1,
        reviewed: state.currentSession.reviewed + 1,
        correct: rating >= 2 
          ? state.currentSession.correct + 1 
          : state.currentSession.correct,
        incorrect: rating < 2 
          ? state.currentSession.incorrect + 1 
          : state.currentSession.incorrect,
      };
      
      // 检查是否完成
      if (newSession.currentIndex >= newSession.cards.length) {
        return {
          currentSession: null,
          lastReviewSummary: {
            deckId: newSession.deckId,
            reviewed: newSession.reviewed,
            correct: newSession.correct,
            incorrect: newSession.incorrect,
            endedAt: new Date().toISOString(),
          },
        };
      }
      
      return { currentSession: newSession };
    });
  },

  /**
   * 跳过当前卡片
   */
  skipCard: () => {
    set(state => {
      if (!state.currentSession) return state;
      
      const newIndex = state.currentSession.currentIndex + 1;
      
      if (newIndex >= state.currentSession.cards.length) {
        return { currentSession: null };
      }
      
      return {
        currentSession: {
          ...state.currentSession,
          currentIndex: newIndex,
        },
      };
    });
  },

  /**
   * 结束复习会话
   */
  endReview: () => {
    set({ currentSession: null });
  },

  clearError: () => {
    set({ error: null });
  },

  /**
   * 获取所有牌组
   */
  getDecks: () => {
    const cards = Array.from(get().cards.values());
    const deckMap = new Map<string, Deck>();
    
    for (const card of cards) {
      const deckName = card.deck || 'Default';
      
      if (!deckMap.has(deckName)) {
        deckMap.set(deckName, {
          id: deckName,
          name: deckName,
          created: card.created,
        });
      }
    }
    
    return Array.from(deckMap.values());
  },

  /**
   * 获取牌组统计
   */
  getDeckStats: (deckId) => {
    const cards = Array.from(get().cards.values())
      .filter(c => deckId === 'all' || c.deck === deckId);
    
    return calculateDeckStats(cards);
  },

  /**
   * 获取待复习卡片
   */
  getDueCards: (deckId) => {
    return Array.from(get().cards.values())
      .filter(card => {
        if (deckId && deckId !== 'all' && card.deck !== deckId) {
          return false;
        }
        return isDue(card.due);
      });
  },

  /**
   * 获取指定牌组的所有卡片
   */
  getCardsByDeck: (deckId) => {
    return Array.from(get().cards.values())
      .filter(card => card.deck === deckId);
  },

  /**
   * 删除整个牌组（删除其包含的所有卡片）
   */
  deleteDeck: async (deckId) => {
    const { deleteCard } = get();
    const cardsToDelete = get().getCardsByDeck(deckId);

    for (const card of cardsToDelete) {
      await deleteCard(card.notePath);
    }

    // 刷新文件树以反映删除
    const fileStore = useFileStore.getState();
    await fileStore.refreshFileTree();
  },

  /**
   * 从笔记 YAML 解析卡片（供 FileStore 调用）
   */
  parseNoteAsCard: (notePath, yaml) => {
    if (yaml.db !== 'flashcards') return;
    
    const card = yamlToCard(yaml, notePath);
    if (!card) return;
    
    set(state => {
      const newCards = new Map(state.cards);
      newCards.set(notePath, card);
      return { cards: newCards };
    });
  },

  /**
   * 根据路径移除卡片（文件删除时调用）
   */
  removeCardByPath: (notePath) => {
    set(state => {
      const newCards = new Map(state.cards);
      newCards.delete(notePath);
      return { cards: newCards };
    });
  },
}));
