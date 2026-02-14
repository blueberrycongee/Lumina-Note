import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, useCallback } from "react";
import { createBoundsSnapshot, shouldUpdateBounds, type BoundsSnapshot } from "./bounds";
import { useBrowserStore } from "@/stores/useBrowserStore";
import { reportOperationError } from "@/lib/reportError";

type Props = {
  url: string | null;
  visible: boolean;
  className?: string;
  closeOnUnmount?: boolean;
};

export function CodexEmbeddedWebview({
  url,
  visible,
  className,
  closeOnUnmount = true,
}: Props) {
  const globalHidden = useBrowserStore((s) => s.globalHidden);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastBoundsRef = useRef<BoundsSnapshot | null>(null);
  const nativeVisibleRef = useRef<boolean | null>(null);
  const boundsRetryRef = useRef<{ timer: number | null; count: number }>({
    timer: null,
    count: 0,
  });
  const [created, setCreated] = useState(false);
  const shouldShow = visible && !globalHidden;

  const reportCodexError = useCallback(
    (action: string, error: unknown, context?: Record<string, unknown>) => {
      reportOperationError({
        source: "CodexEmbeddedWebview",
        action,
        error,
        level: "warning",
        context,
      });
    },
    [],
  );

  const setNativeVisible = useCallback(
    async (next: boolean) => {
      // Even when `created` is false, the native webview may already exist (e.g. previous mount).
      if (nativeVisibleRef.current !== null && nativeVisibleRef.current === next) return;
      nativeVisibleRef.current = next;
      await invoke("set_codex_webview_visible", { visible: next });
    },
    [],
  );

  const syncBounds = async (): Promise<boolean> => {
    if (!containerRef.current) return false;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      // When the container is collapsed/hidden (e.g. right panel closed), ensure the native
      // webview is also hidden so it doesn't "float" above unrelated UI.
      void setNativeVisible(false).catch((error) => {
        reportCodexError("Hide codex webview for zero-sized container", error);
      });
      return false;
    }
    const nextRaw = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
    if (!shouldUpdateBounds(lastBoundsRef.current, nextRaw)) return true;
    const next = createBoundsSnapshot(nextRaw);
    lastBoundsRef.current = next;
    boundsRetryRef.current.count = 0;
    await invoke("update_codex_webview_bounds", {
      x: next.normalized.x,
      y: next.normalized.y,
      width: next.normalized.width,
      height: next.normalized.height,
    });
    return true;
  };

  const syncLayout = useCallback(async () => {
    if (!shouldShow) {
      void setNativeVisible(false).catch((error) => {
        reportCodexError("Hide codex webview when panel hidden", error);
      });
      boundsRetryRef.current.count = 0;
      if (boundsRetryRef.current.timer) {
        window.clearTimeout(boundsRetryRef.current.timer);
        boundsRetryRef.current.timer = null;
      }
      return;
    }
    const ok = await syncBounds();
    if (ok) {
      boundsRetryRef.current.count = 0;
      if (boundsRetryRef.current.timer) {
        window.clearTimeout(boundsRetryRef.current.timer);
        boundsRetryRef.current.timer = null;
      }
      await setNativeVisible(true);
      return;
    }
    if (boundsRetryRef.current.count < 60) {
      boundsRetryRef.current.count += 1;
      if (boundsRetryRef.current.timer) {
        window.clearTimeout(boundsRetryRef.current.timer);
      }
      boundsRetryRef.current.timer = window.setTimeout(() => {
        void syncLayout().catch((error) => {
          reportCodexError("Retry codex layout sync", error);
        });
      }, 50);
    }
  }, [reportCodexError, setNativeVisible, shouldShow]);

  useEffect(() => {
    let canceled = false;
    let retryTimer: number | null = null;
    let retryCount = 0;
    const maxRetries = 60;

    const run = async () => {
      if (!url) {
        if (created) {
          await setNativeVisible(false);
        }
        return;
      }

      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        if (retryCount < maxRetries && !canceled) {
          retryCount += 1;
          if (retryTimer) window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(() => {
            void run().catch((error) => {
              reportCodexError("Retry codex webview boot", error);
            });
          }, 50);
        }
        return;
      }

      const exists = await invoke<boolean>("codex_webview_exists");
      if (canceled) return;

      if (!exists) {
        await invoke("create_codex_webview", {
          url,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
        lastBoundsRef.current = createBoundsSnapshot({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
        setCreated(true);
      } else {
        setCreated(true);
        await invoke("navigate_codex_webview", { url });
        await syncLayout();
      }
    };

    void run().catch((error) => {
      reportCodexError("Initialize codex webview", error);
    });
    return () => {
      canceled = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (!shouldShow) {
      void setNativeVisible(false).catch((error) => {
        reportCodexError("Hide codex webview for inactive state", error);
      });
      return;
    }

    lastBoundsRef.current = null;
    void syncLayout().catch((error) => {
      reportCodexError("Sync codex layout on visibility change", error);
    });

    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      void syncLayout().catch((error) => {
        reportCodexError("Periodic codex layout sync", error);
      });
      if (attempts >= 8) {
        window.clearInterval(interval);
      }
    }, 120);
    return () => window.clearInterval(interval);
  }, [created, shouldShow, syncLayout, setNativeVisible]);

  useEffect(() => {
    if (!created) return;
    const handle = () => {
      void syncLayout().catch((error) => {
        reportCodexError("Sync codex layout on resize/scroll", error);
      });
    };
    const observer = new ResizeObserver(handle);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created, syncLayout]);

  useEffect(() => {
    return () => {
      if (boundsRetryRef.current.timer) {
        window.clearTimeout(boundsRetryRef.current.timer);
      }
    };
  }, []);

  useEffect(() => {
    if (!closeOnUnmount) return;
    return () => {
      void invoke("close_codex_webview").catch((error) => {
        reportCodexError("Close codex webview on unmount", error);
      });
    };
  }, [closeOnUnmount, reportCodexError]);

  useEffect(() => {
    if (closeOnUnmount) return;
    return () => {
      void setNativeVisible(false).catch((error) => {
        reportCodexError("Hide codex webview on unmount", error);
      });
    };
  }, [closeOnUnmount, reportCodexError, setNativeVisible]);

  return (
    <div
      ref={containerRef}
      className={
        className ??
        "w-full h-full rounded-xl border border-slate-200/10 overflow-hidden bg-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
      }
    />
  );
}
