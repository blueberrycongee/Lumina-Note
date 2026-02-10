export type PluginStyleLayer = "base" | "theme" | "component" | "override";

const LAYER_ORDER: PluginStyleLayer[] = ["base", "theme", "component", "override"];

export interface PluginStyleInput {
  css: string;
  scopeId?: string;
  global?: boolean;
  layer?: PluginStyleLayer;
}

export interface PluginStyleEntry {
  id: string;
  pluginId: string;
  scopeId?: string;
  global: boolean;
  layer: PluginStyleLayer;
  css: string;
  order: number;
}

export interface PluginStyleConflict {
  selector: string;
  pluginIds: string[];
  entryIds: string[];
}

const STYLE_EVENT = "lumina-plugin-style-runtime-updated";

const selectorRegex = /(^|})\s*([^@][^{]+)\{/g;

const normalizeSelector = (value: string) => value.replace(/\s+/g, " ").trim();

const scopeCss = (css: string, scopeId: string) => {
  const anchor = `[data-lumina-plugin-scope=\"${scopeId}\"]`;
  return css.replace(/(^|})\s*([^@}{][^{]+)\{/g, (_match, close, selectors) => {
    const scoped = String(selectors)
      .split(",")
      .map((selector) => `${anchor} ${selector.trim()}`)
      .join(", ");
    return `${close} ${scoped} {`;
  });
};

class PluginStyleRuntime {
  private seq = 0;
  private entries = new Map<string, PluginStyleEntry>();
  private styleNodes = new Map<string, HTMLStyleElement>();

  registerStyle(pluginId: string, input: PluginStyleInput): () => void {
    const css = String(input.css ?? "").trim();
    if (!css) {
      throw new Error("Style css cannot be empty");
    }

    const layer = input.layer ?? "component";
    const id = `${pluginId}:${Date.now()}:${this.seq++}`;
    const scopedCss =
      input.scopeId && !input.global ? scopeCss(css, input.scopeId.trim()) : css;

    const entry: PluginStyleEntry = {
      id,
      pluginId,
      scopeId: input.scopeId?.trim() || undefined,
      global: Boolean(input.global),
      layer,
      css: scopedCss,
      order: this.seq,
    };
    this.entries.set(id, entry);

    const style = document.createElement("style");
    style.setAttribute("data-lumina-plugin-style", pluginId);
    style.setAttribute("data-lumina-plugin-style-id", id);
    style.setAttribute("data-lumina-plugin-style-layer", layer);
    if (entry.scopeId) {
      style.setAttribute("data-lumina-plugin-scope", entry.scopeId);
    }
    style.textContent = css;
    document.head.appendChild(style);
    this.styleNodes.set(id, style);

    this.reorder();
    this.emitUpdate();

    return () => {
      this.entries.delete(id);
      const node = this.styleNodes.get(id);
      if (node) node.remove();
      this.styleNodes.delete(id);
      this.reorder();
      this.emitUpdate();
    };
  }

  clearPlugin(pluginId: string) {
    for (const [id, entry] of this.entries.entries()) {
      if (entry.pluginId !== pluginId) continue;
      this.entries.delete(id);
      this.styleNodes.get(id)?.remove();
      this.styleNodes.delete(id);
    }
    this.reorder();
    this.emitUpdate();
  }

  clearAll() {
    this.entries.clear();
    for (const node of this.styleNodes.values()) {
      node.remove();
    }
    this.styleNodes.clear();
    this.reorder();
    this.emitUpdate();
  }

  listEntries(): PluginStyleEntry[] {
    return Array.from(this.entries.values()).sort((a, b) => {
      const layerDiff = LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer);
      if (layerDiff !== 0) return layerDiff;
      return a.order - b.order;
    });
  }

  listConflicts(): PluginStyleConflict[] {
    const selectorMap = new Map<string, { pluginIds: Set<string>; entryIds: Set<string> }>();
    for (const entry of this.entries.values()) {
      const matches = Array.from(entry.css.matchAll(selectorRegex));
      for (const match of matches) {
        const raw = match[2] || "";
        const selector = normalizeSelector(raw);
        if (!selector) continue;
        let row = selectorMap.get(selector);
        if (!row) {
          row = { pluginIds: new Set(), entryIds: new Set() };
          selectorMap.set(selector, row);
        }
        row.pluginIds.add(entry.pluginId);
        row.entryIds.add(entry.id);
      }
    }

    const conflicts: PluginStyleConflict[] = [];
    for (const [selector, row] of selectorMap.entries()) {
      if (row.entryIds.size <= 1) continue;
      conflicts.push({
        selector,
        pluginIds: Array.from(row.pluginIds),
        entryIds: Array.from(row.entryIds),
      });
    }
    return conflicts.sort((a, b) => b.pluginIds.length - a.pluginIds.length);
  }

  private reorder() {
    const ordered = this.listEntries();
    for (const entry of ordered) {
      const node = this.styleNodes.get(entry.id);
      if (!node) continue;
      document.head.appendChild(node);
    }
  }

  private emitUpdate() {
    window.dispatchEvent(
      new CustomEvent(STYLE_EVENT, {
        detail: {
          entries: this.listEntries(),
          conflicts: this.listConflicts(),
        },
      }),
    );
  }
}

export const pluginStyleRuntime = new PluginStyleRuntime();
export const PLUGIN_STYLE_RUNTIME_EVENT = STYLE_EVENT;
