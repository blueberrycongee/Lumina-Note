import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CodeMirrorEditor } from './CodeMirrorEditor';

declare global {
  interface Window {
    __cmSelectionTrace?: any;
    __luminaEditorTrace?: any;
    __cmSelectionTraceSessionId?: string;
    __luminaEditorTraceSessionId?: string;
  }
}

describe('CodeMirror editor interaction trace API', () => {
  afterEach(() => {
    cleanup();
    delete window.__cmSelectionTrace;
    delete window.__luminaEditorTrace;
    delete window.__cmSelectionTraceSessionId;
    delete window.__luminaEditorTraceSessionId;
    localStorage.removeItem('cmSelectionVisualTrace');
  });

  it('exposes a lumina trace alias that can capture custom interaction markers', () => {
    render(<CodeMirrorEditor content={'Line 1\nLine 2'} onChange={vi.fn()} viewMode="live" />);

    expect(window.__luminaEditorTrace).toBeTruthy();
    expect(window.__luminaEditorTrace).toBe(window.__cmSelectionTrace);
    expect(window.__luminaEditorTraceSessionId).toBe(window.__cmSelectionTraceSessionId);

    window.__luminaEditorTrace.enable(false);
    window.__luminaEditorTrace.mark('test-interaction-event', { source: 'unit-test' });

    const data = window.__luminaEditorTrace.getData();
    expect(data.events.some((event: any) => event.type === 'test-interaction-event')).toBe(true);
  });
});
