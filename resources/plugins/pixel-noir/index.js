module.exports = function setup(api, plugin) {
  const presetId = "pixel-noir";
  const root = document.documentElement;

  const removePreset = api.theme.registerPreset({
    id: presetId,
    name: "Pixel Noir",
    tokens: {
      "--radius": "0px",
      "--ui-radius-sm": "0px",
      "--ui-radius-md": "0px",
      "--ui-radius-lg": "0px",
      "--font-sans": '"IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      "--font-serif": '"IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      "--font-mono": '"IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      "--motion-fast": "80ms",
      "--motion-medium": "130ms"
    },
    light: {
      "--background": "0 0% 96%",
      "--foreground": "0 0% 8%",
      "--card": "0 0% 100%",
      "--card-foreground": "0 0% 8%",
      "--popover": "0 0% 100%",
      "--popover-foreground": "0 0% 8%",
      "--primary": "0 0% 12%",
      "--primary-foreground": "0 0% 98%",
      "--secondary": "0 0% 88%",
      "--secondary-foreground": "0 0% 12%",
      "--muted": "0 0% 84%",
      "--muted-foreground": "0 0% 26%",
      "--accent": "0 0% 20%",
      "--accent-foreground": "0 0% 100%",
      "--border": "0 0% 18%",
      "--input": "0 0% 18%",
      "--ring": "0 0% 12%"
    },
    dark: {
      "--background": "0 0% 7%",
      "--foreground": "0 0% 96%",
      "--card": "0 0% 10%",
      "--card-foreground": "0 0% 96%",
      "--popover": "0 0% 10%",
      "--popover-foreground": "0 0% 96%",
      "--primary": "0 0% 96%",
      "--primary-foreground": "0 0% 8%",
      "--secondary": "0 0% 18%",
      "--secondary-foreground": "0 0% 96%",
      "--muted": "0 0% 16%",
      "--muted-foreground": "0 0% 72%",
      "--accent": "0 0% 85%",
      "--accent-foreground": "0 0% 6%",
      "--border": "0 0% 84%",
      "--input": "0 0% 84%",
      "--ring": "0 0% 96%"
    }
  });

  api.theme.applyPreset(presetId);

  const syncScanlines = () => {
    const enabled = api.storage.get("scanlines") !== "off";
    root.classList.add("pixel-noir-mode");
    root.classList.toggle("pixel-noir-scanlines", enabled);
  };

  syncScanlines();

  const removeStyle = api.ui.injectStyle({
    layer: "override",
    global: true,
    css: `
      :root.pixel-noir-mode {
        --pixel-border: 2px;
        --pixel-shadow-step: 3px;
        --pixel-bg-size: 18px;
        --ui-radius-sm: 0px;
        --ui-radius-md: 0px;
        --ui-radius-lg: 0px;
      }

      :root.pixel-noir-mode,
      :root.pixel-noir-mode body {
        text-rendering: geometricPrecision;
        image-rendering: pixelated;
        background:
          linear-gradient(90deg, hsl(var(--background)) 50%, hsl(var(--card)) 50%);
        background-size: var(--pixel-bg-size) var(--pixel-bg-size);
      }

      :root.pixel-noir-mode body::after {
        content: "";
        pointer-events: none;
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        opacity: 0;
        background:
          repeating-linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0.10) 0,
            rgba(255, 255, 255, 0.10) 1px,
            transparent 1px,
            transparent 4px
          );
        transition: opacity 120ms steps(2, end);
      }

      :root.pixel-noir-mode.pixel-noir-scanlines body::after {
        opacity: 0.24;
      }

      :root.pixel-noir-mode :where(
        .ui-panel,
        .ui-card,
        .ui-glass,
        .sidebar,
        .tab-bar,
        .status-bar,
        .reading-view,
        .cm-editor,
        .tiptap,
        [role="dialog"],
        [class*="modal"],
        [class*="dialog"],
        [class*="popover"],
        [class*="panel"],
        [class*="sidebar"],
        [class*="toolbar"],
        [class*="tab"]
      ) {
        border-radius: 0 !important;
        border: var(--pixel-border) solid hsl(var(--border)) !important;
        box-shadow:
          var(--pixel-shadow-step) var(--pixel-shadow-step) 0 hsl(var(--background)),
          calc(var(--pixel-shadow-step) * 2) calc(var(--pixel-shadow-step) * 2) 0 hsl(var(--foreground) / 0.28) !important;
      }

      :root.pixel-noir-mode :where(button, [role="button"], input, textarea, select) {
        border-radius: 0 !important;
        border: var(--pixel-border) solid hsl(var(--border)) !important;
        box-shadow:
          2px 2px 0 hsl(var(--background)),
          4px 4px 0 hsl(var(--foreground) / 0.25);
        transition: transform 80ms steps(2, end), box-shadow 80ms steps(2, end);
      }

      :root.pixel-noir-mode :where(
        [class*="rounded"],
        .tiptap pre,
        .tiptap code,
        .tiptap .code-block,
        .callout,
        .katex-display,
        .wiki-link,
        .right-ai-mode-toggle,
        .ai-mode-toggle
      ) {
        border-radius: 0 !important;
      }

      :root.pixel-noir-mode ::-webkit-scrollbar-thumb {
        border-radius: 0 !important;
      }

      :root.pixel-noir-mode :where(button:hover, [role="button"]:hover) {
        transform: translate(-1px, -1px);
      }

      :root.pixel-noir-mode :where(button:active, [role="button"]:active) {
        transform: translate(2px, 2px);
        box-shadow: none;
      }

      :root.pixel-noir-mode :where(h1, h2, h3, h4, h5, h6) {
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      :root.pixel-noir-mode .pixel-noir-banner {
        font-family: var(--font-mono);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        font-size: 10px;
        padding: 4px 10px;
        border: 2px solid hsl(var(--border));
        background: hsl(var(--foreground));
        color: hsl(var(--background));
      }

      :root.pixel-noir-mode .pixel-noir-table {
        border-collapse: collapse;
      }

      :root.pixel-noir-mode .pixel-noir-table td,
      :root.pixel-noir-mode .pixel-noir-table th {
        border: 2px solid hsl(var(--border));
      }

      :root.pixel-noir-mode .pixel-noir-quote {
        border-left: 4px solid hsl(var(--foreground));
        background: hsl(var(--muted));
        padding: 8px 12px;
      }

      :root.pixel-noir-mode .pixel-noir-codeblock {
        margin: 0;
        border: 2px solid hsl(var(--border));
        background: hsl(var(--muted));
        padding: 12px;
      }
    `
  });

  const removeEditorSkin = api.editor.registerEditorExtension({
    id: "pixel-noir-editor",
    scopeId: "codemirror",
    layer: "override",
    css: `
      .cm-editor {
        image-rendering: pixelated;
      }

      .cm-cursor {
        border-left-width: 2px !important;
        border-left-color: hsl(var(--foreground)) !important;
      }

      .cm-selectionBackground {
        background: repeating-linear-gradient(
          45deg,
          hsl(var(--foreground) / 0.25),
          hsl(var(--foreground) / 0.25) 2px,
          transparent 2px,
          transparent 6px
        ) !important;
      }
    `
  });

  const removeMarkdownPost = api.render.registerMarkdownPostProcessor({
    id: "pixel-noir-markdown",
    process: (html) =>
      html
        .replace(/<table(\s|>)/g, '<table class="pixel-noir-table"$1')
        .replace(/<blockquote(\s|>)/g, '<blockquote class="pixel-noir-quote"$1')
  });

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const removeCodeRenderer = api.render.registerCodeBlockRenderer({
    id: "pixel-noir-code",
    language: "pixel",
    render: ({ code }) => `<pre class="pixel-noir-codeblock"><code>${escapeHtml(code)}</code></pre>`
  });

  const removeStatus = api.ui.registerStatusBarItem({
    id: "pixel-noir-status",
    text: "PIXEL/NOIR",
    align: "right",
    order: 120
  });

  const removeSettings = api.ui.registerSettingSection({
    id: "pixel-noir-settings",
    title: "Pixel Noir",
    html: `
      <p><strong>Pixel Noir enabled.</strong></p>
      <p>Command: <code>Pixel Noir: Toggle Scanlines</code></p>
      <p>Code block renderer: use <code>\`\`\`pixel</code> for monochrome framed blocks.</p>
    `
  });

  const removePaletteGroup = api.ui.registerCommandPaletteGroup({
    id: "pixel-noir",
    title: "Pixel Noir",
    commands: [
      {
        id: "toggle-scanlines",
        title: "Pixel Noir: Toggle Scanlines",
        description: "Toggle CRT-like scanline overlay",
        hotkey: "Mod+Shift+9",
        run: () => {
          const enabled = api.storage.get("scanlines") !== "off";
          api.storage.set("scanlines", enabled ? "off" : "on");
          syncScanlines();
          api.ui.notify(`Pixel Noir scanlines ${enabled ? "OFF" : "ON"}`);
        }
      },
      {
        id: "reapply",
        title: "Pixel Noir: Reapply Theme",
        description: "Reapply black-and-white token preset",
        run: () => {
          api.theme.applyPreset(presetId);
          root.classList.add("pixel-noir-mode");
          api.ui.notify("Pixel Noir theme reapplied");
        }
      }
    ]
  });

  const removeShellSlot = api.workspace.registerShellSlot({
    slotId: "app-top",
    order: 960,
    html: '<div class="pixel-noir-banner">pixel noir // monochrome mode</div>'
  });

  api.ui.notify("Pixel Noir loaded");
  api.logger.info(`[${plugin.id}] loaded`);

  return () => {
    removeShellSlot();
    removePaletteGroup();
    removeSettings();
    removeStatus();
    removeCodeRenderer();
    removeMarkdownPost();
    removeEditorSkin();
    removeStyle();
    removePreset();
    root.classList.remove("pixel-noir-mode");
    root.classList.remove("pixel-noir-scanlines");
    api.logger.info(`[${plugin.id}] unloaded`);
  };
};
