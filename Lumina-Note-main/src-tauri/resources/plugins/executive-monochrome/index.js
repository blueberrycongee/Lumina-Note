module.exports = function setup(api, plugin) {
  const presetId = "executive-monochrome";
  const root = document.documentElement;

  const keys = {
    density: "density",
    focus: "focus"
  };

  const removePreset = api.theme.registerPreset({
    id: presetId,
    name: "Executive Monochrome",
    tokens: {
      "--radius": "6px",
      "--ui-radius-sm": "4px",
      "--ui-radius-md": "6px",
      "--ui-radius-lg": "8px",
      "--font-sans": '"IBM Plex Sans", "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      "--font-serif": '"IBM Plex Serif", "Georgia", "Times New Roman", serif',
      "--font-mono": '"IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      "--motion-fast": "120ms",
      "--motion-medium": "180ms"
    },
    light: {
      "--background": "0 0% 99%",
      "--foreground": "0 0% 9%",
      "--card": "0 0% 100%",
      "--card-foreground": "0 0% 9%",
      "--popover": "0 0% 100%",
      "--popover-foreground": "0 0% 10%",
      "--primary": "0 0% 12%",
      "--primary-foreground": "0 0% 98%",
      "--secondary": "0 0% 95%",
      "--secondary-foreground": "0 0% 16%",
      "--muted": "0 0% 95%",
      "--muted-foreground": "0 0% 34%",
      "--accent": "0 0% 92%",
      "--accent-foreground": "0 0% 12%",
      "--border": "0 0% 80%",
      "--input": "0 0% 78%",
      "--ring": "0 0% 20%"
    },
    dark: {
      "--background": "0 0% 8%",
      "--foreground": "0 0% 94%",
      "--card": "0 0% 11%",
      "--card-foreground": "0 0% 94%",
      "--popover": "0 0% 11%",
      "--popover-foreground": "0 0% 94%",
      "--primary": "0 0% 93%",
      "--primary-foreground": "0 0% 10%",
      "--secondary": "0 0% 16%",
      "--secondary-foreground": "0 0% 92%",
      "--muted": "0 0% 15%",
      "--muted-foreground": "0 0% 66%",
      "--accent": "0 0% 22%",
      "--accent-foreground": "0 0% 95%",
      "--border": "0 0% 31%",
      "--input": "0 0% 34%",
      "--ring": "0 0% 82%"
    }
  });

  api.theme.applyPreset(presetId);

  const syncMode = () => {
    const dense = api.storage.get(keys.density) === "dense";
    const focus = api.storage.get(keys.focus) !== "off";
    root.classList.add("executive-mono-mode");
    root.classList.toggle("executive-mono-dense", dense);
    root.classList.toggle("executive-mono-focus", focus);
  };

  syncMode();

  const removeStyle = api.ui.injectStyle({
    layer: "override",
    global: true,
    css: `
      :root.executive-mono-mode {
        --exec-panel-padding: 14px;
        --exec-line-height: 1.72;
        --exec-reading-width: 74ch;
      }

      :root.executive-mono-mode body {
        letter-spacing: 0;
        text-rendering: optimizeLegibility;
        font-feature-settings: "liga" 1, "kern" 1;
      }

      :root.executive-mono-mode :where(.ui-panel, .ui-card, .ui-glass, [class*="panel"], [class*="sidebar"], [class*="toolbar"]) {
        border: 1px solid hsl(var(--border)) !important;
        border-radius: var(--ui-radius-md) !important;
        box-shadow: 0 1px 0 hsl(var(--foreground) / 0.08), 0 10px 28px hsl(var(--foreground) / 0.06) !important;
      }

      :root.executive-mono-mode :where(button, [role="button"], input, textarea, select) {
        border: 1px solid hsl(var(--border)) !important;
        border-radius: var(--ui-radius-sm) !important;
        box-shadow: none !important;
        font-weight: 500;
      }

      :root.executive-mono-mode :where(button:hover, [role="button"]:hover) {
        background: hsl(var(--accent) / 0.86);
      }

      :root.executive-mono-mode :where(h1, h2, h3, h4, h5, h6) {
        letter-spacing: 0.01em;
        line-height: 1.24;
        font-weight: 600;
      }

      :root.executive-mono-mode .prose,
      :root.executive-mono-mode .reading-view,
      :root.executive-mono-mode .tiptap {
        line-height: var(--exec-line-height);
      }

      :root.executive-mono-mode .prose {
        max-width: 92ch;
      }

      :root.executive-mono-mode.executive-mono-focus :where(.prose, .reading-view, .tiptap) {
        max-width: var(--exec-reading-width);
        margin-left: auto;
        margin-right: auto;
      }

      :root.executive-mono-mode :where(code, pre, blockquote, .callout, .katex-display, .wiki-link) {
        border-radius: var(--ui-radius-sm) !important;
      }

      :root.executive-mono-mode .tiptap blockquote,
      :root.executive-mono-mode .prose blockquote {
        border-left: 3px solid hsl(var(--foreground) / 0.55);
        background: hsl(var(--muted) / 0.45);
        padding: 10px 14px;
      }

      :root.executive-mono-mode .tiptap pre,
      :root.executive-mono-mode .prose pre {
        border: 1px solid hsl(var(--border));
        background: hsl(var(--muted) / 0.55);
      }

      :root.executive-mono-mode .executive-mono-table {
        border-collapse: collapse;
      }

      :root.executive-mono-mode .executive-mono-table :where(th, td) {
        border: 1px solid hsl(var(--border));
      }

      :root.executive-mono-mode .executive-mono-divider {
        border: 0;
        border-top: 1px solid hsl(var(--border));
      }

      :root.executive-mono-mode.executive-mono-dense {
        --exec-panel-padding: 10px;
        --exec-line-height: 1.62;
      }

      :root.executive-mono-mode.executive-mono-dense :where(.ui-panel, .ui-card) {
        padding: var(--exec-panel-padding) !important;
      }

      :root.executive-mono-mode.executive-mono-dense :where(.ui-icon-btn, button, [role="button"], input, textarea, select) {
        min-height: 30px;
      }

      :root.executive-mono-mode ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }

      :root.executive-mono-mode ::-webkit-scrollbar-thumb {
        border-radius: var(--ui-radius-sm);
        background: hsl(var(--muted-foreground) / 0.42);
      }
    `
  });

  const removeEditorSkin = api.editor.registerEditorExtension({
    id: "executive-mono-editor",
    scopeId: "codemirror",
    layer: "override",
    css: `
      .cm-editor {
        line-height: 1.72;
      }

      .cm-content {
        font-variant-ligatures: contextual;
      }

      .cm-selectionBackground {
        background: hsl(var(--foreground) / 0.16) !important;
      }

      .cm-cursor {
        border-left-color: hsl(var(--foreground)) !important;
      }
    `
  });

  const removeMarkdownPost = api.render.registerMarkdownPostProcessor({
    id: "executive-mono-markdown",
    process: (html) =>
      html
        .replace(/<table(\s|>)/g, '<table class="executive-mono-table"$1')
        .replace(/<hr(\s|>)/g, '<hr class="executive-mono-divider"$1')
  });

  const removeReadingPost = api.render.registerReadingViewPostProcessor({
    id: "executive-mono-reading",
    process: (container) => {
      container.classList.add("executive-mono-reading");
      return () => {
        container.classList.remove("executive-mono-reading");
      };
    }
  });

  const removePaletteGroup = api.ui.registerCommandPaletteGroup({
    id: "executive-mono",
    title: "Executive Monochrome",
    commands: [
      {
        id: "toggle-density",
        title: "Executive Monochrome: Toggle Dense Mode",
        description: "Switch between standard and compact spacing",
        hotkey: "Mod+Shift+M",
        run: () => {
          const dense = api.storage.get(keys.density) === "dense";
          api.storage.set(keys.density, dense ? "normal" : "dense");
          syncMode();
          api.ui.notify(`Executive density ${dense ? "NORMAL" : "DENSE"}`);
        }
      },
      {
        id: "toggle-focus-width",
        title: "Executive Monochrome: Toggle Focus Width",
        description: "Constrain reading width for long-form readability",
        run: () => {
          const focus = api.storage.get(keys.focus) !== "off";
          api.storage.set(keys.focus, focus ? "off" : "on");
          syncMode();
          api.ui.notify(`Executive focus width ${focus ? "OFF" : "ON"}`);
        }
      },
      {
        id: "reapply",
        title: "Executive Monochrome: Reapply Theme",
        description: "Reapply monochrome business tokens and layout",
        run: () => {
          api.theme.applyPreset(presetId);
          syncMode();
          api.ui.notify("Executive Monochrome reapplied");
        }
      }
    ]
  });

  const removeStatus = api.ui.registerStatusBarItem({
    id: "executive-mono-status",
    text: "EXEC",
    align: "right",
    order: 118
  });

  const removeSettings = api.ui.registerSettingSection({
    id: "executive-mono-settings",
    title: "Executive Monochrome",
    html: `
      <p><strong>Executive Monochrome is active.</strong></p>
      <p>Designed for restrained, high-readability writing and review workflows.</p>
      <p>Commands: <code>Toggle Dense Mode</code>, <code>Toggle Focus Width</code>, <code>Reapply Theme</code>.</p>
    `
  });

  api.ui.notify("Executive Monochrome loaded");
  api.logger.info(`[${plugin.id}] loaded`);

  return () => {
    removeSettings();
    removeStatus();
    removePaletteGroup();
    removeReadingPost();
    removeMarkdownPost();
    removeEditorSkin();
    removeStyle();
    removePreset();
    root.classList.remove("executive-mono-mode", "executive-mono-dense", "executive-mono-focus");
    api.logger.info(`[${plugin.id}] unloaded`);
  };
};
