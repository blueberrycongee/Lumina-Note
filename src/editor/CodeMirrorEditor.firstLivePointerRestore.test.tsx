import { afterEach, describe, expect, it, vi } from 'vitest';
import { suppressStaleSelectionRestoreOnFirstLivePointerDown } from './CodeMirrorEditor';

type TestSelection = {
  from: number;
  to: number;
  anchor: number;
  head: number;
};

function setupView(options?: {
  posAtCoords?: number | null;
  selection?: TestSelection;
  blockFrom?: number;
}) {
  const host = document.createElement('div');
  const contentDOM = document.createElement('div');
  contentDOM.setAttribute('contenteditable', 'true');
  const line = document.createElement('div');
  const text = document.createTextNode('Line 1');
  line.appendChild(text);
  contentDOM.appendChild(line);
  host.appendChild(contentDOM);
  document.body.appendChild(host);

  const selection = document.getSelection();
  if (!selection) {
    throw new Error('Document selection is not available');
  }
  selection.removeAllRanges();
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, Math.min(4, text.textContent?.length ?? 0));
  selection.addRange(range);

  const dispatch = vi.fn();
  const focus = vi.fn();
  const stateSelection = options?.selection ?? { from: 154, to: 948, anchor: 154, head: 948 };
  const view = {
    state: {
      doc: { length: 1200 },
      selection: { main: stateSelection },
    },
    dispatch,
    focus,
    posAtCoords: vi
      .fn()
      .mockReturnValue(options && 'posAtCoords' in options ? options.posAtCoords : 420),
    dom: host,
    contentDOM,
    scrollDOM: { scrollTop: 640 },
    lineBlockAtHeight: vi.fn().mockReturnValue({ from: options?.blockFrom ?? 320 }),
    viewport: { from: 300, to: 900 },
  };

  return { view, dispatch, focus, contentDOM, line, selection };
}

describe('first live pointer restore guard', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    document.body.innerHTML = '';
  });

  it('suppresses stale selection restore for primary clicks inside the editor content DOM', () => {
    const { view, dispatch, focus, line, selection } = setupView();
    const preventDefault = vi.fn();

    const result = suppressStaleSelectionRestoreOnFirstLivePointerDown(view as any, {
      button: 0,
      clientX: 48,
      clientY: 96,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault,
      target: line,
    } as any);

    expect(result).toEqual({
      nextAnchor: 420,
      domRangeCount: 1,
      previousSelection: {
        from: 154,
        to: 948,
        anchor: 154,
        head: 948,
      },
    });
    expect(selection.rangeCount).toBe(0);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      selection: { anchor: 420 },
      scrollIntoView: false,
    });
  });

  it('skips nested contenteditable islands inside the editor', () => {
    const { view, dispatch, focus, contentDOM, selection } = setupView();
    const nestedEditable = document.createElement('div');
    nestedEditable.setAttribute('contenteditable', 'true');
    const nestedText = document.createElement('span');
    nestedEditable.appendChild(nestedText);
    contentDOM.appendChild(nestedEditable);
    const preventDefault = vi.fn();

    const result = suppressStaleSelectionRestoreOnFirstLivePointerDown(view as any, {
      button: 0,
      clientX: 24,
      clientY: 32,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault,
      target: nestedText,
    } as any);

    expect(result).toBe(false);
    expect(selection.rangeCount).toBe(1);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('falls back to the viewport anchor when pointer coordinates do not resolve to a document position', () => {
    const { view, dispatch, line } = setupView({
      posAtCoords: null,
      blockFrom: 512,
      selection: { from: 0, to: 0, anchor: 0, head: 0 },
    });

    const result = suppressStaleSelectionRestoreOnFirstLivePointerDown(view as any, {
      button: 0,
      clientX: 12,
      clientY: 18,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: vi.fn(),
      target: line,
    } as any);

    expect(result).toMatchObject({ nextAnchor: 512, domRangeCount: 1 });
    expect(dispatch).toHaveBeenCalledWith({
      selection: { anchor: 512 },
      scrollIntoView: false,
    });
  });
});
