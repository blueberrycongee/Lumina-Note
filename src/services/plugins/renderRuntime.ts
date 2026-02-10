export type MarkdownPostProcessor = (html: string) => string;
export type CodeBlockRenderer = (input: { language: string; code: string; html: string }) => string;

interface ProcessorRecord {
  pluginId: string;
  id: string;
  run: MarkdownPostProcessor;
}

interface CodeRendererRecord {
  pluginId: string;
  id: string;
  language: string;
  run: CodeBlockRenderer;
}

class PluginRenderRuntime {
  private processors = new Map<string, ProcessorRecord>();
  private codeRenderers = new Map<string, CodeRendererRecord>();

  registerMarkdownPostProcessor(pluginId: string, id: string, run: MarkdownPostProcessor) {
    const key = `${pluginId}:${id}`;
    this.processors.set(key, { pluginId, id, run });
    return () => this.processors.delete(key);
  }

  registerCodeBlockRenderer(
    pluginId: string,
    input: { id: string; language: string; render: CodeBlockRenderer },
  ) {
    const key = `${pluginId}:${input.id}`;
    this.codeRenderers.set(key, {
      pluginId,
      id: input.id,
      language: input.language.toLowerCase(),
      run: input.render,
    });
    return () => this.codeRenderers.delete(key);
  }

  clearPlugin(pluginId: string) {
    for (const [key, value] of this.processors.entries()) {
      if (value.pluginId === pluginId) this.processors.delete(key);
    }
    for (const [key, value] of this.codeRenderers.entries()) {
      if (value.pluginId === pluginId) this.codeRenderers.delete(key);
    }
  }

  apply(html: string): string {
    let next = html;

    next = next.replace(
      /<pre><code(?: class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g,
      (full, language, code) => {
        const lang = String(language || "").toLowerCase();
        const matched = Array.from(this.codeRenderers.values()).find((item) => item.language === lang);
        if (!matched) return full;
        try {
          return matched.run({ language: lang, code, html: full });
        } catch {
          return full;
        }
      },
    );

    for (const processor of this.processors.values()) {
      try {
        next = processor.run(next);
      } catch {
        // Keep host rendering resilient; ignore plugin processor failure.
      }
    }

    return next;
  }
}

export const pluginRenderRuntime = new PluginRenderRuntime();
