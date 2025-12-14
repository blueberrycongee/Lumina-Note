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
import { useFileStore } from './useFileStore';
import { createFile, saveFile, deleteFile } from '../lib/tauri';

/**
 * 简单的 YAML 解析器（仅支持基本格式）
 */
function parseSimpleYaml(yamlStr: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlStr.split('\n');
  let currentArray: string[] | null = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // 数组项
    if (trimmed.startsWith('- ')) {
      if (currentArray) {
        let value = trimmed.slice(2).trim();
        // 移除引号
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        currentArray.push(value);
      }
      continue;
    }
    
    // 键值对
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      
      // 结束之前的数组
      currentArray = null;
      
      if (value === '' || value === '|') {
        // 可能是数组或多行文本的开始
        result[key] = [];
        currentArray = result[key];
      } else {
        // 移除引号
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        // 尝试解析数字和布尔值
        if (value === 'true') result[key] = true;
        else if (value === 'false') result[key] = false;
        else if (!isNaN(Number(value)) && value !== '') result[key] = Number(value);
        else result[key] = value;
      }
    }
  }
  
  return result;
}

// ==================== Store 类型 ====================

interface FlashcardState {
  // 数据
  cards: Map<string, Flashcard>;  // notePath -> Flashcard
  decks: Deck[];
  
  // 复习会话
  currentSession: ReviewSession | null;
  
  // UI 状态
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadCards: () => Promise<void>;
  addCard: (card: Partial<Flashcard> & { type: FlashcardType; deck?: string; tags?: string[] }, folder?: string) => Promise<string>;
  updateCard: (notePath: string, updates: Partial<Flashcard>) => Promise<void>;
  deleteCard: (notePath: string) => Promise<void>;
  
  // 复习
  startReview: (deckId?: string) => void;
  submitReview: (rating: ReviewRating) => Promise<void>;
  skipCard: () => void;
  endReview: () => void;
  
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
      
      try {
        const entries = await readDir(flashcardsDir);
        
        for (const entry of entries) {
          if (entry.name?.endsWith('.md')) {
            try {
              const filePath = await join(flashcardsDir, entry.name);
              const content = await readTextFile(filePath);
              
              // 解析 YAML frontmatter
              const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
              if (yamlMatch) {
                const yamlContent = yamlMatch[1];
                const yaml = parseSimpleYaml(yamlContent);
                
                if (yaml.db === 'flashcards') {
                  const notePath = `Flashcards/${entry.name}`;
                  const card = yamlToCard(yaml, notePath);
                  if (card) {
                    newCards.set(notePath, card);
                  }
                }
              }
            } catch (e) {
              console.warn(`Failed to parse flashcard: ${entry.name}`, e);
            }
          }
        }
      } catch (e) {
        // Flashcards 目录可能不存在
        console.log('Flashcards directory not found or empty');
      }
      
      set({ cards: newCards, isLoading: false });
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : '加载失败' 
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
      throw new Error('请先打开一个笔记库');
    }
    
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
      return { cards: newCards };
    });
    
    return notePath;
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
    
    // 更新笔记文件
    const content = generateCardMarkdown(updatedCard);
    const separator = vaultPath.includes('\\') ? '\\' : '/';
    const fullPath = `${vaultPath}${separator}${notePath.replace(/\//g, separator)}`;
    await saveFile(fullPath, content);
    
    // 更新 store
    set(state => {
      const newCards = new Map(state.cards);
      newCards.set(notePath, updatedCard);
      return { cards: newCards };
    });
  },

  /**
   * 删除卡片
   */
  deleteCard: async (notePath) => {
    const fileStore = useFileStore.getState();
    const vaultPath = fileStore.vaultPath;
    
    if (!vaultPath) return;
    
    const separator = vaultPath.includes('\\') ? '\\' : '/';
    const fullPath = `${vaultPath}${separator}${notePath.replace(/\//g, separator)}`;
    await deleteFile(fullPath);
    
    set(state => {
      const newCards = new Map(state.cards);
      newCards.delete(notePath);
      return { cards: newCards };
    });
  },

  /**
   * 开始复习会话
   */
  startReview: (deckId) => {
    const dueCards = get().getDueCards(deckId);
    
    if (dueCards.length === 0) {
      set({ error: '没有待复习的卡片' });
      return;
    }
    
    // 随机打乱顺序
    const shuffled = [...dueCards].sort(() => Math.random() - 0.5);
    
    set({
      currentSession: {
        deckId: deckId || 'all',
        cards: shuffled,
        currentIndex: 0,
        startTime: new Date().toISOString(),
        reviewed: 0,
        correct: 0,
        incorrect: 0,
      },
      error: null,
    });
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
    await get().updateCard(currentCard.notePath, newState);
    
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
        return { currentSession: null };
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
