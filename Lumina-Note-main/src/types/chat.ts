export interface AttachedImage {
  id: string;
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  preview: string;
}

export type QuoteRange =
  | {
      kind: "line";
      startLine: number;
      endLine: number;
      startOffset?: number;
      endOffset?: number;
    }
  | {
      kind: "offset";
      startOffset: number;
      endOffset: number;
    }
  | {
      kind: "pdf";
      page: number;
      rectCount?: number;
    }
  | {
      kind: "diagram";
      elementCount: number;
      elementIds?: string[];
      filePath?: string;
    };

export interface QuoteReference {
  id: string;
  text: string;
  source: string;
  sourcePath?: string;
  summary?: string;
  locator?: string;
  range?: QuoteRange;
}
