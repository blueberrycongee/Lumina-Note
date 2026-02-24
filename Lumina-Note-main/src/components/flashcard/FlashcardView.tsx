/**
 * FlashcardView - 闪卡主视图
 *
 * 组合牌组列表和复习界面，并在文件树变化时自动刷新闪卡。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { DeckList } from './DeckList';
import { FlashcardReview } from './FlashcardReview';
import { useFlashcardStore } from '../../stores/useFlashcardStore';
import { useFileStore } from '../../stores/useFileStore';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useLocaleStore } from '@/stores/useLocaleStore';
import { useShallow } from 'zustand/react/shallow';

interface FlashcardViewProps {
  deckId?: string;
}

export const FlashcardView: React.FC<FlashcardViewProps> = ({ deckId }) => {
  const [reviewingDeckId, setReviewingDeckId] = useState<string | null>(null);
  const [showCreateCard, setShowCreateCard] = useState(false);
  const [createDeckId, setCreateDeckId] = useState<string>('Default');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const {
    currentSession,
    endReview,
    loadCards,
    isLoading,
    startReview,
    error,
    clearError,
  } = useFlashcardStore(
    useShallow((state) => ({
      currentSession: state.currentSession,
      endReview: state.endReview,
      loadCards: state.loadCards,
      isLoading: state.isLoading,
      startReview: state.startReview,
      error: state.error,
      clearError: state.clearError,
    })),
  );
  const { fileTree } = useFileStore();

  // 加载闪卡
  const refreshCards = useCallback(async () => {
    await loadCards();
    setHasLoadedOnce(true);
  }, [loadCards]);

  // 初始加载
  useEffect(() => {
    refreshCards();
  }, [refreshCards]);

  // 监听文件树变化（文件创建/删除时会更新 fileTree）
  useEffect(() => {
    refreshCards();
  }, [fileTree, refreshCards]);

  // 开始复习
  const handleStartReview = useCallback((id: string, allowAhead = false) => {
    const started = startReview(id, { allowAhead });
    setReviewingDeckId(started ? id : null);
  }, [startReview]);

  // 创建卡片
  const handleCreateCard = (id: string) => {
    setCreateDeckId(id);
    setShowCreateCard(true);
  };

  // 关闭复习
  const handleCloseReview = () => {
    setReviewingDeckId(null);
    endReview();
  };

  useEffect(() => {
    if (!deckId) return;
    handleStartReview(deckId);
  }, [deckId, handleStartReview]);

  // 如果正在复习，显示复习界面
  if (reviewingDeckId || currentSession) {
    return (
      <FlashcardReview 
        deckId={reviewingDeckId || undefined} 
        onClose={handleCloseReview} 
      />
    );
  }

  // 显示牌组列表（加载时保持组件挂载，用遮罩提示，以免展开状态丢失）
  return (
    <>
      <div className="relative flex-1 overflow-auto">
        {error && (
          <div className="mx-4 mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1 break-words">{error}</div>
              <button
                type="button"
                onClick={clearError}
                className="rounded p-0.5 text-destructive/80 hover:bg-destructive/10"
                aria-label="dismiss flashcard error"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {!hasLoadedOnce && isLoading && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        <DeckList 
          onStartReview={handleStartReview}
          onCreateCard={handleCreateCard}
        />
      </div>
      
      {/* 创建卡片对话框 - 移到外层确保全屏遮罩 */}
      {showCreateCard && (
        <CreateCardDialog
          deckId={createDeckId}
          onClose={() => setShowCreateCard(false)}
        />
      )}
    </>
  );
};

// ==================== 创建卡片对话框（简版） ====================

interface CreateCardDialogProps {
  deckId: string;
  onClose: () => void;
}

const CreateCardDialog: React.FC<CreateCardDialogProps> = ({ deckId, onClose }) => {
  const { t } = useLocaleStore();
  const addCard = useFlashcardStore((state) => state.addCard);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!front.trim() || !back.trim()) return;
    
    setIsSubmitting(true);
    try {
      await addCard({
        type: 'basic',
        front: front.trim(),
        back: back.trim(),
        deck: deckId,
        tags: [],
      });
      onClose();
    } catch {
      // 错误由 store 上报并展示，不在对话框里重复处理
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 - 点击关闭 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      {/* 对话框 */}
      <div className="relative bg-white dark:bg-neutral-900 border rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-4">{t.flashcard.createCardTitle}</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t.flashcard.frontLabel}</label>
            <textarea
              value={front}
              onChange={(e) => setFront(e.target.value)}
              className="w-full p-3 border rounded-lg bg-background resize-none"
              rows={3}
              placeholder={t.flashcard.questionPlaceholder}
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">{t.flashcard.backLabel}</label>
            <textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              className="w-full p-3 border rounded-lg bg-background resize-none"
              rows={3}
              placeholder={t.flashcard.answerPlaceholder}
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-muted-foreground hover:text-foreground"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!front.trim() || !back.trim() || isSubmitting}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
          >
            {isSubmitting ? t.flashcard.creating : t.flashcard.createCard}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FlashcardView;
