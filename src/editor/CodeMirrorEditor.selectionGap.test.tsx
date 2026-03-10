import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { mouseSelectingField } from 'codemirror-live-markdown';
import { CodeMirrorEditor } from './CodeMirrorEditor';

function setupEditor(content: string, viewMode: 'live' | 'reading' = 'live') {
  const onChange = vi.fn();
  const { container } = render(
    <CodeMirrorEditor content={content} onChange={onChange} viewMode={viewMode} />,
  );
  const editor = container.querySelector('.cm-editor');
  if (!editor) {
    throw new Error('CodeMirror editor root not found');
  }
  const view = EditorView.findFromDOM(editor as HTMLElement);
  if (!view) {
    throw new Error('EditorView instance not found');
  }
  return { container, view };
}

describe('CodeMirror live selection gap bridge', () => {
  afterEach(() => {
    cleanup();
  });

  it('adds selection gap highlight for header spacing', () => {
    const { container, view } = setupEditor('## Heading');
    act(() => {
      view.dispatch({ selection: { anchor: 3, head: 10 } });
    });
    const gap = container.querySelector('.cm-selection-gap');
    expect(gap).not.toBeNull();
    expect(gap?.textContent).toBe(' ');
  });

  it('adds selection bridge for inline formatting marks', () => {
    const { container, view } = setupEditor('**bold**');
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 8 } });
    });
    const markers = Array.from(container.querySelectorAll('.cm-selection-bridge')).filter(
      (el) => el.textContent === '**',
    );
    expect(markers.length).toBeGreaterThanOrEqual(2);
  });

  it('does not add selection gap when selection is empty', () => {
    const { container, view } = setupEditor('## Heading\n\n**bold**');
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });
    expect(container.querySelector('.cm-selection-gap')).toBeNull();
    expect(container.querySelector('.cm-selection-bridge')).toBeNull();
  });

  it('does not mark single click as drag selection', () => {
    const { view } = setupEditor('Line 1\nLine 2');
    const ownerDoc = view.dom.ownerDocument as Document & {
      elementFromPoint?: (x: number, y: number) => Element | null;
    };
    const root = view.root as Document | ShadowRoot;
    const rootWithPoint = root as Document & {
      elementFromPoint?: (x: number, y: number) => Element | null;
    };
    const prevDocElementFromPoint = ownerDoc.elementFromPoint;
    const prevRootElementFromPoint = rootWithPoint.elementFromPoint;
    const prevGetClientRects = Range.prototype.getClientRects;
    const prevGetBoundingClientRect = Range.prototype.getBoundingClientRect;
    ownerDoc.elementFromPoint = () => view.contentDOM;
    rootWithPoint.elementFromPoint = () => view.contentDOM;
    Range.prototype.getClientRects = function () {
      return [] as unknown as DOMRectList;
    };
    Range.prototype.getBoundingClientRect = function () {
      return new DOMRect(0, 0, 0, 0);
    };
    const down = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      button: 0,
    });
    try {
      act(() => {
        view.contentDOM.dispatchEvent(down);
      });
      expect(view.state.field(mouseSelectingField, false)).toBe(false);
    } finally {
      ownerDoc.elementFromPoint = prevDocElementFromPoint;
      rootWithPoint.elementFromPoint = prevRootElementFromPoint;
      Range.prototype.getClientRects = prevGetClientRects;
      Range.prototype.getBoundingClientRect = prevGetBoundingClientRect;
    }
  });

  it('selects full document on beforeinput selectAll', () => {
    const { view } = setupEditor('Line 1\nLine 2\nLine 3');
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });
    const event = new Event('beforeinput', { bubbles: true, cancelable: true }) as InputEvent;
    Object.defineProperty(event, 'inputType', { value: 'selectAll' });
    act(() => {
      view.contentDOM.dispatchEvent(event);
    });
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(view.state.doc.length);
  });

  it('selects full document on Mod-A keydown', () => {
    const { view } = setupEditor('Alpha\nBeta\nGamma');
    act(() => {
      view.dispatch({ selection: { anchor: 2, head: 2 } });
    });
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      view.contentDOM.dispatchEvent(event);
    });
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(view.state.doc.length);
  });

  it('selects full document in reading mode when Mod-A crosses a code block', () => {
    const content = 'Before\n\n```js\nconst token = 1;\n```\nAfter';
    const { container, view } = setupEditor(content, 'reading');
    act(() => {
      view.dispatch({ selection: { anchor: 2, head: 2 } });
    });
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      view.contentDOM.dispatchEvent(event);
    });
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(view.state.doc.length);
    expect(view.state.sliceDoc(0, view.state.doc.length)).toContain('const token = 1;');
    expect(container.querySelector('.cm-codeblock-widget')).toBeNull();
  });

  it('does not upgrade viewport-covering selection to full document without select-all intent', () => {
    const content = Array.from({ length: 120 }, (_, i) => `Line ${i + 1} - sample text`).join('\n');
    const { container, view } = setupEditor(content);
    const contentDom = container.querySelector('.cm-content');
    if (!contentDom) {
      throw new Error('CodeMirror content DOM not found');
    }

    const lines = Array.from(contentDom.querySelectorAll('.cm-line'));
    let targetNode: Text | null = null;
    let targetOffset = 0;
    for (const line of lines) {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode() as Text | null;
      if (!textNode) continue;
      let pos = -1;
      try {
        pos = view.posAtDOM(textNode, textNode.textContent?.length ?? 0);
      } catch {
        continue;
      }
      if (pos >= view.viewport.to && pos < view.state.doc.length) {
        targetNode = textNode;
        targetOffset = textNode.textContent?.length ?? 0;
        break;
      }
    }

    if (!targetNode) {
      throw new Error('Failed to find a DOM range that covers viewport without full document');
    }

    const firstLine = lines[0];
    const firstWalker = document.createTreeWalker(firstLine, NodeFilter.SHOW_TEXT);
    const firstTextNode = firstWalker.nextNode() as Text | null;
    if (!firstTextNode) {
      throw new Error('First line text node not found');
    }

    const selection = document.getSelection();
    if (!selection) {
      throw new Error('Document selection is not available');
    }

    const range = document.createRange();
    range.setStart(firstTextNode, 0);
    range.setEnd(targetNode, targetOffset);

    act(() => {
      view.focus();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBeLessThan(view.state.doc.length);
  });

  it('enables drawSelection layer for select-all', () => {
    const { container, view } = setupEditor('Line 1\nLine 2\nLine 3');
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    });
    expect(container.querySelector('.cm-selectionLayer')).not.toBeNull();
  });

  function getCodeBlockEditableIndicatorCount(container: HTMLElement) {
    return container.querySelectorAll(
      '.cm-lumina-codeblock-open, .cm-lumina-codeblock-content-line, .cm-lumina-codeblock-close',
    ).length;
  }

  function getCodeBlockSourceLineCount(container: HTMLElement) {
    return container.querySelectorAll('.cm-codeblock-source').length;
  }

  it('keeps code block editable when selection only touches its boundary', () => {
    const content = '## JSON\n```json\n{"name":"demo"}\n```';
    const { container, view } = setupEditor(content);

    // Select heading line including newline; selection end equals code fence start.
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 8 } });
    });

    expect(getCodeBlockSourceLineCount(container)).toBe(0);
  });

  it('keeps code block in preview when selection crosses only into the fence', () => {
    const content = '## JSON\n```json\n{"name":"demo"}\n```';
    const { container, view } = setupEditor(content);

    // Slightly overshoot from heading into the first fence char.
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 9 } });
    });

    expect(getCodeBlockSourceLineCount(container)).toBe(0);
  });

  it('keeps code content editable when caret is inside', () => {
    const content = '## JSON\n```json\n{"name":"demo"}\n```';
    const { container, view } = setupEditor(content);

    // Place caret inside fenced code content.
    act(() => {
      view.dispatch({ selection: { anchor: 17, head: 17 } });
    });

    expect(getCodeBlockEditableIndicatorCount(container)).toBeGreaterThan(0);
  });

  it('renders code block UI without external margin utility classes', () => {
    const content = '```json\n{"name":"demo"}\n```';
    const { container } = setupEditor(content);
    const codeBlockUi = container.querySelector(
      '.cm-lumina-codeblock-open, .cm-codeblock-header, .cm-codeblock-widget',
    );
    const sourceLines = container.querySelectorAll('.cm-codeblock-source');
    expect(Boolean(codeBlockUi) || sourceLines.length > 0).toBe(true);
    if (codeBlockUi) {
      expect((codeBlockUi as HTMLElement).className.includes('my-2')).toBe(false);
    }
  });

  it('keeps list and quote marks visible when another line is active', () => {
    const content = 'Paragraph\n- item\n> quote\n# heading';
    const { container, view } = setupEditor(content);

    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });

    const visibleBlockTexts = Array.from(
      container.querySelectorAll('.cm-formatting-block.cm-formatting-block-visible'),
    ).map((el) => el.textContent ?? '');

    expect(visibleBlockTexts.some((text) => text.includes('-'))).toBe(true);
    expect(visibleBlockTexts.some((text) => text.includes('>'))).toBe(true);
  });

  it('adds mark decoration for selection inside code block content', () => {
    const content = '```javascript\nconsole.log("hi")\n```';
    const { container, view } = setupEditor(content);

    // Select inside the code block content
    const codeStart = content.indexOf('console');
    const codeEnd = content.indexOf(')\n```');
    act(() => {
      view.dispatch({ selection: { anchor: codeStart, head: codeEnd } });
    });

    // Keep assertion behavioral: selection should stay inside code block content
    // and editor should expose code-block selection/source decorations.
    const main = view.state.selection.main;
    expect(main.from).toBe(codeStart);
    expect(main.to).toBe(codeEnd);

    const sourceLines = container.querySelectorAll('.cm-codeblock-source');
    const liveContent = container.querySelectorAll('.cm-lumina-codeblock-content-line');
    expect(sourceLines.length).toBe(0);
    expect(liveContent.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps heading mark collapsed when heading line is not active', () => {
    const content = 'Paragraph\n# Heading';
    const { container, view } = setupEditor(content);

    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });

    const headingMark = Array.from(container.querySelectorAll('.cm-formatting-block')).find((el) =>
      (el.textContent ?? '').includes('#'),
    );

    expect(headingMark).toBeDefined();
    expect(headingMark?.classList.contains('cm-formatting-block-visible')).toBe(false);
  });
});
