import { Marked, Renderer } from "marked";
import TurndownService from "turndown";
import katex from "katex";

// Callout type icons and colors
const calloutTypes: Record<string, { icon: string; color: string }> = {
  note: { icon: "📝", color: "blue" },
  abstract: { icon: "📄", color: "blue" },
  tip: { icon: "💡", color: "green" },
  warning: { icon: "⚠️", color: "yellow" },
  danger: { icon: "🔴", color: "red" },
  example: { icon: "📋", color: "purple" },
  info: { icon: "ℹ️", color: "blue" },
  question: { icon: "❓", color: "yellow" },
  success: { icon: "✅", color: "green" },
  failure: { icon: "❌", color: "red" },
  bug: { icon: "🐛", color: "red" },
  quote: { icon: "💬", color: "gray" },
};

// Custom renderer for Obsidian-style callouts
const renderer = new Renderer();

renderer.blockquote = function (quote: string | { text: string }) {
  try {
    const text = typeof quote === "string" ? quote : (quote?.text || "");
    // Match Obsidian callout syntax: > [!type] Title
    const calloutMatch = text.match(/^\s*\[!(\w+)\]\s*(.*)$/m);
    
    if (calloutMatch) {
      const type = calloutMatch[1].toLowerCase();
      const title = calloutMatch[2] || type.charAt(0).toUpperCase() + type.slice(1);
      const config = calloutTypes[type] || calloutTypes.note;
      
      // Remove the callout header from content and parse remaining content
      const content = text.replace(/^\s*\[!\w+\].*$/m, "").trim();
      
      return `
        <div class="callout callout-${type} callout-${config.color}">
          <div class="callout-title">
            <span class="callout-icon">${config.icon}</span>
            <span class="callout-title-text">${title}</span>
          </div>
          <div class="callout-content">${content}</div>
        </div>
      `;
    }
    
    // Default blockquote rendering
    return `<blockquote>${text}</blockquote>`;
  } catch (e) {
    // Fallback for any errors
    const text = typeof quote === "string" ? quote : (quote?.text || String(quote));
    return `<blockquote>${text}</blockquote>`;
  }
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
 * Preprocess markdown to fix math formula detection issues
 * and convert WikiLinks to clickable links
 */
function preprocessMarkdown(markdown: string): string {
  let result = markdown;
  
  // 0. Handle Math Formulas (Copying logic from CodeMirrorEditor)
  // We replace math with HTML placeholders to prevent marked from messing them up
  const mathPlaceholders: string[] = [];
  const mathPlaceholderPrefix = "⟦MATH_BLOCK_";
  const mathPlaceholderSuffix = "⟧";
  
  // Helper to render math and store placeholder
  const renderAndStoreMath = (formula: string, displayMode: boolean) => {
    try {
      const html = katex.renderToString(formula, {
        displayMode,
        throwOnError: false,
        trust: true,
        strict: false,
        output: "html", // Use HTML output
      });
      mathPlaceholders.push(html);
      return `${mathPlaceholderPrefix}${mathPlaceholders.length - 1}${mathPlaceholderSuffix}`;
    } catch (e) {
      console.error("KaTeX render error:", e);
      return formula;
    }
  };

  // 1. Block Math $$...$$
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
    return renderAndStoreMath(formula.trim(), true);
  });

  // 2. Inline Math $...$ (using the same regex as CodeMirrorEditor)
  // Matches $...$ but not if preceded by \ or $ (to avoid $$), and not if followed by $
  // Allows newlines inside but not consecutive newlines (paragraph breaks)
  const inlineMathRegex = /(?<!\\|\$)\$(?!\$)((?:[^$\n]|\n(?!\n))+?)(?<!\\|\$)\$(?!\$)/g;
  result = result.replace(inlineMathRegex, (match, formula) => {
    return renderAndStoreMath(formula.trim(), false);
  });

  // 3. Convert [[WikiLinks]] to HTML spans with data attribute
  // Supports [[link]] and [[link|display text]]
  result = result.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, link, display) => {
    const displayText = display || link;
    const linkName = link.trim();
    return `<span class="wikilink" data-wikilink="${linkName}">${displayText}</span>`;
  });
  
  // 4. Convert #tags to styled spans (but not in code blocks or URLs)
  // Match #tag at word boundaries, supporting Chinese characters
  result = result.replace(/(?<![`\w\/])#([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9\u4e00-\u9fa5_-]*)/g, (_match, tag) => {
    return `<span class="tag" data-tag="${tag}">#${tag}</span>`;
  });

  // 5. Restore Math Placeholders
  // We do this BEFORE marked parsing if we want marked to ignore the math content (it's already HTML)
  // However, marked might escape HTML.
  // But since we are using a custom renderer or just standard marked, marked usually preserves HTML blocks if gfm is true.
  // To be safe, we can restore AFTER marked, but then we need to protect placeholders from marked.
  // Let's try restoring AFTER marked parsing.
  
  // Wait, if we restore after marked, marked might have escaped our placeholders if they look like something else.
  // Our placeholders are ⟦MATH_BLOCK_0⟧ which marked treats as text.
  // So we should restore after marked.
  
  // Store placeholders in a global or closure-scoped map? 
  // preprocessMarkdown returns string. parseMarkdown calls it.
  // We need to change the flow of parseMarkdown to handle this restoration.
  
  // Let's attach the placeholders to the result string temporarily? No.
  // We need to refactor parseMarkdown.
  
  return result; // This result now contains placeholders like ⟦MATH_BLOCK_0⟧
}

/**
 * Parse Markdown to HTML
 */
export function parseMarkdown(markdown: string): string {
  try {
    if (!markdown) return "";
    
    // We need to handle math placeholders here
    const mathPlaceholders: string[] = [];
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
        mathPlaceholders.push(html);
        return `${mathPlaceholderPrefix}${mathPlaceholders.length - 1}${mathPlaceholderSuffix}`;
      } catch (e) {
        return formula;
      }
    };

    // 1. Block Math $$...$$
    processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
      return renderAndStoreMath(formula.trim(), true);
    });

    // 2. Inline Math $...$
    const inlineMathRegex = /(?<!\\|\$)\$(?!\$)((?:[^$\n]|\n(?!\n))+?)(?<!\\|\$)\$(?!\$)/g;
    processed = processed.replace(inlineMathRegex, (match, formula) => {
      return renderAndStoreMath(formula.trim(), false);
    });

    // 3. Preprocess other things (WikiLinks, Tags)
    // We reuse the logic from preprocessMarkdown but without the math part
    // Or we can just inline the logic here for simplicity and correctness
    
    // WikiLinks
    processed = processed.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, link, display) => {
      const displayText = display || link;
      const linkName = link.trim();
      return `<span class="wikilink" data-wikilink="${linkName}">${displayText}</span>`;
    });
    
    // Tags
    processed = processed.replace(/(?<![`\w\/])#([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9\u4e00-\u9fa5_-]*)/g, (_match, tag) => {
      return `<span class="tag" data-tag="${tag}">#${tag}</span>`;
    });

    // 4. Parse with Marked
    let html = markedInstance.parse(processed);
    if (typeof html !== 'string') html = "";

    // 5. Restore Math Placeholders
    // Marked might wrap our placeholders in <p> tags if they are inline.
    // We need to replace the placeholders in the HTML with the rendered math.
    mathPlaceholders.forEach((mathHtml, index) => {
      const placeholder = `${mathPlaceholderPrefix}${index}${mathPlaceholderSuffix}`;
      // Replace global occurrences
      html = (html as string).split(placeholder).join(mathHtml);
    });

    return html as string;
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
