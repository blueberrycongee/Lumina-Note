import type { Extension } from "@codemirror/state";

export interface EditorSelectionSnapshot {
  from: number;
  to: number;
  text: string;
}

const SELECTION_EVENT = "lumina-editor-selection";

class PluginEditorRuntime {
  private selection: EditorSelectionSnapshot | null = null;
  private extensions = new Map<string, { pluginId: string; extension: Extension }>();
  private applyExtensions: ((extensions: Extension[]) => void) | null = null;

  constructor() {
    window.addEventListener(SELECTION_EVENT, (event: Event) => {
      const detail = (event as CustomEvent<EditorSelectionSnapshot | null>).detail;
      this.selection = detail || null;
    });
  }

  getSelection() {
    return this.selection;
  }

  bindReconfigure(callback: (extensions: Extension[]) => void) {
    this.applyExtensions = callback;
    this.applyExtensions(Array.from(this.extensions.values()).map((item) => item.extension));
    return () => {
      if (this.applyExtensions === callback) {
        this.applyExtensions = null;
      }
    };
  }

  registerExtension(pluginId: string, extension: Extension) {
    const key = `${pluginId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    this.extensions.set(key, { pluginId, extension });
    this.reconfigure();
    return () => {
      this.extensions.delete(key);
      this.reconfigure();
    };
  }

  clearPlugin(pluginId: string) {
    for (const [key, item] of this.extensions.entries()) {
      if (item.pluginId === pluginId) {
        this.extensions.delete(key);
      }
    }
    this.reconfigure();
  }

  private reconfigure() {
    if (!this.applyExtensions) return;
    this.applyExtensions(Array.from(this.extensions.values()).map((item) => item.extension));
  }
}

export const pluginEditorRuntime = new PluginEditorRuntime();
export const PLUGIN_EDITOR_SELECTION_EVENT = SELECTION_EVENT;
