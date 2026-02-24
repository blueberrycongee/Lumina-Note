import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { CodeMirrorEditor } from "@/editor/CodeMirrorEditor";

const buildContent = (lines: number) =>
  Array.from({ length: lines }, (_, i) => `Line ${i + 1} - lorem ipsum dolor sit amet.`).join("\n");

function SelectAllE2E() {
  const initial = useMemo(() => buildContent(400), []);
  const [content, setContent] = useState(initial);

  useEffect(() => {
    const editor = document.querySelector(".cm-editor") as HTMLElement | null;
    if (!editor) return;
    const view = EditorView.findFromDOM(editor);
    (window as typeof window & { __cmView?: EditorView }).__cmView = view ?? undefined;
  }, []);

  return (
    <div style={{ height: "100%", display: "flex" }}>
      <CodeMirrorEditor content={content} onChange={setContent} viewMode="live" />
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<SelectAllE2E />);
}
