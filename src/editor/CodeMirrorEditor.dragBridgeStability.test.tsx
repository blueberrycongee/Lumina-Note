import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { setMouseSelecting } from 'codemirror-live-markdown';
import { CodeMirrorEditor } from './CodeMirrorEditor';

function setupEditor(content: string, viewMode: 'live' | 'reading' | 'source' = 'live') {
  const onChange = vi.fn();
  const { container } = render(
    <CodeMirrorEditor content={content} onChange={onChange} viewMode={viewMode} />,
  );
  const editor = container.querySelector('.cm-editor');
  if (!editor) throw new Error('CodeMirror editor root not found');
  const view = EditorView.findFromDOM(editor as HTMLElement);
  if (!view) throw new Error('EditorView instance not found');
  return { container, view, onChange };
}

describe('Drag selection bridge stability', () => {
  afterEach(() => {
    cleanup();
  });

  // === Fix #4: Bridge decorations persist during drag ===

  it('maintains block bridge decorations during drag selection', () => {
    const { container, view } = setupEditor('## Heading\nParagraph text');
    // Simulate drag: set mouseSelecting to true, then select
    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(true) });
      view.dispatch({ selection: { anchor: 0, head: 20 } });
    });
    const bridges = container.querySelectorAll('.cm-selection-bridge');
    expect(bridges.length).toBeGreaterThan(0);
  });

  it('maintains inline bridge decorations during drag selection over bold text', () => {
    const { container, view } = setupEditor('normal **bold** text');
    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(true) });
      view.dispatch({ selection: { anchor: 0, head: 19 } });
    });
    const bridges = Array.from(container.querySelectorAll('.cm-selection-bridge'));
    const boldBridges = bridges.filter((el) => el.textContent === '**');
    expect(boldBridges.length).toBeGreaterThanOrEqual(2);
  });

  it('maintains inline bridge decorations during drag over italic text', () => {
    const { container, view } = setupEditor('some *italic* words');
    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(true) });
      view.dispatch({ selection: { anchor: 0, head: 19 } });
    });
    const bridges = Array.from(container.querySelectorAll('.cm-selection-bridge'));
    const italicBridges = bridges.filter((el) => el.textContent === '*');
    expect(italicBridges.length).toBeGreaterThanOrEqual(2);
  });

  it('maintains bridge decorations for strikethrough during drag', () => {
    const { container, view } = setupEditor('text ~~deleted~~ more');
    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(true) });
      view.dispatch({ selection: { anchor: 0, head: 20 } });
    });
    const bridges = Array.from(container.querySelectorAll('.cm-selection-bridge'));
    const strikeBridges = bridges.filter((el) => el.textContent === '~~');
    expect(strikeBridges.length).toBeGreaterThanOrEqual(2);
  });

  it('does not produce bridge decorations during drag when selection is empty', () => {
    const { container, view } = setupEditor('## Heading\n**bold**');
    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(true) });
      view.dispatch({ selection: { anchor: 5, head: 5 } });
    });
    expect(container.querySelector('.cm-selection-bridge')).toBeNull();
    expect(container.querySelector('.cm-selection-gap')).toBeNull();
  });

  it('clears bridge decorations when drag ends with collapsed selection', () => {
    const { container, view } = setupEditor('## Heading\n**bold**');
    // Start drag with selection
    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(true) });
      view.dispatch({ selection: { anchor: 0, head: 18 } });
    });
    expect(container.querySelectorAll('.cm-selection-bridge').length).toBeGreaterThan(0);
    // End drag, collapse selection
    act(() => {
      view.dispatch({ selection: { anchor: 5, head: 5 } });
      view.dispatch({ effects: setMouseSelecting.of(false) });
    });
    expect(container.querySelector('.cm-selection-bridge')).toBeNull();
  });

  // === Fix #5: Inline marks bridged during drag regardless of shouldShowSource ===

  it('bridges inline marks even when cursor was not near them before drag', () => {
    const { container, view } = setupEditor('Line one\n**bold line**\nLine three');
    // Position cursor away from bold marks
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });
    // Start drag and select across bold
    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(true) });
      view.dispatch({ selection: { anchor: 0, head: 30 } });
    });
    const bridges = Array.from(container.querySelectorAll('.cm-selection-bridge'));
    const boldBridges = bridges.filter((el) => el.textContent === '**');
    expect(boldBridges.length).toBeGreaterThanOrEqual(2);
  });

  // === Fix #6: Reading mode bridge decorations ===

  it('adds block bridge decorations in reading mode', () => {
    const { container, view } = setupEditor('## Heading\nParagraph', 'reading');
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 20 } });
    });
    const bridges = container.querySelectorAll('.cm-selection-bridge');
    expect(bridges.length).toBeGreaterThan(0);
  });

  it('adds inline bridge decorations for bold in reading mode', () => {
    const { container, view } = setupEditor('text **bold** more', 'reading');
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 17 } });
    });
    const bridges = Array.from(container.querySelectorAll('.cm-selection-bridge'));
    const boldBridges = bridges.filter((el) => el.textContent === '**');
    expect(boldBridges.length).toBeGreaterThanOrEqual(2);
  });

  it('adds gap decoration for list marks in reading mode', () => {
    const { container, view } = setupEditor('- item one\n- item two', 'reading');
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 21 } });
    });
    const gaps = container.querySelectorAll('.cm-selection-gap');
    expect(gaps.length).toBeGreaterThan(0);
  });

  it('has no bridge decorations in reading mode without selection', () => {
    const { container, view } = setupEditor('## Heading\n**bold**', 'reading');
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });
    expect(container.querySelector('.cm-selection-bridge')).toBeNull();
  });

  // === Fix #2: Selection event text extraction optimization ===

  it('dispatches selection event without text during drag start', () => {
    const { view } = setupEditor('Hello World');
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('lumina-editor-selection', handler);
    try {
      act(() => {
        view.dispatch({ selection: { anchor: 0, head: 5 } });
      });
      // Normal selection should include text
      const normalEvent = events.find((e) => e.detail?.text === 'Hello');
      expect(normalEvent).toBeDefined();

      events.length = 0;
      // Drag start
      act(() => {
        view.dispatch({ effects: setMouseSelecting.of(true) });
      });
      // Drag start event should have empty text (optimization)
      const dragStartEvent = events[events.length - 1];
      if (dragStartEvent?.detail) {
        expect(dragStartEvent.detail.text).toBe('');
      }
    } finally {
      window.removeEventListener('lumina-editor-selection', handler);
    }
  });

  // === Edge cases: mixed formatting ===

  it('bridges multiple formatting types in same selection during drag', () => {
    const content = '## Heading\n**bold** and *italic*';
    const { container, view } = setupEditor(content);
    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(true) });
      view.dispatch({ selection: { anchor: 0, head: content.length } });
    });
    const bridges = Array.from(container.querySelectorAll('.cm-selection-bridge'));
    // Should have bridges for: ## (header), ** (bold x2), * (italic x2)
    expect(bridges.length).toBeGreaterThanOrEqual(3);
  });

  it('does not bridge formatting marks inside code blocks', () => {
    const content = '```\n**not bold**\n```';
    const { container, view } = setupEditor(content);
    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(true) });
      view.dispatch({ selection: { anchor: 0, head: content.length } });
    });
    // ** inside code block should NOT be bridged
    const bridges = Array.from(container.querySelectorAll('.cm-selection-bridge'));
    const boldBridges = bridges.filter((el) => el.textContent === '**');
    expect(boldBridges.length).toBe(0);
  });

  // === Fix #7: Drag end state cleanup ===

  it('removes cm-drag-selecting class after drag ends', () => {
    const { view } = setupEditor('Some text');
    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(true) });
    });
    expect(view.dom.classList.contains('cm-drag-selecting')).toBe(true);
    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(false) });
    });
    expect(view.dom.classList.contains('cm-drag-selecting')).toBe(false);
  });
});
