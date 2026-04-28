/**
 * Chat error banner — what the user actually sees when something goes
 * wrong. Mirrors the consumer-AI pattern: one plain-language sentence,
 * an optional retry button, dismiss. Technical metadata (kind, traceId,
 * raw message, cause) only appears when the user opens "Details" — and
 * even then it's framed as "for bug reports" rather than thrown at them.
 *
 * The format function decides what message to show; this component
 * only handles presentation + the disclosure interaction.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X, RefreshCw, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

import { formatEnvelope, type ErrorEnvelope } from "@/services/errors";
import { useLocaleStore } from "@/stores/useLocaleStore";

type Props = {
  envelope: ErrorEnvelope;
  onDismiss: () => void;
  /** Wired by parent — only invoked for action="retry" envelopes. */
  onRetry?: () => void;
  /** Wired by parent — only invoked for action="reload" envelopes. */
  onReload?: () => void;
};

export function ErrorBanner({ envelope, onDismiss, onRetry, onReload }: Props) {
  const { t } = useLocaleStore();
  const e = t.agentMessage.errors;
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatted = formatEnvelope(envelope);

  const copyDetails = async () => {
    const payload = JSON.stringify(
      {
        ...envelope,
        cause: serializeCause(envelope.cause),
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silent. The diagnostics panel still
      // exposes the same data via Export.
    }
  };

  const actionLabel =
    formatted.action === "retry" ? e.retry :
    formatted.action === "reload" ? e.reloadPanel : null;

  const handleAction = () => {
    if (formatted.action === "retry") onRetry?.();
    else if (formatted.action === "reload") onReload?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-sm text-destructive/90 px-4 py-3 bg-destructive/[0.06] border border-destructive/15 rounded-xl mb-5"
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 leading-relaxed">
          {formatted.text}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {actionLabel && (
            <button
              onClick={handleAction}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-destructive/10 hover:bg-destructive/20 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              {actionLabel}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-destructive/10 transition-colors"
            aria-label={e.dismiss}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-1 -mb-1 pl-7">
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1 text-xs text-destructive/60 hover:text-destructive/80 transition-colors"
        >
          {showDetails ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          {showDetails ? e.hideDetails : e.details}
        </button>
        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 px-2 py-2 rounded-md bg-destructive/[0.04] border border-destructive/10 space-y-1 font-mono text-[11px] text-destructive/70">
                <div>kind: {envelope.kind}</div>
                {envelope.traceId && <div>trace: {envelope.traceId}</div>}
                {envelope.sessionId && <div>session: {envelope.sessionId}</div>}
                <div className="break-words whitespace-pre-wrap">
                  {envelope.message}
                </div>
                <button
                  onClick={copyDetails}
                  className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-destructive/10 hover:bg-destructive/20 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3" /> {e.copied}
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> {e.copyDetails}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function serializeCause(cause: unknown): unknown {
  if (cause === undefined || cause === null) return null;
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack };
  }
  return cause;
}
