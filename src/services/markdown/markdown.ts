import { Marked, Renderer } from "marked";
import TurndownService from "turndown";
import katex from "katex";
import { pluginRenderRuntime } from "@/services/plugins/renderRuntime";
import { resolveCalloutType } from "@/editor/calloutConfig";

// Custom renderer for Obsidian-style callouts
const renderer = new Renderer();

renderer.hr = function () {
  return (
    `<div class="markdown-block-shell markdown-hr-block">` +
    `<hr class="markdown-hr-rule" />` +
    `</div>`
  );
};

function parseCalloutQuote(text: string): {
  rawType: string;
  modifier: "+" | "-" | undefined;
  titleText: string;
  body: string;
} | null {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lineBreakIndex = normalized.indexOf("\n");
  const firstLine =
    lineBreakIndex === -1 ? normalized : normalized.slice(0, lineBreakIndex);
  const body =
    lineBreakIndex === -1 ? "" : normalized.slice(lineBreakIndex + 1);
  const match = firstLine.match(
    /^[^\S\r\n]*\[!([^\]]+)\][^\S\r\n]*([+-])?[^\S\r\n]*(.*)$/,
  );
  if (!match) return null;
  return {
    rawType: match[1].trim(),
    modifier: match[2] as "+" | "-" | undefined,
    titleText: (match[3] || "").trim(),
    body,
  };
}

renderer.blockquote = function (quote: string | { text: string }) {
  try {
    const text = typeof quote === "string" ? quote : (quote?.text || "");
    const calloutMatch = parseCalloutQuote(text);

    if (calloutMatch) {
      const { rawType, modifier, titleText, body } = calloutMatch;
      const resolved = resolveCalloutType(rawType);
      const title = titleText || resolved.label;
      const foldable = modifier !== undefined;
      const folded = modifier === '-';
      const renderedBody = body.trim() ? markedInstance.parse(body.trim()) : "";
      const content = typeof renderedBody === "string" ? renderedBody : "";

      const foldArrow = foldable ? `<span class="callout-fold">\u25BC</span>` : '';
      const foldedClass = folded ? ' callout-folded' : '';

      return `<div class="callout callout-${resolved.color}${foldedClass}"><span class="callout-icon">${resolved.icon}</span><div class="callout-body"><div class="callout-title"><span class="callout-title-text">${title}</span>${foldArrow}</div><div class="callout-content">${content}</div></div></div>`;
    }

    return `<blockquote>${text}</blockquote>`;
  } catch (e) {
    const text = typeof quote === "string" ? quote : (quote?.text || String(quote));
    return `<blockquote>${text}</blockquote>`;
  }
};

// Code block renderer — wraps <pre><code> in a container with a copy button
const COPY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

renderer.code = function (token: { text: string; lang?: string; escaped?: boolean }): string {
  const lang = (token.lang || "").match(/^\S*/)?.[0] || "";
  const code = token.text.replace(/\n$/, "") + "\n";
  const escapedCode = token.escaped ? code : escapeHtml(code);
  const langLabel = lang
    ? `<span class="code-block-lang">${escapeHtml(lang)}</span>`
    : "";
  return (
    `<div class="code-block-wrapper">` +
    `<div class="code-block-header">${langLabel}` +
    `<button class="code-copy-btn" type="button" aria-label="Copy">` +
    `<span class="copy-icon">${COPY_SVG}</span>` +
    `<span class="check-icon">${CHECK_SVG}</span>` +
    `</button></div>` +
    `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ""}>${escapedCode}</code></pre>` +
    `</div>\n`
  );
};

// Custom image renderer to handle local paths and external URLs
renderer.image = function (token: { href: string; title: string | null; text: string }) {
  try {
    const { href, title, text } = token;
    if (!href) return "";
    
    // Convert local paths to asset URLs (for Tauri)
    let imageSrc = href;
    if (href.startsWith("./") || href.startsWith("../") || (!href.startsWith("http") && !href.startsWith("data:"))) {
      // For local images, we'll use a special protocol or keep relative
      imageSrc = href;
    }
    
    const titleAttr = title ? ` title="${title}"` : "";
    return `<img src="${imageSrc}" alt="${text || ""}"${titleAttr} class="markdown-image" loading="lazy" />`;
  } catch (e) {
    return "";
  }
};

// Create a configured marked instance
const markedInstance = new Marked({
  gfm: true,
  breaks: true,
  renderer,
});

// Remove marked-katex-extension usage since we handle math manually now
/*
markedInstance.use(
  markedKatex({
    throwOnError: false,
    output: "htmlAndMathml",
    strict: false, // 忽略 LaTeX 警告
    trust: true,   // 信任内容，允许某些命令
  })
);
*/

// Configure turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Add task list support
turndownService.addRule("taskListItem", {
  filter: (node: Node) => {
    const el = node as HTMLElement;
    return (
      el.nodeName === "LI" &&
      el.parentNode?.nodeName === "UL" &&
      el.querySelector?.('input[type="checkbox"]') !== null
    );
  },
  replacement: (content: string, node: Node) => {
    const el = node as HTMLElement;
    const checkbox = el.querySelector?.('input[type="checkbox"]');
    const checked = checkbox?.hasAttribute("checked") ? "x" : " ";
    const text = content.replace(/^\s*\[.\]\s*/, "").trim();
    return `- [${checked}] ${text}\n`;
  },
});

// Add WikiLink support
turndownService.addRule("wikiLink", {
  filter: (node: Node) => {
    const el = node as HTMLElement;
    return (
      el.nodeName === "SPAN" &&
      el.hasAttribute?.("data-wikilink")
    );
  },
  replacement: (content: string) => {
    return `[[${content}]]`;
  },
});

// Keep KaTeX math blocks (inline)
turndownService.addRule("katexInline", {
  filter: (node: Node) => {
    const el = node as HTMLElement;
    return (
      el.nodeName === "SPAN" &&
      el.classList?.contains("katex")
    );
  },
  replacement: (_content: string, node: Node) => {
    const el = node as HTMLElement;
    const annotation = el.querySelector("annotation");
    if (annotation) {
      return `$${annotation.textContent}$`;
    }
    return "";
  },
});

// Keep KaTeX math blocks (display/block)
turndownService.addRule("katexBlock", {
  filter: (node: Node) => {
    const el = node as HTMLElement;
    return (
      el.nodeName === "DIV" &&
      el.classList?.contains("katex-display")
    );
  },
  replacement: (_content: string, node: Node) => {
    const el = node as HTMLElement;
    const annotation = el.querySelector("annotation");
    if (annotation) {
      return `\n$$${annotation.textContent}$$\n`;
    }
    return "";
  },
});

/**
 * 旧的 markdown 预处理逻辑（已在 parseMarkdown 中重写整合）
 * 保留注释以便未来参考实现，但不再实际使用该函数。
 */
// function preprocessMarkdown(markdown: string): string {
//   let result = markdown;
//   // ... legacy implementation (now handled directly in parseMarkdown)
//   return result;
// }

/**
 * Parse Markdown to HTML
 */
export function parseMarkdown(markdown: string): string {
  try {
    if (!markdown) return "";
    
    // We need to handle math placeholders here
    const mathPlaceholders: Array<{ html: string; displayMode: boolean }> = [];
    const mathPlaceholderPrefix = "⟦MATH_BLOCK_";
    const mathPlaceholderSuffix = "⟧";
    
    let processed = markdown;

    // Helper to render math and store placeholder
    const renderAndStoreMath = (formula: string, displayMode: boolean) => {
      try {
        const html = katex.renderToString(formula, {
          displayMode,
          throwOnError: false,
          trust: true,
          strict: false,
          output: "html",
        });
        mathPlaceholders.push({ html, displayMode });
        return `${mathPlaceholderPrefix}${mathPlaceholders.length - 1}${mathPlaceholderSuffix}`;
      } catch (e) {
        return formula;
      }
    };

    // 1. Block Math $$...$$
    processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_match, formula) => {
      return renderAndStoreMath(formula.trim(), true);
    });

    // 2. Inline Math $...$
    const inlineMathRegex = /(?<!\\|\$)\$(?!\$)((?:[^$\n]|\n(?!\n))+?)(?<!\\|\$)\$(?!\$)/g;
    processed = processed.replace(inlineMathRegex, (_match, formula) => {
      return renderAndStoreMath(formula.trim(), false);
    });

    // 3. Preprocess other things (WikiLinks, Tags)
    // 先保护代码块和行内代码，避免内部内容被错误处理
    const codeBlockPlaceholders: string[] = [];
    const codeBlockPrefix = "⟦CODE_BLOCK_";
    const codeBlockSuffix = "⟧";
    
    // 处理 Mermaid 代码块 - 转换为特殊容器供后续渲染
    const mermaidPlaceholders: string[] = [];
    const mermaidPrefix = "⟦MERMAID_BLOCK_";
    const mermaidSuffix = "⟧";

    processed = processed.replace(/```mermaid\s*([\s\S]*?)```/gi, (_match, code) => {
      // Keep raw mermaid text — do NOT HTML-escape it.
      // Mermaid reads textContent from <pre class="mermaid"> and parses
      // directives like %%{init: {'theme': 'base', ...}}%% itself.
      // HTML-escaping would break those directives.
      mermaidPlaceholders.push(code.trim());
      return `${mermaidPrefix}${mermaidPlaceholders.length - 1}${mermaidSuffix}`;
    });
    
    // 保护其他代码块 ```...```
    processed = processed.replace(/```[\s\S]*?```/g, (match) => {
      codeBlockPlaceholders.push(match);
      return `${codeBlockPrefix}${codeBlockPlaceholders.length - 1}${codeBlockSuffix}`;
    });
    
    // 保护行内代码 `...`
    processed = processed.replace(/`[^`\n]+`/g, (match) => {
      codeBlockPlaceholders.push(match);
      return `${codeBlockPrefix}${codeBlockPlaceholders.length - 1}${codeBlockSuffix}`;
    });
    
    // Wiki image embeds
    processed = processed.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, assetPath, altText) => {
      const safePath = String(assetPath).trim();
      const safeAlt = String(altText || assetPath).trim();
      return `<img src="${safePath}" alt="${safeAlt}" class="markdown-image" loading="lazy" />`;
    });

    // WikiLinks
    processed = processed.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, link, display) => {
      const displayText = display || link;
      const linkName = link.trim();
      return `<span class="wikilink" data-wikilink="${linkName}">${displayText}</span>`;
    });
    
    // Tags (只在非代码区域处理)
    processed = processed.replace(/(?<![`\w\/])#([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9\u4e00-\u9fa5_-]*)/g, (_match, tag) => {
      return `<span class="tag" data-tag="${tag}">#${tag}</span>`;
    });
    
    // Highlight ==text== -> 占位符（稍后恢复）
    const highlightPlaceholders: string[] = [];
    const highlightPrefix = "⟦HIGHLIGHT_";
    const highlightSuffix = "⟧";
    processed = processed.replace(/==([^=\n]+)==/g, (_match, text) => {
      highlightPlaceholders.push(text);
      return `${highlightPrefix}${highlightPlaceholders.length - 1}${highlightSuffix}`;
    });
    
    // 恢复代码块
    codeBlockPlaceholders.forEach((code, index) => {
      const placeholder = `${codeBlockPrefix}${index}${codeBlockSuffix}`;
      processed = processed.split(placeholder).join(code);
    });

    // 4. Parse with Marked
    let html = markedInstance.parse(processed);
    if (typeof html !== 'string') html = "";

    // 5. Restore Math Placeholders
    // Marked might wrap our placeholders in <p> tags if they are inline.
    // We need to replace the placeholders in the HTML with the rendered math.
    mathPlaceholders.forEach((math, index) => {
      const placeholder = `${mathPlaceholderPrefix}${index}${mathPlaceholderSuffix}`;
      if (math.displayMode) {
        const blockHtml =
          `<div class="markdown-block-shell markdown-math-block">` +
          `<div class="markdown-block-body markdown-math-body">${math.html}</div>` +
          `</div>`;
        html = (html as string).split(`<p>${placeholder}</p>`).join(blockHtml);
        html = (html as string).split(placeholder).join(blockHtml);
      } else {
        html = (html as string).split(placeholder).join(math.html);
      }
    });

    // 5.5 Restore Mermaid Placeholders - 转换为 mermaid 容器
    mermaidPlaceholders.forEach((code, index) => {
      const placeholder = `${mermaidPrefix}${index}${mermaidSuffix}`;
      // 创建 mermaid 容器，code 存储在 data 属性中
      const mermaidHtml = `<div class="mermaid-container"><pre class="mermaid">${code}</pre></div>`;
      html = (html as string).split(placeholder).join(mermaidHtml);
    });

    // 5.6 Restore Highlight Placeholders - 恢复高亮
    highlightPlaceholders.forEach((text, index) => {
      const placeholder = `${highlightPrefix}${index}${highlightSuffix}`;
      html = (html as string).split(placeholder).join(`<mark>${text}</mark>`);
    });

    // 6. Wrap tables in a scrollable container to fix alignment issues
    // Replace <table> with <div class="table-wrapper"><table>
    html = (html as string).replace(
      /<table>/g,
      '<div class="table-wrapper markdown-block-shell markdown-table-block"><div class="markdown-block-body markdown-table-body"><table>',
    );
    html = (html as string).replace(/<\/table>/g, '</table></div></div>');

    return pluginRenderRuntime.apply(html as string);
  } catch (error) {
    console.error("Markdown parse error:", error);
    return markdown; // Return raw text as fallback
  }
}

/**
 * Convert HTML to Markdown
 */
export function htmlToMarkdown(html: string): string {
  try {
    if (!html) return "";
    return turndownService.turndown(html);
  } catch (error) {
    console.error("HTML to Markdown error:", error);
    return "";
  }
}

/**
 * Convert editor JSON/HTML content to Markdown
 */
export function editorToMarkdown(html: string): string {
  try {
    // Handle empty content
    if (!html || html === "<p></p>") {
      return "";
    }
    return htmlToMarkdown(html);
  } catch (error) {
    console.error("Editor to Markdown error:", error);
    return "";
  }
}

// Global click handler for code-block copy buttons injected by the renderer
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".code-copy-btn") as HTMLElement | null;
    if (!btn) return;
    const wrapper = btn.closest(".code-block-wrapper");
    const code = wrapper?.querySelector("pre code");
    if (!code) return;
    navigator.clipboard.writeText(code.textContent || "").then(() => {
      btn.classList.add("copied");
      setTimeout(() => btn.classList.remove("copied"), 2000);
    });
  });
}
