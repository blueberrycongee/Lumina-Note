export interface ThemeTokens {
  colors: {
    background: string;
    surface: string;
    text: string;
    mutedText: string;
    primary: string;
    border: string;
  };
  typography: {
    bodyFont: string;
    displayFont: string;
    codeFont: string;
    baseSize: string;
    lineHeight: string;
  };
  radius: {
    sm: string;
    md: string;
    lg: string;
  };
  spacing: {
    section: string;
    card: string;
    contentMaxWidth: string;
  };
}

export const defaultTheme: ThemeTokens = {
  colors: {
    background: "#f7f5f2",
    surface: "#ffffff",
    text: "#1f2933",
    mutedText: "#5f6c7b",
    primary: "#3c6e71",
    border: "#e6e2da",
  },
  typography: {
    bodyFont: '"IBM Plex Sans", system-ui, sans-serif',
    displayFont: '"Playfair Display", "Times New Roman", serif',
    codeFont: '"IBM Plex Mono", ui-monospace, monospace',
    baseSize: "16px",
    lineHeight: "1.7",
  },
  radius: {
    sm: "6px",
    md: "12px",
    lg: "20px",
  },
  spacing: {
    section: "32px",
    card: "20px",
    contentMaxWidth: "960px",
  },
};

export const buildThemeCss = (theme: ThemeTokens): string => {
  return `:root {
  --color-bg: ${theme.colors.background};
  --color-surface: ${theme.colors.surface};
  --color-text: ${theme.colors.text};
  --color-muted: ${theme.colors.mutedText};
  --color-primary: ${theme.colors.primary};
  --color-border: ${theme.colors.border};
  --font-body: ${theme.typography.bodyFont};
  --font-display: ${theme.typography.displayFont};
  --font-code: ${theme.typography.codeFont};
  --font-size-base: ${theme.typography.baseSize};
  --line-height-base: ${theme.typography.lineHeight};
  --radius-sm: ${theme.radius.sm};
  --radius-md: ${theme.radius.md};
  --radius-lg: ${theme.radius.lg};
  --space-section: ${theme.spacing.section};
  --space-card: ${theme.spacing.card};
  --content-max-width: ${theme.spacing.contentMaxWidth};
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  background: var(--color-bg);
  color: var(--color-text);
}

a { color: var(--color-primary); text-decoration: none; }
a:hover { text-decoration: underline; }

.site-shell {
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: var(--space-section) 24px 64px;
}

.hero {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-section);
  box-shadow: 0 10px 30px rgba(0,0,0,0.05);
}

.hero h1 {
  font-family: var(--font-display);
  font-size: 2.4rem;
  margin: 0 0 12px;
}

.hero .bio { color: var(--color-muted); margin: 0; }

.section {
  margin-top: var(--space-section);
}

.section h2 {
  margin: 0 0 16px;
  font-size: 1.25rem;
}

.card-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-card);
}

.card h3 { margin: 0 0 8px; }

.card .meta { color: var(--color-muted); font-size: 0.85rem; }

.post-header {
  margin-bottom: 24px;
}

.post-title {
  font-family: var(--font-display);
  font-size: 2rem;
  margin: 0 0 8px;
}

.post-meta {
  color: var(--color-muted);
  font-size: 0.9rem;
}

.post-content img {
  max-width: 100%;
  border-radius: var(--radius-md);
}

.post-content pre {
  background: #f2f4f6;
  padding: 16px;
  border-radius: var(--radius-md);
  overflow: auto;
  font-family: var(--font-code);
}
`;
};
