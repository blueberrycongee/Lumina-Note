import { afterEach, describe, expect, it } from 'vitest';

import { clearDragData, getDragData, setDragData, type DragData } from './dragState';

describe('dragState', () => {
  afterEach(() => {
    clearDragData();
  });

  it('stores and clears drag data through the shared helper', () => {
    const dragData: DragData = {
      wikiLink: '[[Note]]',
      filePath: '/tmp/note.md',
      fileName: 'note.md',
      isFolder: false,
      startX: 10,
      startY: 20,
      isDragging: false,
    };

    expect(getDragData()).toBeNull();

    setDragData(dragData);

    expect(getDragData()).toEqual(dragData);

    clearDragData();

    expect(getDragData()).toBeNull();
  });

  it('returns the same object reference so drag lifecycle updates stay observable', () => {
    const dragData: DragData = {
      wikiLink: '',
      filePath: '/tmp/folder',
      fileName: 'folder',
      isFolder: true,
      startX: 1,
      startY: 2,
      isDragging: false,
    };

    setDragData(dragData);

    const shared = getDragData();
    expect(shared).toBe(dragData);

    if (!shared) {
      throw new Error('drag data should exist');
    }

    shared.isDragging = true;

    expect(getDragData()?.isDragging).toBe(true);
  });
});
