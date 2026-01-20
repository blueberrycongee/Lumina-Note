import { beforeEach, describe, expect, it } from "vitest";
import {
  useTypesettingDocStore,
  TypesettingDoc,
} from "@/stores/useTypesettingDocStore";
import { DocxBlock } from "@/typesetting/docxImport";

const buildDoc = (path: string, overrides: Partial<TypesettingDoc> = {}): TypesettingDoc => ({
  path,
  blocks: [{ type: "paragraph", runs: [{ text: "" }] } as DocxBlock],
  headerBlocks: [],
  footerBlocks: [],
  relationships: {},
  media: {},
  isDirty: false,
  styleRefs: {},
  ...overrides,
});

describe("useTypesettingDocStore", () => {
  beforeEach(() => {
    useTypesettingDocStore.setState({ docs: {} });
  });

  it("updates layout cache without marking the doc dirty", () => {
    const path = "C:/vault/report.docx";
    useTypesettingDocStore.setState({
      docs: {
        [path]: buildDoc(path),
      },
    });

    const cache = {
      lineCount: 12,
      updatedAt: "2026-01-20T10:00:00Z",
    };

    useTypesettingDocStore.getState().updateLayoutCache(path, cache);

    const doc = useTypesettingDocStore.getState().docs[path];
    expect(doc?.layoutCache).toEqual(cache);
    expect(doc?.isDirty).toBe(false);
  });

  it("merges style refs for existing docs", () => {
    const path = "C:/vault/report.docx";
    useTypesettingDocStore.setState({
      docs: {
        [path]: buildDoc(path, {
          styleRefs: { paragraphStyleId: "p1" },
        }),
      },
    });

    useTypesettingDocStore.getState().updateStyleRefs(path, { fontStyleId: "f1" });

    const doc = useTypesettingDocStore.getState().docs[path];
    expect(doc?.styleRefs).toEqual({ paragraphStyleId: "p1", fontStyleId: "f1" });
  });

  it("ignores style ref updates for missing docs", () => {
    const before = useTypesettingDocStore.getState().docs;
    useTypesettingDocStore.getState().updateStyleRefs("missing.docx", {
      pageStyleId: "page1",
    });
    expect(useTypesettingDocStore.getState().docs).toEqual(before);
  });
});
