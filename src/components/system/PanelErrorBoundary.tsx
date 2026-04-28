/**
 * Per-panel React error boundary.
 *
 * Wraps the chat / sidebar / editor / diagram surfaces so a render-time
 * exception from one panel doesn't white-screen the whole app. On catch:
 *
 *   - reports a `render.boundary` envelope (severity=blocker) with the
 *     component stack as cause, so diagnostics panel can pick it up.
 *   - swaps in a small inline fallback ("This panel crashed — Reload")
 *     that re-mounts the children when the user clicks reload.
 *
 * Use one boundary per major surface, not one giant boundary at the
 * app root — the goal is graceful degradation, not "all or nothing".
 */

import { Component, type ReactNode } from "react";

import { reportError } from "@/services/errors";
import { getCurrentTranslations } from "@/stores/useLocaleStore";

type Props = {
  /** Short label for the panel — surfaced in the fallback + envelope. */
  label: string;
  children: ReactNode;
  /** Optional custom fallback. Falls back to a default if omitted. */
  fallback?: (params: { error: Error; reset: () => void; label: string }) => ReactNode;
};

type State = {
  error: Error | null;
};

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    reportError({
      kind: "render.boundary",
      severity: "blocker",
      message: `${this.props.label} crashed: ${error.message}`,
      cause: { error, componentStack: info.componentStack ?? null },
      retryable: true,
    });
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback({ error, reset: this.reset, label: this.props.label });
      }
      // Lookup at render-time so locale switches re-render correctly.
      const e = getCurrentTranslations().agentMessage.errors;
      return (
        <div className="flex h-full w-full items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4 text-sm text-center">
            <div className="text-foreground/90 mb-3">
              {e.panelCrashed}
            </div>
            <button
              onClick={this.reset}
              className="px-3 py-1.5 rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-medium transition-colors"
            >
              {e.reloadPanel}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
