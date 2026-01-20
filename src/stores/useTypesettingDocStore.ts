import { create } from "zustand";
import { readBinaryFileBase64, writeBinaryFile } from "@/lib/tauri";
import {
  parseDocxDocumentXml,
  parseDocxHeaderFooterXml,
  DocxBlock,
} from "@/typesetting/docxImport";
import {
  buildDocxDocumentXml,
  buildDocxHeaderXml,
  buildDocxFooterXml,
} from "@/typesetting/docxExport";
import { decodeBase64ToBytes } from "@/typesetting/base64";
import { buildDocxPackage, parseDocxPackage } from "@/typesetting/docxPackage";

export type TypesettingDoc = {
  path: string;
  blocks: DocxBlock[];
  headerBlocks: DocxBlock[];
  footerBlocks: DocxBlock[];
  relationships: Record<string, string>;
  media: Record<string, Uint8Array>;
  isDirty: boolean;
  styleRefs: TypesettingStyleRefs;
  layoutSummary?: string;
  layoutCache?: TypesettingLayoutCache;
};

export type TypesettingStyleRefs = {
  fontStyleId?: string;
  paragraphStyleId?: string;
  pageStyleId?: string;
};

export type TypesettingLayoutCache = {
  lineCount: number;
  updatedAt: string;
};

type TypesettingDocState = {
  docs: Record<string, TypesettingDoc>;
  openDoc: (path: string) => Promise<void>;
  updateDocBlocks: (path: string, blocks: DocxBlock[]) => void;
  updateStyleRefs: (path: string, refs: TypesettingStyleRefs) => void;
  updateLayoutSummary: (path: string, summary: string) => void;
  updateLayoutCache: (path: string, cache: TypesettingLayoutCache) => void;
  saveDoc: (path: string) => Promise<void>;
  exportDocx: (path: string, targetPath: string) => Promise<void>;
  closeDoc: (path: string) => void;
};

const emptyDoc = (path: string): TypesettingDoc => ({
  path,
  blocks: [{ type: "paragraph", runs: [{ text: "" }] }],
  headerBlocks: [],
  footerBlocks: [],
  relationships: {},
  media: {},
  isDirty: false,
  styleRefs: {},
});

const buildDocxBytes = (doc: TypesettingDoc): Uint8Array => {
  const documentXml = buildDocxDocumentXml(doc.blocks);
  const headers = doc.headerBlocks.length > 0
    ? [buildDocxHeaderXml(doc.headerBlocks)]
    : [];
  const footers = doc.footerBlocks.length > 0
    ? [buildDocxFooterXml(doc.footerBlocks)]
    : [];

  return buildDocxPackage({
    documentXml,
    headers,
    footers,
    relationships: doc.relationships,
    media: doc.media,
  });
};

export const useTypesettingDocStore = create<TypesettingDocState>((set, get) => ({
  docs: {},

  openDoc: async (path: string) => {
    const base64 = await readBinaryFileBase64(path);
    const bytes = decodeBase64ToBytes(base64);
    const pkg = parseDocxPackage(bytes);

    const blocks = parseDocxDocumentXml(pkg.documentXml);
    const headerBlocks = pkg.headers.length > 0
      ? parseDocxHeaderFooterXml(pkg.headers[0])
      : [];
    const footerBlocks = pkg.footers.length > 0
      ? parseDocxHeaderFooterXml(pkg.footers[0])
      : [];

    set((state) => ({
      docs: {
        ...state.docs,
        [path]: {
          path,
          blocks: blocks.length > 0 ? blocks : emptyDoc(path).blocks,
          headerBlocks,
          footerBlocks,
          relationships: pkg.relationships,
          media: pkg.media,
          isDirty: false,
          styleRefs: {},
        },
      },
    }));
  },

  updateDocBlocks: (path: string, blocks: DocxBlock[]) => {
    set((state) => {
      const doc = state.docs[path] ?? emptyDoc(path);
      return {
        docs: {
          ...state.docs,
          [path]: {
            ...doc,
            blocks,
            isDirty: true,
          },
        },
      };
    });
  },

  updateStyleRefs: (path: string, refs: TypesettingStyleRefs) => {
    set((state) => {
      const doc = state.docs[path];
      if (!doc) return state;
      return {
        docs: {
          ...state.docs,
          [path]: {
            ...doc,
            styleRefs: {
              ...doc.styleRefs,
              ...refs,
            },
          },
        },
      };
    });
  },

  updateLayoutSummary: (path: string, summary: string) => {
    set((state) => {
      const doc = state.docs[path];
      if (!doc) return state;
      return {
        docs: {
          ...state.docs,
          [path]: {
            ...doc,
            layoutSummary: summary,
          },
        },
      };
    });
  },

  updateLayoutCache: (path: string, cache: TypesettingLayoutCache) => {
    set((state) => {
      const doc = state.docs[path];
      if (!doc) return state;
      return {
        docs: {
          ...state.docs,
          [path]: {
            ...doc,
            layoutCache: cache,
          },
        },
      };
    });
  },

  saveDoc: async (path: string) => {
    const doc = get().docs[path];
    if (!doc || !doc.isDirty) {
      return;
    }
    const bytes = buildDocxBytes(doc);

    await writeBinaryFile(path, bytes);

    set((state) => ({
      docs: {
        ...state.docs,
        [path]: {
          ...doc,
          isDirty: false,
        },
      },
    }));
  },

  exportDocx: async (path: string, targetPath: string) => {
    const doc = get().docs[path];
    if (!doc) {
      throw new Error(`Typesetting doc not found for export: ${path}`);
    }
    const bytes = buildDocxBytes(doc);
    await writeBinaryFile(targetPath, bytes);
  },

  closeDoc: (path: string) => {
    set((state) => {
      const docs = { ...state.docs };
      delete docs[path];
      return { docs };
    });
  },
}));
