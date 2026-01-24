import { readFileSync } from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { JSDOM } from "jsdom";

const docxPath = process.argv[2];
if (!docxPath) {
  throw new Error("Usage: node scripts/_docx_check.mjs <docx-path>");
}

const bytes = readFileSync(docxPath);
const entries = unzipSync(bytes);
const docEntry = entries["word/document.xml"] || entries["word\\document.xml"];
if (!docEntry) {
  throw new Error("document.xml not found");
}
const xml = new TextDecoder("utf-8").decode(docEntry);
const dom = new JSDOM();
const doc = new dom.window.DOMParser().parseFromString(xml, "application/xml");

const collectTextLength = (root) => {
  const tNodes = Array.from(root.getElementsByTagName("w:t"));
  const tabNodes = Array.from(root.getElementsByTagName("w:tab"));
  const brNodes = Array.from(root.getElementsByTagName("w:br"));
  const textLength = tNodes.reduce((sum, node) => sum + (node.textContent?.length ?? 0), 0);
  return {
    textLength: textLength + tabNodes.length + brNodes.length,
    tCount: tNodes.length,
    tabCount: tabNodes.length,
    brCount: brNodes.length,
  };
};

const body = doc.getElementsByTagName("w:body")[0];
if (!body) {
  throw new Error("w:body not found");
}

const raw = collectTextLength(doc);

let parsedTextLength = 0;
let parsedParagraphs = 0;
let parsedTables = 0;
let parsedListParagraphs = 0;

const isListParagraph = (p) => {
  const pPr = p.getElementsByTagName("w:pPr")[0];
  if (!pPr) return false;
  return pPr.getElementsByTagName("w:numPr").length > 0;
};

const textLengthForParagraph = (p) => collectTextLength(p).textLength;

const textLengthForTable = (tbl) => {
  let length = 0;
  const cells = Array.from(tbl.getElementsByTagName("w:tc"));
  for (const cell of cells) {
    const paragraphs = Array.from(cell.getElementsByTagName("w:p"));
    for (const p of paragraphs) {
      length += textLengthForParagraph(p);
    }
  }
  return length;
};

const children = Array.from(body.childNodes).filter((node) => node.nodeType === 1);
for (const node of children) {
  const tag = node.tagName;
  if (tag === "w:p") {
    parsedParagraphs += 1;
    if (isListParagraph(node)) {
      parsedListParagraphs += 1;
    }
    parsedTextLength += textLengthForParagraph(node);
  } else if (tag === "w:tbl") {
    parsedTables += 1;
    parsedTextLength += textLengthForTable(node);
  }
}

const sdtNodes = Array.from(doc.getElementsByTagName("w:sdt"));
const sdtText = sdtNodes.reduce((sum, node) => sum + collectTextLength(node).textLength, 0);

const summary = {
  rawTextLength: raw.textLength,
  parsedTextLength,
  parsedVsRawRatio: raw.textLength > 0 ? parsedTextLength / raw.textLength : 0,
  xmlCounts: {
    paragraphs: doc.getElementsByTagName("w:p").length,
    tables: doc.getElementsByTagName("w:tbl").length,
    sdt: sdtNodes.length,
    hyperlinks: doc.getElementsByTagName("w:hyperlink").length,
    fields: doc.getElementsByTagName("w:fldSimple").length,
  },
  parsedCounts: {
    topLevelParagraphs: parsedParagraphs,
    listParagraphs: parsedListParagraphs,
    tables: parsedTables,
  },
  sdtTextLength: sdtText,
  sdtTextRatio: raw.textLength > 0 ? sdtText / raw.textLength : 0,
};

console.log(JSON.stringify(summary, null, 2));
