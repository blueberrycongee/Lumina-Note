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

// Check if a string is an emoji (or emoji sequence)
function isEmoji(str: string): boolean {
  const emojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u;
  return emojiRegex.test(str);
}

renderer.blockquote = function (quote: string | { text: string }) {
  try {
    const text = typeof quote === "string" ? quote : (quote?.text || "");
    // Match Obsidian callout syntax: > [!type] Title
    // Support both word types (note, tip, etc.) and emoji types (📝, 💡, etc.)
    const calloutMatch = text.match(/^\s*\[!([^\]]+)\]\s*(.*)$/m);
    
    if (calloutMatch) {
      const rawType = calloutMatch[1].trim();
      const type = rawType.toLowerCase();
      const title = calloutMatch[2] || (isEmoji(rawType) ? "" : type.charAt(0).toUpperCase() + type.slice(1));
      
      // For emoji types, use the emoji as icon; otherwise use predefined config
      const isEmojiType = isEmoji(rawType);
      const config = isEmojiType 
        ? { icon: rawType, color: "blue" }  // Default color for emoji types
        : (calloutTypes[type] || calloutTypes.note);
      
      // Remove the callout header from content and parse remaining content
      const content = text.replace(/^\s*\[![^\]]+\].*$/m, "").trim();
      
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
      const escapedCode = code.trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      mermaidPlaceholders.push(escapedCode);
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
    mathPlaceholders.forEach((mathHtml, index) => {
      const placeholder = `${mathPlaceholderPrefix}${index}${mathPlaceholderSuffix}`;
      // Replace global occurrences
      html = (html as string).split(placeholder).join(mathHtml);
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
    html = (html as string).replace(/<table>/g, '<div class="table-wrapper"><table>');
    html = (html as string).replace(/<\/table>/g, '</table></div>');

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
