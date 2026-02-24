/**
 * DeckList - 牌组列表组件
 * 
 * 显示所有牌组及其统计信息
 */

import React from 'react';
import { 
  Layers, 
  Play, 
  Plus, 
  Brain,
  Clock,
  Sparkles,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useFlashcardStore } from '../../stores/useFlashcardStore';
import { cn } from '../../lib/utils';
import { useLocaleStore } from '../../stores/useLocaleStore';
import { Flashcard } from '../../types/flashcard';
import { useShallow } from 'zustand/react/shallow';

interface DeckListProps {
  onStartReview: (deckId: string, allowAhead?: boolean) => void;
  onCreateCard: (deckId: string) => void;
}

export const DeckList: React.FC<DeckListProps> = ({ 
  onStartReview, 
  onCreateCard 
}) => {
  const { getDecks, getDeckStats, getDueCards, getCardsByDeck, deleteDeck, deleteCard } = useFlashcardStore(
    useShallow((state) => ({
      getDecks: state.getDecks,
      getDeckStats: state.getDeckStats,
      getDueCards: state.getDueCards,
      getCardsByDeck: state.getCardsByDeck,
      deleteDeck: state.deleteDeck,
      deleteCard: state.deleteCard,
    })),
  );
  const { t } = useLocaleStore();
  const [expandedDecks, setExpandedDecks] = React.useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = React.useState<{ type: 'deck' | 'card'; deckId: string; notePath?: string } | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  
  const decks = getDecks();
  const allCardsCount = decks.reduce((sum, deck) => sum + getCardsByDeck(deck.id).length, 0);
  const allDueCount = getDueCards().length;

  const toggleExpanded = (deckId: string) => {
    setExpandedDecks(prev => {
      const next = new Set(prev);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  };

  const requestDeleteDeck = (deckId: string) => {
    setPendingDelete({ type: 'deck', deckId });
  };

  const requestDeleteCard = (deckId: string, notePath: string) => {
    setPendingDelete({ type: 'card', deckId, notePath });
  };

  const cancelDelete = () => {
    if (isDeleting) return;
    setPendingDelete(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      if (pendingDelete.type === 'deck') {
        await deleteDeck(pendingDelete.deckId);
        setExpandedDecks(prev => {
          const next = new Set(prev);
          next.delete(pendingDelete.deckId);
          return next;
        });
      } else if (pendingDelete.notePath) {
        await deleteCard(pendingDelete.notePath);
      }
    } catch {
      // 错误由 store 上报并展示
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Layers className="w-5 h-5" />
          {t.flashcard.decks}
        </h2>
        <button
          onClick={() => onCreateCard('Default')}
          className="p-2 hover:bg-muted rounded-lg"
          title={t.flashcard.createCard}
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* 全部复习按钮 */}
      {(allDueCount > 0 || allCardsCount > 0) && (
        <button
          onClick={() => onStartReview('all', allDueCount === 0)}
          className={cn(
            "w-full p-4 rounded-xl",
            "bg-gradient-to-r from-primary/10 to-primary/5",
            "border border-primary/20",
            "hover:from-primary/20 hover:to-primary/10",
            "transition-all"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Brain className="w-5 h-5 text-primary" />
              </div>
              <div className="text-left">
                <div className="font-medium">
                  {allDueCount > 0 ? t.flashcard.startReview : t.flashcard.reviewAheadAll}
                </div>
                <div className="text-sm text-muted-foreground">
                  {allDueCount > 0
                    ? t.flashcard.cardsToReview.replace('{count}', String(allDueCount))
                    : t.flashcard.cardsCanReviewAhead.replace('{count}', String(allCardsCount))}
                </div>
              </div>
            </div>
            <Play className="w-5 h-5 text-primary" />
          </div>
        </button>
      )}

      {/* 牌组列表 */}
      <div className="space-y-2">
        {decks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t.flashcard.noCards}</p>
            <p className="text-sm">{t.flashcard.letAiGenerate}</p>
          </div>
        ) : (
          decks.map(deck => (
            <DeckCard
              key={deck.id}
              deck={deck}
              stats={getDeckStats(deck.id)}
              cards={getCardsByDeck(deck.id)}
              onStartReview={(allowAhead) => onStartReview(deck.id, allowAhead)}
              onCreateCard={() => onCreateCard(deck.id)}
              onDeleteDeck={() => requestDeleteDeck(deck.id)}
              onDeleteCard={(notePath) => requestDeleteCard(deck.id, notePath)}
              expanded={expandedDecks.has(deck.id)}
              onToggleExpanded={() => toggleExpanded(deck.id)}
              t={t}
            />
          ))
        )}
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border rounded-xl p-5 w-full max-w-sm shadow-xl space-y-3">
            <div className="font-semibold text-base">
              {pendingDelete.type === 'deck'
                ? t.flashcard.confirmDeleteDeck.replace('{name}', pendingDelete.deckId)
                : t.flashcard.confirmDeleteCard}
            </div>
            <p className="text-sm text-muted-foreground">{t.flashcard.cannotRecover}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={cancelDelete}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                disabled={isDeleting}
              >
                {t.common.cancel}
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-3 py-2 text-sm bg-destructive text-destructive-foreground rounded-lg disabled:opacity-50"
              >
                {isDeleting ? t.flashcard.deleting : t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== 子组件 ====================

interface DeckCardProps {
  deck: { id: string; name: string; description?: string };
  stats: { total: number; new: number; due: number; learning: number };
  cards: Flashcard[];
  onStartReview: (allowAhead?: boolean) => void;
  onCreateCard: () => void;
  onDeleteDeck: () => void;
  onDeleteCard: (notePath: string) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  t: any;
}

const DeckCard: React.FC<DeckCardProps> = ({ 
  deck, 
  stats, 
  cards,
  onStartReview, 
  onCreateCard,
  onDeleteDeck,
  onDeleteCard,
  expanded,
  onToggleExpanded,
  t,
}) => {
  const hasDue = stats.due > 0 || stats.new > 0;
  const canStartReview = stats.total > 0;

  return (
    <div
      className={cn(
        "p-4 rounded-xl border bg-card",
        "hover:shadow-md transition-shadow"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium">{deck.name}</h3>
          {deck.description && (
            <p className="text-sm text-muted-foreground mt-1">
              {deck.description}
            </p>
          )}
          
          {/* 统计 */}
          <div className="flex items-center gap-4 mt-3 text-sm">
            <StatBadge
              icon={<Sparkles className="w-3 h-3" />}
              value={stats.new}
              label={t.flashcard.new}
              color="blue"
            />
            <StatBadge
              icon={<Clock className="w-3 h-3" />}
              value={stats.due}
              label={t.flashcard.due}
              color="orange"
            />
            <StatBadge
              icon={<Brain className="w-3 h-3" />}
              value={stats.learning}
              label={t.flashcard.learning}
              color="green"
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleExpanded}
            className="p-2 hover:bg-muted rounded-lg"
            title={expanded ? t.flashcard.collapseCards : t.flashcard.expandCards}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {canStartReview && (
            <button
              onClick={() => onStartReview(!hasDue)}
              className="p-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg"
              title={hasDue ? t.flashcard.startReview : t.flashcard.reviewAhead}
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onCreateCard}
            className="p-2 hover:bg-muted rounded-lg"
            title={t.flashcard.addCard}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onDeleteDeck}
            className="p-2 hover:bg-muted rounded-lg text-destructive"
            title={t.flashcard.deleteDeck}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 展开显示卡片列表 */}
      {expanded && cards.length > 0 && (
        <div className="mt-4 space-y-2">
          {cards.map(card => (
            <div
              key={card.notePath}
              className="text-sm text-muted-foreground border rounded-lg p-2 flex items-center justify-between gap-2"
            >
              <CardPreview card={card} />
              <button
                onClick={() => onDeleteCard(card.notePath)}
                className="p-1 hover:bg-muted rounded text-destructive"
                title={t.flashcard.deleteCard}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {expanded && cards.length === 0 && (
        <div className="mt-3 text-sm text-muted-foreground">
          {t.flashcard.noCardsInDeck}
        </div>
      )}
    </div>
  );
};

/** 统计徽章 */
const StatBadge: React.FC<{
  icon: React.ReactNode;
  value: number;
  label: string;
  color: 'blue' | 'orange' | 'green';
}> = ({ icon, value, label, color }) => {
  if (value === 0) return null;

  const colorClasses = {
    blue: 'text-blue-600 dark:text-blue-400',
    orange: 'text-orange-600 dark:text-orange-400',
    green: 'text-green-600 dark:text-green-400',
  };

  return (
    <div className={cn("flex items-center gap-1", colorClasses[color])}>
      {icon}
      <span>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
};

/** 卡片预览内容 */
const CardPreview: React.FC<{ card: Flashcard }> = ({ card }) => {
  if ((card.type === 'basic' || card.type === 'basic-reversed') && card.front) {
    return <span>{card.front}</span>;
  }
  if (card.type === 'cloze' && card.text) {
    return <span>{card.text}</span>;
  }
  if (card.type === 'mcq' && card.question) {
    return <span>{card.question}</span>;
  }
  if (card.type === 'list' && card.question) {
    return <span>{card.question}</span>;
  }
  return <span>{card.notePath}</span>;
};

export default DeckList;
