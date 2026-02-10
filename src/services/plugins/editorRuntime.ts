export interface EditorSelectionSnapshot {
  from: number;
  to: number;
  text: string;
}

const SELECTION_EVENT = "lumina-editor-selection";

class PluginEditorRuntime {
  private selection: EditorSelectionSnapshot | null = null;

  constructor() {
    window.addEventListener(SELECTION_EVENT, (event: Event) => {
      const detail = (event as CustomEvent<EditorSelectionSnapshot | null>).detail;
      this.selection = detail || null;
    });
  }

  getSelection() {
    return this.selection;
  }
}

export const pluginEditorRuntime = new PluginEditorRuntime();
export const PLUGIN_EDITOR_SELECTION_EVENT = SELECTION_EVENT;
