export type MarkdownPostProcessor = (html: string) => string;
export type CodeBlockRenderer = (input: { language: string; code: string; html: string }) => string;
export type ReadingViewPostProcessor = (
  container: HTMLElement,
) => void | (() => void);

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

interface ReadingViewProcessorRecord {
  pluginId: string;
  id: string;
  run: ReadingViewPostProcessor;
}

interface ReadingMountCleanupRecord {
  pluginId: string;
  cleanup: () => void;
}

class PluginRenderRuntime {
  private processors = new Map<string, ProcessorRecord>();
  private codeRenderers = new Map<string, CodeRendererRecord>();
  private readingViewProcessors = new Map<string, ReadingViewProcessorRecord>();
  private activeReadingMounts = new Map<number, ReadingMountCleanupRecord[]>();
  private nextReadingMountId = 1;

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

  registerReadingViewPostProcessor(pluginId: string, id: string, run: ReadingViewPostProcessor) {
    const key = `${pluginId}:${id}`;
    this.readingViewProcessors.set(key, { pluginId, id, run });
    return () => this.readingViewProcessors.delete(key);
  }

  clearPlugin(pluginId: string) {
    for (const [key, value] of this.processors.entries()) {
      if (value.pluginId === pluginId) this.processors.delete(key);
    }
    for (const [key, value] of this.codeRenderers.entries()) {
      if (value.pluginId === pluginId) this.codeRenderers.delete(key);
    }
    for (const [key, value] of this.readingViewProcessors.entries()) {
      if (value.pluginId === pluginId) this.readingViewProcessors.delete(key);
    }
    for (const mountCleanups of this.activeReadingMounts.values()) {
      const survivors: ReadingMountCleanupRecord[] = [];
      for (const record of mountCleanups) {
        if (record.pluginId !== pluginId) {
          survivors.push(record);
          continue;
        }
        try {
          record.cleanup();
        } catch {
          // ignore cleanup failure
        }
      }
      mountCleanups.length = 0;
      mountCleanups.push(...survivors);
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

  mountReadingView(container: HTMLElement): () => void {
    const mountId = this.nextReadingMountId++;
    const cleanups: ReadingMountCleanupRecord[] = [];
    for (const processor of this.readingViewProcessors.values()) {
      try {
        const cleanup = processor.run(container);
        if (typeof cleanup === "function") {
          cleanups.push({
            pluginId: processor.pluginId,
            cleanup,
          });
        }
      } catch {
        // Keep host rendering resilient; ignore plugin processor failure.
      }
    }
    this.activeReadingMounts.set(mountId, cleanups);
    return () => {
      const mounted = this.activeReadingMounts.get(mountId);
      if (!mounted) return;
      this.activeReadingMounts.delete(mountId);
      for (const record of mounted) {
        try {
          record.cleanup();
        } catch {
          // ignore cleanup failure
        }
      }
    };
  }
}

export const pluginRenderRuntime = new PluginRenderRuntime();
