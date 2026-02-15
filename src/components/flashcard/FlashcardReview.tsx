/**
 * FlashcardReview - 闪卡复习界面
 * 
 * 支持卡片翻转、评分、进度显示
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Check, 
  Brain,
  SkipForward,
  AlertTriangle,
} from 'lucide-react';
import { useFlashcardStore } from '../../stores/useFlashcardStore';
import { useLocaleStore } from '../../stores/useLocaleStore';
import { ReviewRating, Flashcard } from '../../types/flashcard';
import { daysBetween, formatInterval, previewNextReview } from '@/services/flashcard/sm2';
import { renderClozeFront, renderClozeBack } from '@/services/flashcard/flashcard';
import { parseMarkdown } from '@/services/markdown/markdown';
import { cn } from '../../lib/utils';
import { useShallow } from 'zustand/react/shallow';

interface FlashcardReviewProps {
  deckId?: string;
  onClose?: () => void;
}

export const FlashcardReview: React.FC<FlashcardReviewProps> = ({ 
  deckId, 
  onClose 
}) => {
  const { 
    currentSession, 
    lastReviewSummary,
    error,
    startReview, 
    submitReview, 
    skipCard, 
    endReview,
    clearError,
  } = useFlashcardStore(
    useShallow((state) => ({
      currentSession: state.currentSession,
      lastReviewSummary: state.lastReviewSummary,
      error: state.error,
      startReview: state.startReview,
      submitReview: state.submitReview,
      skipCard: state.skipCard,
      endReview: state.endReview,
      clearError: state.clearError,
    })),
  );
  const { t } = useLocaleStore();
  
  const [isFlipped, setIsFlipped] = useState(false);
  const [clozeIndex] = useState(1);
  const hasAttemptedStartRef = useRef(false);
  const frontRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState<number | null>(null);

  // 开始复习（只尝试一次，避免无卡时重复触发导致渲染循环）
  useEffect(() => {
    if (currentSession || hasAttemptedStartRef.current || !deckId) return;
    hasAttemptedStartRef.current = true;
    startReview(deckId);
  }, [deckId, currentSession, startReview]);

  // 重置翻转状态
  useEffect(() => {
    setIsFlipped(false);
  }, [currentSession?.currentIndex]);

  useEffect(() => {
    if (currentSession) {
      hasAttemptedStartRef.current = true;
    }
  }, [currentSession]);

  const currentCard = currentSession?.cards[currentSession.currentIndex];

  useEffect(() => {
    if (deckId) {
      hasAttemptedStartRef.current = false;
    }
  }, [deckId]);

  // 根据正反面内容计算卡片高度，避免翻转时位置跳动
  useEffect(() => {
    // 等待内容渲染完成后再测量高度
    const timer = setTimeout(() => {
      const frontHeight = frontRef.current?.offsetHeight ?? 0;
      const backHeight = backRef.current?.offsetHeight ?? 0;
      const baseMinHeight = 300;
      const maxHeight = Math.max(frontHeight, backHeight, baseMinHeight);
      if (maxHeight > 0) {
        setCardHeight(maxHeight);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [currentCard, isFlipped]);

  // 处理评分
  const handleRating = useCallback(async (rating: ReviewRating) => {
    await submitReview(rating);
    setIsFlipped(false);
  }, [submitReview]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentCard) return;
      
      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped(f => !f);
      } else if (isFlipped) {
        if (e.key === '1') handleRating(0);
        else if (e.key === '2') handleRating(1);
        else if (e.key === '3') handleRating(2);
        else if (e.key === '4') handleRating(3);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentCard, isFlipped, handleRating]);

  // 无卡片或会话结束
  if (!currentSession || !currentCard) {
    const hasSummary = Boolean(lastReviewSummary && lastReviewSummary.reviewed > 0);
    const reviewed = lastReviewSummary?.reviewed ?? 0;
    const correct = lastReviewSummary?.correct ?? 0;
    const accuracy = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0;
    const noCardsDetail = error && error !== t.flashcard.noCardsToReview ? error : null;

    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Brain className="w-16 h-16 text-primary/50 mb-4" />
        <h2 className="text-xl font-semibold mb-2">
          {hasSummary ? t.flashcard.reviewComplete : t.flashcard.noCardsToReview}
        </h2>
        {hasSummary && (
          <div className="text-muted-foreground mb-4">
            {t.flashcard.reviewedCards.replace('{count}', String(reviewed))}，
            {t.flashcard.accuracy.replace('{percent}', String(accuracy))}
          </div>
        )}
        {!hasSummary && noCardsDetail && (
          <div className="mb-4 rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {noCardsDetail}
          </div>
        )}
        <button
          onClick={onClose || endReview}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
        >
          {t.flashcard.back}
        </button>
      </div>
    );
  }

  const progress = (currentSession.currentIndex / currentSession.cards.length) * 100;
  const nextReviews = previewNextReview(currentCard);
  const today = new Date().toISOString().split('T')[0];
  const hardInterval = Math.max(0, daysBetween(today, nextReviews[1]));
  const goodInterval = Math.max(0, daysBetween(today, nextReviews[2]));
  const easyInterval = Math.max(0, daysBetween(today, nextReviews[3]));

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 顶部进度条 */}
      <div className="flex items-center gap-4 p-4 border-b">
        <button
          onClick={onClose || endReview}
          className="p-2 hover:bg-muted rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
            />
          </div>
        </div>
        
        <div className="text-sm text-muted-foreground">
          {currentSession.currentIndex + 1} / {currentSession.cards.length}
        </div>
      </div>
      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1 break-words">{error}</div>
            <button
              type="button"
              onClick={clearError}
              className="rounded p-0.5 text-destructive/80 hover:bg-destructive/10"
              aria-label="dismiss review error"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 卡片区域 */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div
          className="w-full max-w-2xl perspective-1000"
          onClick={() => setIsFlipped(f => !f)}
        >
          <motion.div
            className={cn(
              "relative w-full min-h-[300px] cursor-pointer",
              "transform-style-3d transition-transform duration-500",
              isFlipped && "rotate-y-180"
            )}
            style={{
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              height: cardHeight ?? undefined,
            }}
          >
            {/* 正面 */}
            <div
              className={cn(
                "absolute inset-0 backface-hidden",
                "bg-card border rounded-xl p-8 shadow-lg",
                "flex flex-col items-center justify-center"
              )}
              style={{ backfaceVisibility: 'hidden' }}
              ref={frontRef}
            >
              <CardFront card={currentCard} clozeIndex={clozeIndex} t={t} />
              <div className="mt-8 text-sm text-muted-foreground">
                {t.flashcard.clickOrSpaceToFlip}
              </div>
            </div>

            {/* 背面 */}
            <div
              className={cn(
                "absolute inset-0 backface-hidden",
                "bg-card border rounded-xl p-8 shadow-lg",
                "flex flex-col items-center justify-center"
              )}
              style={{ 
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
              ref={backRef}
            >
              <CardBack card={currentCard} clozeIndex={clozeIndex} t={t} />
            </div>
          </motion.div>
        </div>
      </div>

      {/* 底部操作区域：固定高度，避免卡片被顶上去 */}
      <div className="border-t">
        <div className="h-[96px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {isFlipped ? (
              <motion.div
                key="rating"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="w-full p-4"
              >
                <div className="flex justify-center gap-3">
                  <RatingButton
                    label={t.flashcard.forget}
                    sublabel={formatInterval(1)}
                    color="red"
                    onClick={() => handleRating(0)}
                    shortcut="1"
                  />
                  <RatingButton
                    label={t.flashcard.hard}
                    sublabel={formatInterval(hardInterval)}
                    color="orange"
                    onClick={() => handleRating(1)}
                    shortcut="2"
                  />
                  <RatingButton
                    label={t.flashcard.good}
                    sublabel={formatInterval(goodInterval)}
                    color="green"
                    onClick={() => handleRating(2)}
                    shortcut="3"
                  />
                  <RatingButton
                    label={t.flashcard.easy}
                    sublabel={formatInterval(easyInterval)}
                    color="blue"
                    onClick={() => handleRating(3)}
                    shortcut="4"
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="skip"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="p-4 flex justify-center"
              >
                <button
                  onClick={skipCard}
                  className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground"
                >
                  <SkipForward className="w-4 h-4" />
                  {t.flashcard.skip}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

// ==================== 子组件 ====================

/** 卡片正面 */
const CardFront: React.FC<{ card: Flashcard; clozeIndex: number; t: any }> = ({ 
  card, 
  clozeIndex,
  t 
}) => {
  if (card.type === 'basic' || card.type === 'basic-reversed') {
    return (
      <div className="w-full text-xl text-center">
        <MarkdownText className="flashcard-markdown">{card.front ?? ''}</MarkdownText>
      </div>
    );
  }
  
  if (card.type === 'cloze' && card.text) {
    return (
      <div className="w-full text-xl text-center">
        <MarkdownText className="flashcard-markdown">
          {renderClozeFront(card.text, clozeIndex)}
        </MarkdownText>
      </div>
    );
  }
  
  if (card.type === 'mcq') {
    return (
      <div className="w-full">
        <div className="text-xl text-center mb-6">
          <MarkdownText className="flashcard-markdown">{card.question ?? ''}</MarkdownText>
        </div>
        <div className="space-y-2">
          {card.options?.map((opt, i) => (
            <div
              key={i}
              className="p-3 border rounded-lg hover:bg-muted cursor-pointer"
            >
              <span>{String.fromCharCode(65 + i)}. </span>
              <MarkdownText className="inline-block align-middle flashcard-markdown">{opt}</MarkdownText>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  if (card.type === 'list') {
    return (
      <div className="w-full text-xl text-center">
        <MarkdownText className="flashcard-markdown">{card.question ?? ''}</MarkdownText>
        <div className="text-sm text-muted-foreground mt-2">
          {card.ordered ? t.flashcard.recallInOrder : t.flashcard.listAllItems}
        </div>
      </div>
    );
  }
  
  return null;
};

/** 卡片背面 */
const CardBack: React.FC<{ card: Flashcard; clozeIndex: number; t: any }> = ({ 
  card, 
  clozeIndex,
  t: _t 
}) => {
  if (card.type === 'basic' || card.type === 'basic-reversed') {
    return (
      <div className="w-full text-xl text-center">
        <MarkdownText className="flashcard-markdown">{card.back ?? ''}</MarkdownText>
      </div>
    );
  }
  
  if (card.type === 'cloze' && card.text) {
    return (
      <div className="w-full text-xl text-center">
        <MarkdownText className="flashcard-markdown">
          {renderClozeBack(card.text, clozeIndex)}
        </MarkdownText>
      </div>
    );
  }
  
  if (card.type === 'mcq') {
    return (
      <div className="w-full">
        <div className="text-xl text-center mb-6">
          <MarkdownText className="flashcard-markdown">{card.question ?? ''}</MarkdownText>
        </div>
        <div className="space-y-2">
          {card.options?.map((opt, i) => (
            <div
              key={i}
              className={cn(
                "p-3 border rounded-lg",
                i === card.answer 
                  ? "bg-green-100 dark:bg-green-900 border-green-500" 
                  : ""
              )}
            >
              <span>{String.fromCharCode(65 + i)}. </span>
              <MarkdownText className="inline-block align-middle flashcard-markdown">{opt}</MarkdownText>
              {i === card.answer && <Check className="inline ml-2 w-4 h-4 text-green-600" />}
            </div>
          ))}
        </div>
        {card.explanation && (
          <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
            <MarkdownText className="flashcard-markdown">{card.explanation}</MarkdownText>
          </div>
        )}
      </div>
    );
  }
  
  if (card.type === 'list') {
    return (
      <div className="w-full">
        <div className="text-xl text-center mb-4">
          <MarkdownText className="flashcard-markdown">{card.question ?? ''}</MarkdownText>
        </div>
        <ol className="list-decimal list-inside space-y-1">
          {card.items?.map((item, i) => (
            <li key={i}>
              <MarkdownText className="inline-block align-middle flashcard-markdown">{item}</MarkdownText>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  
  return null;
};

const MarkdownText: React.FC<{ children: string; className?: string }> = ({ children, className }) => {
  const html = useMemo(() => parseMarkdown(children), [children]);
  return (
    <div
      className={cn("text-inherit [&_p]:my-0", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

/** 评分按钮 */
const RatingButton: React.FC<{
  label: string;
  sublabel: string;
  color: 'red' | 'orange' | 'green' | 'blue';
  onClick: () => void;
  shortcut: string;
}> = ({ label, sublabel, color, onClick, shortcut }) => {
  const colorClasses = {
    red: 'bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900 dark:hover:bg-red-800 dark:text-red-300',
    orange: 'bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900 dark:hover:bg-orange-800 dark:text-orange-300',
    green: 'bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900 dark:hover:bg-green-800 dark:text-green-300',
    blue: 'bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900 dark:hover:bg-blue-800 dark:text-blue-300',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center px-6 py-3 rounded-lg transition-colors",
        colorClasses[color]
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="text-xs opacity-70">{sublabel}</span>
      <span className="text-xs opacity-50 mt-1">({shortcut})</span>
    </button>
  );
};

export default FlashcardReview;
