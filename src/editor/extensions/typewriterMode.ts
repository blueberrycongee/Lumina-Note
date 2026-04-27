/**
 * Typewriter / focus mode for the live-markdown editor.
 *
 * Two independent toggles, both off by default:
 *
 *   typewriter — auto-scrolls so the line containing the caret stays at
 *                ~50% of the editor viewport height. Per-keystroke,
 *                instant (no smooth-scroll: smooth lags behind typing
 *                and feels seasick).
 *
 *   focus      — dims every line in the document except those inside
 *                the active block (paragraph / heading / list-item /
 *                blockquote / fenced-code / table). Soft 200ms opacity
 *                transition; non-active opacity 0.35.
 *
 * Composable: typewriter without focus is the iA Writer feel;
 * focus without typewriter is the Ulysses focus pane.
 *
 * The plugin is registered via a CodeMirror Compartment so toggling
 * either flag reconfigures cheaply without re-initialising the view.
 */

import { Facet } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { mouseSelectingField } from "codemirror-live-markdown";

export const typewriterEnabledFacet = Facet.define<boolean, boolean>({
  combine: (values) => values.length > 0 && values[values.length - 1],
});

export const focusEnabledFacet = Facet.define<boolean, boolean>({
  combine: (values) => values.length > 0 && values[values.length - 1],
});

const ACTIVE_BLOCK_TYPES = new Set([
  "Paragraph",
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
  "SetextHeading1",
  "SetextHeading2",
  "ListItem",
  "Blockquote",
  "FencedCode",
  "CodeBlock",
  "Table",
  "HTMLBlock",
]);

interface ActiveBlockRange {
  from: number;
  to: number;
}

function findActiveBlockRange(
  state: EditorView["state"],
  pos: number,
): ActiveBlockRange | null {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, -1);
  while (node) {
    if (ACTIVE_BLOCK_TYPES.has(node.type.name)) {
      return { from: node.from, to: node.to };
    }
    if (!node.parent) break;
    node = node.parent;
  }
  // Fallback: the line the caret is on. Better than no decoration.
  const line = state.doc.lineAt(pos);
  return { from: line.from, to: line.to };
}

const activeBlockMark = Decoration.line({ class: "cm-typewriter-active" });

class TypewriterPlugin {
  decorations: DecorationSet;
  private lastActiveRange: ActiveBlockRange | null = null;
  private lastFocusEnabled = false;
  private lastTypewriterEnabled = false;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
    // `coordsAtPos` reads layout, which CM forbids during the construction
    // transaction. Defer the initial centering scroll into the next measure
    // pass so the plugin doesn't crash on instantiation (which previously
    // tore the whole plugin down — no decorations, no host class, nothing).
    if (view.state.facet(typewriterEnabledFacet)) {
      view.requestMeasure({
        read: () => null,
        write: () => {
          this.scrollIfNeeded(view, view.state.selection.main.head, true);
        },
      });
    }
  }

  update(update: ViewUpdate) {
    const focusEnabled = update.state.facet(focusEnabledFacet);
    const typewriterEnabled = update.state.facet(typewriterEnabledFacet);

    const facetChanged =
      focusEnabled !== this.lastFocusEnabled ||
      typewriterEnabled !== this.lastTypewriterEnabled;
    this.lastFocusEnabled = focusEnabled;
    this.lastTypewriterEnabled = typewriterEnabled;

    // Skip work mid-drag — the live-preview plugin uses the same gate.
    const isDragging =
      update.state.field(mouseSelectingField, false) ?? false;

    if (focusEnabled) {
      const head = update.state.selection.main.head;
      const newRange = findActiveBlockRange(update.state, head);
      const rangeChanged =
        !this.lastActiveRange ||
        newRange?.from !== this.lastActiveRange.from ||
        newRange?.to !== this.lastActiveRange.to;
      if (
        facetChanged ||
        rangeChanged ||
        update.docChanged ||
        update.viewportChanged
      ) {
        this.decorations = this.buildDecorations(update.view);
        this.lastActiveRange = newRange;
      }
    } else if (this.decorations.size > 0) {
      this.decorations = Decoration.none;
      this.lastActiveRange = null;
    }

    if (typewriterEnabled && !isDragging && (update.selectionSet || facetChanged)) {
      this.scrollIfNeeded(
        update.view,
        update.state.selection.main.head,
        facetChanged,
      );
    }
  }

  private buildDecorations(view: EditorView): DecorationSet {
    const focusEnabled = view.state.facet(focusEnabledFacet);
    if (!focusEnabled) return Decoration.none;
    const head = view.state.selection.main.head;
    const range = findActiveBlockRange(view.state, head);
    if (!range) return Decoration.none;

    const ranges: { from: number; deco: typeof activeBlockMark }[] = [];
    const startLine = view.state.doc.lineAt(range.from);
    const endLine = view.state.doc.lineAt(range.to);
    for (let n = startLine.number; n <= endLine.number; n++) {
      const line = view.state.doc.line(n);
      ranges.push({ from: line.from, deco: activeBlockMark });
    }
    return Decoration.set(
      ranges.map((r) => r.deco.range(r.from)),
      true,
    );
  }

  private scrollIfNeeded(view: EditorView, head: number, force: boolean) {
    const coords = view.coordsAtPos(head);
    if (!coords) return;
    const scroller = view.scrollDOM;
    const rect = scroller.getBoundingClientRect();
    const cursorY = coords.top - rect.top + scroller.scrollTop;
    const target = cursorY - scroller.clientHeight / 2;
    // Don't fight tiny natural scroll — only intervene when off by more
    // than 8px (or when toggling on, where `force` is true).
    if (force || Math.abs(scroller.scrollTop - target) > 8) {
      scroller.scrollTo({ top: Math.max(0, target) });
    }
  }

  destroy() {
    // Host classes live on EditorView.editorAttributes (facet-driven), so they
    // disappear automatically when the plugin is removed via reconfigure.
  }
}

export const typewriterPlugin = ViewPlugin.fromClass(TypewriterPlugin, {
  decorations: (v) => v.decorations,
});

export function typewriterExtensions(typewriter: boolean, focus: boolean) {
  // Host classes go through EditorView.editorAttributes — directly mutating
  // view.dom.classList from the plugin doesn't survive CodeMirror's own
  // attribute reconciliation, so the styles never visibly applied. Facet-
  // driven attributes are merged by CM and stay in sync with reconfigures.
  const hostClasses: string[] = [];
  if (typewriter) hostClasses.push("cm-typewriter-on");
  if (focus) hostClasses.push("cm-focus-on");
  return [
    typewriterEnabledFacet.of(typewriter),
    focusEnabledFacet.of(focus),
    hostClasses.length > 0
      ? EditorView.editorAttributes.of({ class: hostClasses.join(" ") })
      : [],
    // Plugin is always registered when this extension set is applied;
    // the facets gate its behaviour. Compartment reconfiguration
    // re-runs `update` with the new facet values, which the plugin
    // notices via `facetChanged`.
    typewriter || focus ? [typewriterPlugin] : [],
    // Padding so the last lines of a doc can actually reach centre when
    // typewriter mode is on. Apply via host class so we don't widen
    // the click target when off.
    EditorView.theme({
      "&.cm-typewriter-on .cm-content": {
        paddingTop: "30vh",
        paddingBottom: "50vh",
      },
    }),
  ];
}
