import type { DocxBlock, DocxRun, DocxRunStyle } from "./docxImport";

export type DocxImageHtml = {
  src: string;
  alt?: string;
};

export type DocxHtmlOptions = {
  imageResolver?: (embedId: string) => DocxImageHtml | null;
};

export function docxBlocksToHtml(
  blocks: DocxBlock[],
  options: DocxHtmlOptions = {},
): string {
  return blocks.map((block) => blockToHtml(block, options)).join("");
}

export function docxHtmlToBlocks(root: HTMLElement): DocxBlock[] {
  const blocks: DocxBlock[] = [];

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        blocks.push({ type: "paragraph", runs: [{ text }] });
      }
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();

    if (tag === "p" || tag === "div") {
      const imageBlock = extractImageBlock(element);
      if (imageBlock) {
        blocks.push(imageBlock);
      } else {
        blocks.push({ type: "paragraph", runs: extractRuns(element) });
      }
      continue;
    }

    if (tag === "img") {
      const embedId = element.getAttribute("data-embed-id");
      if (embedId) {
        const widthEmu = parseDataNumber(element, "data-width-emu");
        const heightEmu = parseDataNumber(element, "data-height-emu");
        blocks.push({ type: "image", embedId, widthEmu, heightEmu });
      }
      continue;
    }

    if (tag.startsWith("h")) {
      const level = Number.parseInt(tag.slice(1), 10);
      blocks.push({
        type: "heading",
        level: Number.isFinite(level) ? Math.min(Math.max(level, 1), 6) : 1,
        runs: extractRuns(element),
      });
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const items = Array.from(element.children)
        .filter((child) => child.tagName.toLowerCase() === "li")
        .map((li) => ({
          runs: extractRuns(li),
        }));
      blocks.push({
        type: "list",
        ordered: tag === "ol",
        items,
      });
      continue;
    }

    if (tag === "table") {
      const rows = Array.from(element.querySelectorAll("tr")).map((row) => ({
        cells: Array.from(row.querySelectorAll("td,th")).map((cell) => ({
          blocks: [{ type: "paragraph" as const, runs: extractRuns(cell) }],
        })),
      }));
      blocks.push({ type: "table", rows });
      continue;
    }
  }

  return blocks.length > 0 ? blocks : [{ type: "paragraph", runs: [{ text: "" }] }];
}

function blockToHtml(block: DocxBlock, options: DocxHtmlOptions): string {
  switch (block.type) {
    case "paragraph":
      return `<p>${runsToHtml(block.runs)}</p>`;
    case "heading":
      return `<h${block.level}>${runsToHtml(block.runs)}</h${block.level}>`;
    case "list":
      return listToHtml(block);
    case "table":
      return tableToHtml(block, options);
    case "image":
      return imageToHtml(block, options);
    default:
      return "";
  }
}

function listToHtml(block: Extract<DocxBlock, { type: "list" }>): string {
  const tag = block.ordered ? "ol" : "ul";
  const items = block.items
    .map((item) => `<li>${runsToHtml(item.runs)}</li>`)
    .join("");
  return `<${tag}>${items}</${tag}>`;
}

function tableToHtml(
  block: Extract<DocxBlock, { type: "table" }>,
  options: DocxHtmlOptions,
): string {
  const rows = block.rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => {
          const cellHtml = cell.blocks
            .map((inner) => blockToHtml(inner, options))
            .join("");
          return `<td>${cellHtml}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table><tbody>${rows}</tbody></table>`;
}

function imageToHtml(
  block: Extract<DocxBlock, { type: "image" }>,
  options: DocxHtmlOptions,
): string {
  const resolved = options.imageResolver?.(block.embedId);
  if (!resolved?.src) {
    return `<p>[image:${escapeHtml(block.embedId)}]</p>`;
  }
  const src = escapeHtml(resolved.src);
  const alt = escapeHtml(resolved.alt ?? "");
  const size = imageSizeAttributes(block);
  const style = `${size.style ?? ""}max-width:100%;height:auto;`;
  return `<p><img data-embed-id="${escapeHtml(block.embedId)}"${size.attributes} src="${src}" alt="${alt}" style="${style}" /></p>`;
}

function runsToHtml(runs: DocxRun[]): string {
  return runs.map((run) => runToHtml(run)).join("");
}

function runToHtml(run: DocxRun): string {
  const text = escapeHtml(run.text)
    .replace(/\n/g, "<br />")
    .replace(/\t/g, "&emsp;");
  if (!run.style) {
    return text;
  }
  return wrapWithStyle(text, run.style);
}

function wrapWithStyle(text: string, style: DocxRunStyle): string {
  let output = text;
  if (style.underline) {
    output = `<u>${output}</u>`;
  }
  if (style.strikethrough) {
    output = `<s>${output}</s>`;
  }
  if (style.italic) {
    output = `<em>${output}</em>`;
  }
  if (style.bold) {
    output = `<strong>${output}</strong>`;
  }
  return output;
}

function extractRuns(element: Element): DocxRun[] {
  const runs: DocxRun[] = [];

  const walk = (node: Node, style: DocxRunStyle) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.length > 0) {
        runs.push({
          text,
          style: Object.keys(style).length > 0 ? { ...style } : undefined,
        });
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "ul" || tag === "ol") {
      return;
    }

    if (tag === "br") {
      runs.push({
        text: "\n",
        style: Object.keys(style).length > 0 ? { ...style } : undefined,
      });
      return;
    }

    const nextStyle = { ...style };
    if (tag === "strong" || tag === "b") {
      nextStyle.bold = true;
    }
    if (tag === "em" || tag === "i") {
      nextStyle.italic = true;
    }
    if (tag === "u") {
      nextStyle.underline = true;
    }
    if (tag === "s" || tag === "del" || tag === "strike") {
      nextStyle.strikethrough = true;
    }
    applyInlineStyle(el, nextStyle);

    for (const child of Array.from(el.childNodes)) {
      walk(child, nextStyle);
    }
  };

  for (const child of Array.from(element.childNodes)) {
    walk(child, {});
  }

  return runs.length > 0 ? runs : [{ text: "" }];
}

function extractImageBlock(element: HTMLElement): DocxBlock | null {
  const img = element.querySelector("img[data-embed-id]");
  if (!img) return null;
  if (element.childNodes.length !== 1 || element.firstElementChild !== img) {
    return null;
  }
  const embedId = img.getAttribute("data-embed-id");
  if (!embedId) return null;
  const widthEmu = parseDataNumber(img, "data-width-emu");
  const heightEmu = parseDataNumber(img, "data-height-emu");
  return {
    type: "image",
    embedId,
    widthEmu,
    heightEmu,
  };
}

function applyInlineStyle(element: HTMLElement, style: DocxRunStyle) {
  if (!element.hasAttribute("style")) return;

  const fontWeight = element.style.fontWeight;
  if (fontWeight) {
    const numericWeight = Number.parseInt(fontWeight, 10);
    if (fontWeight === "bold" || (Number.isFinite(numericWeight) && numericWeight >= 600)) {
      style.bold = true;
    }
  }

  const fontStyle = element.style.fontStyle;
  if (fontStyle === "italic" || fontStyle === "oblique") {
    style.italic = true;
  }

  const textDecoration = element.style.textDecorationLine || element.style.textDecoration;
  if (textDecoration) {
    if (textDecoration.includes("underline")) {
      style.underline = true;
    }
    if (textDecoration.includes("line-through")) {
      style.strikethrough = true;
    }
  }

  const fontFamily = element.style.fontFamily;
  if (fontFamily) {
    const parsed = parseFontFamily(fontFamily);
    if (parsed) {
      style.font = parsed;
    }
  }

  const fontSize = element.style.fontSize;
  if (fontSize) {
    const parsed = parseFontSize(fontSize);
    if (parsed !== null) {
      style.sizePt = parsed;
    }
  }
}

function parseFontFamily(value: string): string | null {
  const first = value.split(",")[0]?.trim();
  if (!first) return null;
  const cleaned = first.replace(/^['"]|['"]$/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function parseFontSize(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^([0-9]*\.?[0-9]+)(pt|px)$/);
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;
  if (match[2] === "pt") {
    return amount;
  }
  return amount * 0.75;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EMU_PER_INCH = 914400;
const DEFAULT_DPI = 96;

function imageSizeAttributes(
  block: Extract<DocxBlock, { type: "image" }>,
): { attributes: string; style?: string } {
  const widthEmu = block.widthEmu;
  const heightEmu = block.heightEmu;
  if (
    typeof widthEmu !== "number" ||
    typeof heightEmu !== "number" ||
    !Number.isFinite(widthEmu) ||
    !Number.isFinite(heightEmu)
  ) {
    return { attributes: "" };
  }

  const widthPx = emuToPx(widthEmu, DEFAULT_DPI);
  const heightPx = emuToPx(heightEmu, DEFAULT_DPI);
  if (widthPx <= 0 || heightPx <= 0) {
    return { attributes: "" };
  }

  return {
    attributes: ` data-width-emu="${Math.round(widthEmu)}" data-height-emu="${Math.round(heightEmu)}"`,
    style: `width:${widthPx}px;`,
  };
}

function emuToPx(emu: number, dpi: number): number {
  if (!Number.isFinite(emu) || emu <= 0) return 0;
  const px = (emu / EMU_PER_INCH) * dpi;
  return Math.max(1, Math.round(px));
}

function parseDataNumber(element: Element, attribute: string): number | undefined {
  const raw = element.getAttribute(attribute);
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}
