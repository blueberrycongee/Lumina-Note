import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeBinaryFile } from "@/lib/tauri";
import {
  useTypesettingDocStore,
  TypesettingDoc,
} from "@/stores/useTypesettingDocStore";
import { DocxBlock } from "@/typesetting/docxImport";
import type { DocOp } from "@/typesetting/docOps";

vi.mock("@/lib/tauri", () => ({
  readBinaryFileBase64: vi.fn(),
  writeBinaryFile: vi.fn(),
}));

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

  it("exports docx without clearing dirty state", async () => {
    const path = "C:/vault/report.docx";
    const targetPath = "C:/vault/report-export.docx";
    useTypesettingDocStore.setState({
      docs: {
        [path]: buildDoc(path, {
          blocks: [{ type: "paragraph", runs: [{ text: "Draft" }] } as DocxBlock],
          isDirty: true,
        }),
      },
    });

    const writeMock = vi.mocked(writeBinaryFile);
    writeMock.mockResolvedValueOnce(undefined);

    await useTypesettingDocStore.getState().exportDocx(path, targetPath);

    expect(writeMock).toHaveBeenCalledTimes(1);
    const [writtenPath, payload] = writeMock.mock.calls[0] as [string, Uint8Array];
    expect(writtenPath).toBe(targetPath);
    expect(payload).toBeInstanceOf(Uint8Array);
    expect(payload.length).toBeGreaterThan(0);
    expect(useTypesettingDocStore.getState().docs[path]?.isDirty).toBe(true);
  });

  it("records the latest document op without marking dirty", () => {
    const path = "C:/vault/report.docx";
    useTypesettingDocStore.setState({
      docs: {
        [path]: buildDoc(path),
      },
    });

    const op: DocOp = { type: "insert_text", text: "Hi" };
    useTypesettingDocStore.getState().recordDocOp(path, op);

    const doc = useTypesettingDocStore.getState().docs[path];
    expect(doc?.lastOp).toEqual(op);
    expect(doc?.isDirty).toBe(false);
  });
});
