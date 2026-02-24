import { strToU8, unzipSync, zipSync } from "fflate";

export type DocxPackage = {
  documentXml: string;
  stylesXml?: string;
  headers: string[];
  footers: string[];
  relationships: Record<string, string>;
  media: Record<string, Uint8Array>;
};

type DocxPackageInput = {
  documentXml: string;
  stylesXml?: string;
  headers?: string[];
  footers?: string[];
  relationships?: Record<string, string>;
  media?: Record<string, Uint8Array>;
};

const REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";

const OFFICE_DOC_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";

const DOC_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const WORD_MAIN =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

const WORD_HEADER =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml";

const WORD_FOOTER =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml";

export function parseDocxPackage(bytes: Uint8Array): DocxPackage {
  const entries = normalizeEntries(unzipSync(bytes));
  const documentXml = decodeEntry(entries["word/document.xml"]);
  if (!documentXml) {
    throw new Error("docx package missing word/document.xml");
  }

  const stylesXml = decodeEntry(entries["word/styles.xml"]) ?? undefined;
  const headers = collectXmlEntries(entries, "word/header");
  const footers = collectXmlEntries(entries, "word/footer");
  const relationships = parseRelationships(entries["word/_rels/document.xml.rels"]);
  const media = collectMedia(entries);

  return {
    documentXml,
    stylesXml,
    headers,
    footers,
    relationships,
    media,
  };
}

export function buildDocxPackage(input: DocxPackageInput): Uint8Array {
  const headers = input.headers ?? [];
  const footers = input.footers ?? [];
  const relationships = input.relationships ?? {};
  const media = input.media ?? {};

  const contentTypes = buildContentTypes(headers.length, footers.length, media);
  const rootRels = buildRootRels();
  const docRels = buildDocumentRels(relationships);

  const entries: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "word/document.xml": strToU8(input.documentXml),
    "word/_rels/document.xml.rels": strToU8(docRels),
  };

  if (input.stylesXml) {
    entries["word/styles.xml"] = strToU8(input.stylesXml);
  }

  headers.forEach((xml, index) => {
    entries[`word/header${index + 1}.xml`] = strToU8(xml);
  });
  footers.forEach((xml, index) => {
    entries[`word/footer${index + 1}.xml`] = strToU8(xml);
  });

  for (const [path, bytes] of Object.entries(media)) {
    entries[path] = bytes;
  }

  return zipSync(entries);
}

function decodeEntry(entry?: Uint8Array): string | null {
  if (!entry) {
    return null;
  }
  return new TextDecoder("utf-8").decode(entry);
}

function normalizeEntryKey(key: string): string {
  return key
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^[\\/]+/, "")
    .replace(/\0/g, "")
    .trim();
}

function normalizeEntries(entries: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const normalized: Record<string, Uint8Array> = {};
  for (const [key, value] of Object.entries(entries)) {
    const cleanKey = normalizeEntryKey(key);
    if (!cleanKey) {
      continue;
    }
    normalized[cleanKey] = value;
    const lowerKey = cleanKey.toLowerCase();
    if (!normalized[lowerKey]) {
      normalized[lowerKey] = value;
    }
  }
  return normalized;
}

function collectXmlEntries(
  entries: Record<string, Uint8Array>,
  prefix: string,
): string[] {
  const keys = Object.keys(entries)
    .filter((key) => key.startsWith(prefix) && key.endsWith(".xml"))
    .sort((a, b) => a.localeCompare(b));
  return keys
    .map((key) => decodeEntry(entries[key]))
    .filter((value): value is string => Boolean(value));
}

function collectMedia(entries: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const media: Record<string, Uint8Array> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (key.startsWith("word/media/")) {
      media[key] = value;
    }
  }
  return media;
}

function parseRelationships(entry?: Uint8Array): Record<string, string> {
  if (!entry) {
    return {};
  }
  const xml = decodeEntry(entry);
  if (!xml) {
    return {};
  }

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const rels = Array.from(doc.getElementsByTagName("Relationship"));
    const output: Record<string, string> = {};
    for (const rel of rels) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      if (id && target) {
        output[id] = target;
      }
    }
    return output;
  }

  const output: Record<string, string> = {};
  const regex = /Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) {
    output[match[1]] = match[2];
  }
  return output;
}

function buildContentTypes(
  headerCount: number,
  footerCount: number,
  media: Record<string, Uint8Array>,
): string {
  const overrides: string[] = [];
  overrides.push(
    `<Override PartName="/word/document.xml" ContentType="${WORD_MAIN}" />`,
  );
  for (let i = 0; i < headerCount; i += 1) {
    overrides.push(
      `<Override PartName="/word/header${i + 1}.xml" ContentType="${WORD_HEADER}" />`,
    );
  }
  for (let i = 0; i < footerCount; i += 1) {
    overrides.push(
      `<Override PartName="/word/footer${i + 1}.xml" ContentType="${WORD_FOOTER}" />`,
    );
  }

  const defaults = [
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />`,
    `<Default Extension="xml" ContentType="application/xml" />`,
  ];

  for (const path of Object.keys(media)) {
    const ext = path.split(".").pop()?.toLowerCase();
    if (!ext) continue;
    const contentType = mediaContentType(ext);
    if (contentType) {
      defaults.push(`<Default Extension="${ext}" ContentType="${contentType}" />`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `${defaults.join("")}${overrides.join("")}</Types>`;
}

function buildRootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="${REL_NS}">` +
    `<Relationship Id="rId1" Type="${OFFICE_DOC_REL}" Target="word/document.xml" />` +
    `</Relationships>`;
}

function buildDocumentRels(relationships: Record<string, string>): string {
  const rels = Object.entries(relationships)
    .map(([id, target]) =>
      `<Relationship Id="${escapeXmlAttr(id)}" Type="${DOC_REL}/image" Target="${escapeXmlAttr(target)}" />`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="${REL_NS}">${rels}</Relationships>`;
}

function mediaContentType(ext: string): string | null {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    default:
      return null;
  }
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
