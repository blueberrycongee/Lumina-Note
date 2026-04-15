import { useRef } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionToolbar } from './SelectionToolbar';

vi.mock('@/stores/useAIStore', () => ({
  useAIStore: () => ({ addTextSelection: vi.fn() }),
}));

vi.mock('@/stores/useFileStore', () => ({
  useFileStore: () => ({ currentFile: '/mock/note.md' }),
}));

vi.mock('@/stores/useLocaleStore', () => ({
  useLocaleStore: () => ({
    t: {
      selectionToolbar: {
        addToChat: 'Add to Chat',
        selectionSummary: 'Summary',
        selectionTranslate: 'Translate',
        selectionPolish: 'Polish',
        generateTodo: 'Todo',
        videoNote: 'Video Note',
        summary: 'Summary',
        translate: 'Translate',
        polish: 'Polish',
        todos: 'Todos',
        summaryTitle: 'Summary',
        summaryFailed: 'Summary Failed',
      },
    },
  }),
}));

vi.mock('@/services/llm', () => ({
  callLLM: vi.fn(),
}));

vi.mock('@/services/plugins/editorRuntime', () => ({
  pluginEditorRuntime: {},
}));

function TestHarness({ dragging }: { dragging: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} data-testid="scroll-container" style={{ position: 'relative', width: 800, height: 600 }}>
      <div className={dragging ? 'cm-editor cm-drag-selecting' : 'cm-editor'}>
        <div data-testid="selection-anchor">### 1.2 LLM 职责</div>
      </div>
      <SelectionToolbar containerRef={containerRef} />
    </div>
  );
}

type SelectionMock = {
  isCollapsed: boolean;
  toString: () => string;
  getRangeAt: () => Range;
  removeAllRanges: () => void;
};

function installSelectionMock(anchorNode: Node, text = 'LLM 职责'): SelectionMock {
  const range = {
    commonAncestorContainer: anchorNode,
    getBoundingClientRect: () => ({
      x: 350,
      y: 452,
      top: 452,
      left: 350,
      right: 470,
      bottom: 472,
      width: 120,
      height: 20,
      toJSON: () => ({}),
    }),
  } as unknown as Range;

  const selection: SelectionMock = {
    isCollapsed: false,
    toString: () => text,
    getRangeAt: () => range,
    removeAllRanges: vi.fn(),
  };

  vi.spyOn(window, 'getSelection').mockImplementation(() => selection as unknown as Selection);
  return selection;
}

describe('SelectionToolbar drag guard', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('stays hidden while the editor is actively drag-selecting', async () => {
    const { container, getByTestId } = render(<TestHarness dragging={true} />);
    const scrollContainer = getByTestId('scroll-container');
    const anchor = getByTestId('selection-anchor');
    const textNode = anchor.firstChild;
    if (!textNode) throw new Error('selection anchor text node missing');

    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockImplementation(
      () => ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) }) as DOMRect,
    );
    installSelectionMock(textNode);

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    await waitFor(() => {
      expect(container.querySelector('[data-selection-toolbar]')).toBeNull();
    });
  });

  it('reappears after drag ends when the selection is still valid', async () => {
    const { container, getByTestId, rerender } = render(<TestHarness dragging={true} />);
    const scrollContainer = getByTestId('scroll-container');
    const anchor = getByTestId('selection-anchor');
    const textNode = anchor.firstChild;
    if (!textNode) throw new Error('selection anchor text node missing');

    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockImplementation(
      () => ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) }) as DOMRect,
    );
    installSelectionMock(textNode);

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    await waitFor(() => {
      expect(container.querySelector('[data-selection-toolbar]')).toBeNull();
    });

    rerender(<TestHarness dragging={false} />);

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    await waitFor(() => {
      expect(container.querySelector('[data-selection-toolbar]')).not.toBeNull();
    });
  });
});
