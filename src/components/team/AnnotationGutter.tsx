import { gutter, GutterMarker } from '@codemirror/view';
import { RangeSet, type Range } from '@codemirror/state';
import type { AnnotationDetail } from '@/services/team/types';

class AnnotationMarker extends GutterMarker {
  constructor(private count: number) {
    super();
  }

  toDOM() {
    const el = document.createElement('div');
    el.className = 'annotation-marker';
    el.textContent = '\u{1F4AC}';
    el.title = `${this.count} annotation(s)`;
    el.style.cssText =
      'cursor: pointer; font-size: 12px; line-height: 1; opacity: 0.7; text-align: center;';
    return el;
  }
}

/**
 * Creates a CodeMirror 6 gutter extension that shows markers on lines
 * that have unresolved annotations.
 */
export function createAnnotationGutter(annotations: AnnotationDetail[]) {
  return gutter({
    class: 'cm-annotation-gutter',
    markers: (view) => {
      const lineMap = new Map<number, number>(); // lineStart -> count

      for (const ann of annotations) {
        if (ann.resolved) continue;
        const clampedPos = Math.min(ann.range_start, view.state.doc.length);
        const line = view.state.doc.lineAt(clampedPos);
        const count = lineMap.get(line.from) ?? 0;
        lineMap.set(line.from, count + 1);
      }

      const markers: Range<GutterMarker>[] = [];
      for (const [pos, count] of lineMap) {
        markers.push(new AnnotationMarker(count).range(pos));
      }

      return RangeSet.of(markers, true);
    },
  });
}
