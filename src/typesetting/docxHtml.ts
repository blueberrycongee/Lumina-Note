import type { DocxBlock, DocxRun, DocxRunStyle } from "./docxImport";

export function docxBlocksToHtml(blocks: DocxBlock[]): string {
  return blocks.map((block) => blockToHtml(block)).join("");
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
      blocks.push({ type: "paragraph", runs: extractRuns(element) });
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
          blocks: [{ type: "paragraph", runs: extractRuns(cell) }],
        })),
      }));
      blocks.push({ type: "table", rows });
      continue;
    }
  }

  return blocks.length > 0 ? blocks : [{ type: "paragraph", runs: [{ text: "" }] }];
}

function blockToHtml(block: DocxBlock): string {
  switch (block.type) {
    case "paragraph":
      return `<p>${runsToHtml(block.runs)}</p>`;
    case "heading":
      return `<h${block.level}>${runsToHtml(block.runs)}</h${block.level}>`;
    case "list":
      return listToHtml(block);
    case "table":
      return tableToHtml(block);
    case "image":
      return `<p>[image:${escapeHtml(block.embedId)}]</p>`;
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

function tableToHtml(block: Extract<DocxBlock, { type: "table" }>): string {
  const rows = block.rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => {
          const cellHtml = cell.blocks
            .map((inner) => blockToHtml(inner))
            .join("");
          return `<td>${cellHtml}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table><tbody>${rows}</tbody></table>`;
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
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
