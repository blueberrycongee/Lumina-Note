import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { CodeMirrorEditor } from './CodeMirrorEditor';

function setupEditor(content: string, viewMode: 'live' | 'reading' | 'source' = 'live') {
  const onChange = vi.fn();
  const rendered = render(
    <CodeMirrorEditor content={content} onChange={onChange} viewMode={viewMode} />,
  );
  const editor = rendered.container.querySelector('.cm-editor');
  if (!editor) {
    throw new Error('CodeMirror editor root not found');
  }
  const view = EditorView.findFromDOM(editor as HTMLElement);
  if (!view) {
    throw new Error('EditorView instance not found');
  }
  return { ...rendered, view };
}

function mockVisibleLineAtScroll(view: EditorView, visibleLineStart: number, scrollTop = 1120) {
  Object.defineProperty(view.scrollDOM, 'scrollTop', {
    configurable: true,
    writable: true,
    value: scrollTop,
  });
  return vi.spyOn(view, 'lineBlockAtHeight').mockReturnValue({
    from: visibleLineStart,
    to: visibleLineStart + 'Line 40'.length,
    top: 0,
    bottom: 28,
    height: 28,
    type: 0,
    widget: null,
    length: 'Line 40'.length,
  } as any);
}

async function flushTransitionFrames() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
}

describe('CodeMirror editor mode transition selection sync', () => {
  afterEach(() => {
    cleanup();
  });

  it('reanchors a stale off-screen caret to the current viewport when returning from reading mode', async () => {
    const content = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join('\n');
    const { view, rerender } = setupEditor(content, 'live');
    const staleCaret = content.indexOf('Line 2');
    const visibleLineStart = content.indexOf('Line 40');

    act(() => {
      view.dispatch({ selection: { anchor: staleCaret } });
    });

    const lineBlockSpy = mockVisibleLineAtScroll(view, visibleLineStart);

    act(() => {
      rerender(<CodeMirrorEditor content={content} onChange={vi.fn()} viewMode="reading" />);
    });

    act(() => {
      rerender(<CodeMirrorEditor content={content} onChange={vi.fn()} viewMode="live" />);
    });
    await flushTransitionFrames();

    expect(view.state.selection.main.anchor).toBe(visibleLineStart);
    lineBlockSpy.mockRestore();
  });

  it('reanchors a stale off-screen caret to the current viewport when entering source mode from reading', async () => {
    const content = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join('\n');
    const { view, rerender } = setupEditor(content, 'live');
    const staleCaret = content.indexOf('Line 2');
    const visibleLineStart = content.indexOf('Line 40');

    act(() => {
      view.dispatch({ selection: { anchor: staleCaret } });
    });

    const lineBlockSpy = mockVisibleLineAtScroll(view, visibleLineStart);

    act(() => {
      rerender(<CodeMirrorEditor content={content} onChange={vi.fn()} viewMode="reading" />);
    });

    act(() => {
      rerender(<CodeMirrorEditor content={content} onChange={vi.fn()} viewMode="source" />);
    });
    await flushTransitionFrames();

    expect(view.state.selection.main.anchor).toBe(visibleLineStart);
    lineBlockSpy.mockRestore();
  });

  it('discards a visible edit selection when switching between edit modes', async () => {
    const content = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join('\n');
    const { container, view, rerender } = setupEditor(content, 'live');
    const visibleLineStart = content.indexOf('Line 3');
    const viewportAnchor = content.indexOf('Line 40');
    const contentDom = container.querySelector('.cm-content');

    if (!(contentDom instanceof HTMLElement)) {
      throw new Error('CodeMirror content DOM not found');
    }

    fireEvent.pointerDown(contentDom, {
      clientX: 96,
      clientY: 180,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: 'mouse',
    });

    act(() => {
      view.dispatch({ selection: { anchor: visibleLineStart, head: visibleLineStart + 6 } });
    });

    const lineBlockSpy = mockVisibleLineAtScroll(view, viewportAnchor);

    act(() => {
      rerender(<CodeMirrorEditor content={content} onChange={vi.fn()} viewMode="source" />);
    });

    expect(view.state.selection.main.anchor).toBe(viewportAnchor);
    expect(view.state.selection.main.from).toBe(view.state.selection.main.to);

    await flushTransitionFrames();

    expect(view.state.selection.main.anchor).toBe(viewportAnchor);
    expect(view.state.selection.main.from).toBe(view.state.selection.main.to);
    lineBlockSpy.mockRestore();
  });

  it('collapses stale edit selection to viewport anchor when entering reading mode, preventing range selection on next click', async () => {
    const content = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join('\n');
    const { view, rerender } = setupEditor(content, 'live');
    const topCaret = content.indexOf('Line 2');
    const bottomViewport = content.indexOf('Line 60');

    // Simulate: user clicked at top in live mode
    act(() => {
      view.dispatch({ selection: { anchor: topCaret } });
    });

    // Simulate: user scrolled to bottom (viewport is now at Line 60)
    const lineBlockSpy = mockVisibleLineAtScroll(view, bottomViewport, 1680);

    // Switch to reading mode — selection must collapse to viewport anchor (bottom)
    act(() => {
      rerender(<CodeMirrorEditor content={content} onChange={vi.fn()} viewMode="reading" />);
    });

    expect(view.state.selection.main.anchor).toBe(bottomViewport);
    expect(view.state.selection.main.from).toBe(view.state.selection.main.to);

    await flushTransitionFrames();

    // The CM selection must NOT be stale at topCaret — it should be at the viewport anchor
    expect(view.state.selection.main.anchor).toBe(bottomViewport);
    expect(view.state.selection.main.from).toBe(view.state.selection.main.to);
    lineBlockSpy.mockRestore();
  });

  it('clears DOM selection when modes change', async () => {
    const content = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join('\n');
    const { container, rerender } = setupEditor(content, 'live');
    const contentDom = container.querySelector('.cm-content');

    if (!(contentDom instanceof HTMLElement)) {
      throw new Error('CodeMirror content DOM not found');
    }

    const firstLine = contentDom.querySelector('.cm-line');
    const walker = firstLine
      ? document.createTreeWalker(firstLine, NodeFilter.SHOW_TEXT)
      : null;
    const firstTextNode = walker?.nextNode();
    if (!(firstTextNode instanceof Text)) {
      throw new Error('Expected first line text node');
    }

    const selection = document.getSelection();
    if (!selection) {
      throw new Error('Document selection is not available');
    }
    const range = document.createRange();
    range.setStart(firstTextNode, 0);
    range.setEnd(firstTextNode, Math.min(4, firstTextNode.textContent?.length ?? 0));
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selection.rangeCount).toBe(1);

    act(() => {
      rerender(<CodeMirrorEditor content={content} onChange={vi.fn()} viewMode="reading" />);
    });

    expect(selection.rangeCount).toBe(0);
  });

  it('falls back to the current viewport when switching between edit modes with an off-screen stale caret', async () => {
    const content = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join('\n');
    const { view, rerender } = setupEditor(content, 'source');
    const staleCaret = content.indexOf('Line 2');
    const visibleLineStart = content.indexOf('Line 40');

    act(() => {
      view.dispatch({ selection: { anchor: staleCaret } });
    });

    const lineBlockSpy = mockVisibleLineAtScroll(view, visibleLineStart);

    act(() => {
      rerender(<CodeMirrorEditor content={content} onChange={vi.fn()} viewMode="live" />);
    });
    await flushTransitionFrames();

    expect(view.state.selection.main.anchor).toBe(visibleLineStart);
    lineBlockSpy.mockRestore();
  });
});
