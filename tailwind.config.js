/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: "hsl(var(--ui-surface))",
        panel: "hsl(var(--ui-panel))",
        "panel-2": "hsl(var(--ui-panel-2))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
      },
      borderRadius: {
        "ui-sm": "var(--ui-radius-sm)",
        "ui-md": "var(--ui-radius-md)",
        "ui-lg": "var(--ui-radius-lg)",
      },
      boxShadow: {
        "ui-card":
          "0 1px 0 hsl(var(--foreground) / 0.06), 0 10px 24px -18px hsl(var(--foreground) / 0.45)",
        "ui-float":
          "0 0 0 1px hsl(var(--border) / 0.8), 0 18px 40px -20px hsl(var(--foreground) / 0.6)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-in": "slideIn 0.2s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
}
