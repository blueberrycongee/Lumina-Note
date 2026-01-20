import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TypesettingDocumentPane } from "@/components/typesetting/TypesettingDocumentPane";
import {
  TypesettingDoc,
  useTypesettingDocStore,
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

describe("TypesettingDocumentPane", () => {
  beforeEach(() => {
    useTypesettingDocStore.setState({ docs: {} });
  });

  it("stores layout cache after a layout run", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T12:00:00Z"));

    const path = "C:/vault/report.docx";
    useTypesettingDocStore.setState({
      docs: {
        [path]: buildDoc(path, {
          blocks: [{ type: "paragraph", runs: [{ text: "Hello world" }] } as DocxBlock],
        }),
      },
    });

    render(<TypesettingDocumentPane path={path} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() => {
      const doc = useTypesettingDocStore.getState().docs[path];
      expect(doc?.layoutCache).toEqual({
        lineCount: 2,
        updatedAt: "2026-01-20T12:00:00.000Z",
      });
    });

    vi.useRealTimers();
  });
});
