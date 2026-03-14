import { useState, useEffect, useCallback } from 'react';
import { useAnnotationStore } from '@/stores/useAnnotationStore';
import { useLocaleStore } from '@/stores/useLocaleStore';
import { useShallow } from 'zustand/react/shallow';
import type { AnnotationDetail } from '@/services/team/types';
import { MessageSquare, Check, Reply, X } from 'lucide-react';

interface AnnotationPanelProps {
  docPath: string;
  onClose: () => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AnnotationCard({ annotation }: { annotation: AnnotationDetail }) {
  const { t } = useLocaleStore();
  const { replyToAnnotation, resolveAnnotation, selectAnnotation, activeAnnotationId } =
    useAnnotationStore(
      useShallow((s) => ({
        replyToAnnotation: s.replyToAnnotation,
        resolveAnnotation: s.resolveAnnotation,
        selectAnnotation: s.selectAnnotation,
        activeAnnotationId: s.activeAnnotationId,
      }))
    );

  const [replyText, setReplyText] = useState('');
  const [showReplies, setShowReplies] = useState(false);
  const isActive = activeAnnotationId === annotation.id;
  const isResolved = annotation.resolved;

  const handleReply = useCallback(async () => {
    const text = replyText.trim();
    if (!text) return;
    try {
      await replyToAnnotation(annotation.id, { content: text });
      setReplyText('');
    } catch {
      // error is set in the store
    }
  }, [replyText, replyToAnnotation, annotation.id]);

  const handleResolve = useCallback(async () => {
    try {
      await resolveAnnotation(annotation.id);
    } catch {
      // error is set in the store
    }
  }, [resolveAnnotation, annotation.id]);

  const handleClick = useCallback(() => {
    selectAnnotation(isActive ? null : annotation.id);
  }, [selectAnnotation, isActive, annotation.id]);

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isResolved
          ? 'border-gray-200 opacity-50 dark:border-gray-700'
          : isActive
            ? 'border-blue-400 bg-blue-50/50 dark:border-blue-600 dark:bg-blue-900/20'
            : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
      }`}
    >
      {/* Card header */}
      <button
        type="button"
        className="w-full cursor-pointer p-3 text-left"
        onClick={handleClick}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-600 dark:text-gray-300">
              {annotation.user_id}
            </p>
            <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
              {formatDate(annotation.created_at)}
            </p>
          </div>
          {isResolved && (
            <span className="flex-shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {t.team.resolved}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-gray-800 dark:text-gray-200">
          {annotation.content}
        </p>
        <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
          Range: {annotation.range_start}&ndash;{annotation.range_end}
        </p>
      </button>

      {/* Replies section */}
      {annotation.replies.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            onClick={() => setShowReplies(!showReplies)}
          >
            <Reply className="h-3 w-3" />
            {annotation.replies.length} {annotation.replies.length === 1 ? t.team.replies : t.team.repliesPlural}
          </button>

          {showReplies && (
            <div className="space-y-2 px-3 pb-2">
              {annotation.replies.map((reply) => (
                <div
                  key={reply.id}
                  className="ml-3 border-l-2 border-gray-200 pl-2 dark:border-gray-600"
                >
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                    {reply.user_id}{' '}
                    <span className="text-gray-400 dark:text-gray-500">
                      {formatDate(reply.created_at)}
                    </span>
                  </p>
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    {reply.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!isResolved && (
        <div className="flex items-center gap-1 border-t border-gray-100 px-3 py-2 dark:border-gray-700">
          <input
            type="text"
            className="flex-1 rounded border border-gray-200 bg-transparent px-2 py-1 text-xs text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
            placeholder={t.team.replyPlaceholder}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleReply();
              }
            }}
          />
          <button
            type="button"
            onClick={handleReply}
            disabled={!replyText.trim()}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-blue-400"
            title={t.team.sendReply}
          >
            <Reply className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResolve}
            className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20 dark:hover:text-green-400"
            title={t.team.resolve}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function AnnotationPanel({ docPath, onClose }: AnnotationPanelProps) {
  const { t } = useLocaleStore();
  const { annotations, loading, error, fetchAnnotations, createAnnotation } =
    useAnnotationStore(
      useShallow((s) => ({
        annotations: s.annotations,
        loading: s.loading,
        error: s.error,
        fetchAnnotations: s.fetchAnnotations,
        createAnnotation: s.createAnnotation,
      }))
    );

  // New annotation form state
  const [newContent, setNewContent] = useState('');
  const [newRangeStart, setNewRangeStart] = useState('0');
  const [newRangeEnd, setNewRangeEnd] = useState('0');

  useEffect(() => {
    fetchAnnotations(docPath);
  }, [docPath, fetchAnnotations]);

  const handleAdd = useCallback(async () => {
    const content = newContent.trim();
    if (!content) return;
    try {
      await createAnnotation({
        doc_path: docPath,
        range_start: parseInt(newRangeStart, 10) || 0,
        range_end: parseInt(newRangeEnd, 10) || 0,
        content,
      });
      setNewContent('');
      setNewRangeStart('0');
      setNewRangeEnd('0');
    } catch {
      // error is set in the store
    }
  }, [newContent, newRangeStart, newRangeEnd, docPath, createAnnotation]);

  // Sort: unresolved first, then by creation time descending
  const sorted = [...annotations].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return b.created_at - a.created_at;
  });

  return (
    <div className="flex h-full w-80 flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {t.team.annotations}
          </h3>
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {annotations.filter((a) => !a.resolved).length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8 text-xs text-gray-400">
          {t.team.loadingAnnotations}
        </div>
      )}

      {/* Annotation list */}
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {!loading && sorted.length === 0 && (
          <div className="py-8 text-center text-xs text-gray-400 dark:text-gray-500">
            {t.team.noAnnotationsYet}
            <br />
            {t.team.noAnnotationsHint}
          </div>
        )}
        {sorted.map((ann) => (
          <AnnotationCard key={ann.id} annotation={ann} />
        ))}
      </div>

      {/* Add annotation area */}
      <div className="border-t border-gray-200 p-3 dark:border-gray-700">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {t.team.addAnnotation}
        </p>
        <div className="mb-2 flex gap-2">
          <div className="flex-1">
            <label className="mb-0.5 block text-[10px] text-gray-400">{t.team.rangeStart}</label>
            <input
              type="number"
              min={0}
              className="w-full rounded border border-gray-200 bg-transparent px-2 py-1 text-xs text-gray-700 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:text-gray-200"
              value={newRangeStart}
              onChange={(e) => setNewRangeStart(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="mb-0.5 block text-[10px] text-gray-400">{t.team.rangeEnd}</label>
            <input
              type="number"
              min={0}
              className="w-full rounded border border-gray-200 bg-transparent px-2 py-1 text-xs text-gray-700 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:text-gray-200"
              value={newRangeEnd}
              onChange={(e) => setNewRangeEnd(e.target.value)}
            />
          </div>
        </div>
        <textarea
          className="mb-2 w-full resize-none rounded border border-gray-200 bg-transparent px-2 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
          rows={2}
          placeholder={t.team.annotationPlaceholder}
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newContent.trim()}
          className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t.team.addAnnotation}
        </button>
      </div>
    </div>
  );
}
