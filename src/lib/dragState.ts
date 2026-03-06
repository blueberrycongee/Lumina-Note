export type DragData = {
  wikiLink: string;
  filePath: string;
  fileName: string;
  isFolder: boolean;
  startX: number;
  startY: number;
  isDragging: boolean;
};

type LuminaWindow = Window & {
  __lumina_drag_data?: DragData | null;
};

function getLuminaWindow(): LuminaWindow | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window as LuminaWindow;
}

export function getDragData(): DragData | null {
  return getLuminaWindow()?.__lumina_drag_data ?? null;
}

export function setDragData(dragData: DragData | null): void {
  const luminaWindow = getLuminaWindow();
  if (!luminaWindow) {
    return;
  }

  luminaWindow.__lumina_drag_data = dragData;
}

export function clearDragData(): void {
  setDragData(null);
}
