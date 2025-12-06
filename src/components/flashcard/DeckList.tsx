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
import { Flashcard } from '../../types/flashcard';

interface DeckListProps {
  onStartReview: (deckId: string) => void;
  onCreateCard: (deckId: string) => void;
}

export const DeckList: React.FC<DeckListProps> = ({ 
  onStartReview, 
  onCreateCard 
}) => {
  const { getDecks, getDeckStats, getDueCards, getCardsByDeck, deleteDeck, deleteCard } = useFlashcardStore();
  const [expandedDecks, setExpandedDecks] = React.useState<Set<string>>(new Set());
  
  const decks = getDecks();
  const allDueCount = getDueCards().length;

  const toggleExpanded = (deckId: string) => {
    setExpandedDecks(prev => {
      const next = new Set(prev);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  };

  const handleDeleteDeck = async (deckId: string) => {
    const confirmed = window.confirm(`确定删除牌组 "${deckId}" 下的所有卡片吗？`);
    if (!confirmed) return;
    await deleteDeck(deckId);
  };

  const handleDeleteCard = async (notePath: string) => {
    const confirmed = window.confirm('确定删除这张卡片吗？');
    if (!confirmed) return;
    await deleteCard(notePath);
  };

  return (
    <div className="p-4 space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Layers className="w-5 h-5" />
          闪卡牌组
        </h2>
        <button
          onClick={() => onCreateCard('Default')}
          className="p-2 hover:bg-muted rounded-lg"
          title="创建卡片"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* 全部复习按钮 */}
      {allDueCount > 0 && (
        <button
          onClick={() => onStartReview('all')}
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
                <div className="font-medium">开始复习</div>
                <div className="text-sm text-muted-foreground">
                  {allDueCount} 张卡片待复习
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
            <p>还没有闪卡</p>
            <p className="text-sm">让 AI 帮你从笔记生成卡片吧</p>
          </div>
        ) : (
          decks.map(deck => (
            <DeckCard
              key={deck.id}
              deck={deck}
              stats={getDeckStats(deck.id)}
              cards={getCardsByDeck(deck.id)}
              onStartReview={() => onStartReview(deck.id)}
              onCreateCard={() => onCreateCard(deck.id)}
              onDeleteDeck={() => handleDeleteDeck(deck.id)}
              onDeleteCard={(notePath) => handleDeleteCard(notePath)}
              expanded={expandedDecks.has(deck.id)}
              onToggleExpanded={() => toggleExpanded(deck.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ==================== 子组件 ====================

interface DeckCardProps {
  deck: { id: string; name: string; description?: string };
  stats: { total: number; new: number; due: number; learning: number };
  cards: Flashcard[];
  onStartReview: () => void;
  onCreateCard: () => void;
  onDeleteDeck: () => void;
  onDeleteCard: (notePath: string) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
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
}) => {
  const hasDue = stats.due > 0 || stats.new > 0;

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
              label="新"
              color="blue"
            />
            <StatBadge
              icon={<Clock className="w-3 h-3" />}
              value={stats.due}
              label="待复习"
              color="orange"
            />
            <StatBadge
              icon={<Brain className="w-3 h-3" />}
              value={stats.learning}
              label="学习中"
              color="green"
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleExpanded}
            className="p-2 hover:bg-muted rounded-lg"
            title={expanded ? "收起卡片" : "展开卡片"}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {hasDue && (
            <button
              onClick={onStartReview}
              className="p-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg"
              title="开始复习"
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onCreateCard}
            className="p-2 hover:bg-muted rounded-lg"
            title="添加卡片"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onDeleteDeck}
            className="p-2 hover:bg-muted rounded-lg text-destructive"
            title="删除牌组（会删除该组所有卡片）"
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
                title="删除这张卡片"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {expanded && cards.length === 0 && (
        <div className="mt-3 text-sm text-muted-foreground">
          暂无卡片
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
