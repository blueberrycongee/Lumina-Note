/**
 * FlashcardReview - 闪卡复习界面
 * 
 * 支持卡片翻转、评分、进度显示
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Check, 
  Brain,
  SkipForward
} from 'lucide-react';
import { useFlashcardStore } from '../../stores/useFlashcardStore';
import { useLocaleStore } from '../../stores/useLocaleStore';
import { ReviewRating, Flashcard } from '../../types/flashcard';
import { previewNextReview, formatInterval } from '@/services/flashcard/sm2';
import { renderClozeFront, renderClozeBack } from '@/services/flashcard/flashcard';
import { cn } from '../../lib/utils';

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
    startReview, 
    submitReview, 
    skipCard, 
    endReview 
  } = useFlashcardStore();
  const { t } = useLocaleStore();
  
  const [isFlipped, setIsFlipped] = useState(false);
  const [clozeIndex] = useState(1);
  const frontRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState<number | null>(null);

  // 开始复习
  useEffect(() => {
    if (!currentSession) {
      startReview(deckId);
    }
  }, [deckId, currentSession, startReview]);

  // 重置翻转状态
  useEffect(() => {
    setIsFlipped(false);
  }, [currentSession?.currentIndex]);

  const currentCard = currentSession?.cards[currentSession.currentIndex];

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
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Brain className="w-16 h-16 text-primary/50 mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t.flashcard.reviewComplete}</h2>
        {currentSession && (
          <div className="text-muted-foreground mb-4">
            {t.flashcard.reviewedCards.replace('{count}', String(currentSession.reviewed))}，
            {t.flashcard.accuracy.replace('{percent}', String(Math.round((currentSession.correct / currentSession.reviewed) * 100)))}
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
                    sublabel={formatInterval(parseInt(nextReviews[1].split('-')[2]) - new Date().getDate())}
                    color="orange"
                    onClick={() => handleRating(1)}
                    shortcut="2"
                  />
                  <RatingButton
                    label={t.flashcard.good}
                    sublabel={formatInterval(parseInt(nextReviews[2].split('-')[2]) - new Date().getDate())}
                    color="green"
                    onClick={() => handleRating(2)}
                    shortcut="3"
                  />
                  <RatingButton
                    label={t.flashcard.easy}
                    sublabel={formatInterval(parseInt(nextReviews[3].split('-')[2]) - new Date().getDate())}
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
      <div className="text-xl text-center">
        {card.front}
      </div>
    );
  }
  
  if (card.type === 'cloze' && card.text) {
    return (
      <div className="text-xl text-center whitespace-pre-wrap">
        {renderClozeFront(card.text, clozeIndex)}
      </div>
    );
  }
  
  if (card.type === 'mcq') {
    return (
      <div className="w-full">
        <div className="text-xl text-center mb-6">{card.question}</div>
        <div className="space-y-2">
          {card.options?.map((opt, i) => (
            <div
              key={i}
              className="p-3 border rounded-lg hover:bg-muted cursor-pointer"
            >
              {String.fromCharCode(65 + i)}. {opt}
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  if (card.type === 'list') {
    return (
      <div className="text-xl text-center">
        {card.question}
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
      <div className="text-xl text-center whitespace-pre-wrap">
        {card.back}
      </div>
    );
  }
  
  if (card.type === 'cloze' && card.text) {
    return (
      <div className="text-xl text-center whitespace-pre-wrap">
        {renderClozeBack(card.text, clozeIndex)}
      </div>
    );
  }
  
  if (card.type === 'mcq') {
    return (
      <div className="w-full">
        <div className="text-xl text-center mb-6">{card.question}</div>
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
              {String.fromCharCode(65 + i)}. {opt}
              {i === card.answer && <Check className="inline ml-2 w-4 h-4 text-green-600" />}
            </div>
          ))}
        </div>
        {card.explanation && (
          <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
            {card.explanation}
          </div>
        )}
      </div>
    );
  }
  
  if (card.type === 'list') {
    return (
      <div className="w-full">
        <div className="text-xl text-center mb-4">{card.question}</div>
        <ol className="list-decimal list-inside space-y-1">
          {card.items?.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      </div>
    );
  }
  
  return null;
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
