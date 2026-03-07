import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useBrowserStore } from "@/stores/useBrowserStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { UpdateChecker } from "../settings/UpdateChecker";

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UpdateModal({ isOpen, onClose }: UpdateModalProps) {
  const { t } = useLocaleStore();
  const { hideAllWebViews, showAllWebViews } = useBrowserStore();

  useEffect(() => {
    if (isOpen) {
      hideAllWebViews();
    } else {
      showAllWebViews();
    }
  }, [hideAllWebViews, isOpen, showAllWebViews]);

  if (!isOpen) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-modal-title"
        data-testid="update-modal"
        className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-6 py-4">
          <h2 id="update-modal-title" className="text-lg font-semibold text-foreground/90">
            {t.updateChecker.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-muted"
            aria-label={t.common.close}
          >
            <X size={18} className="text-foreground/70" />
          </button>
        </div>

        <div className="max-h-[calc(80vh-60px)] overflow-y-auto p-6">
          <UpdateChecker />
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
