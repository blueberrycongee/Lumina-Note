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
        ribbon: "hsl(var(--ui-ribbon))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        display: ["var(--font-display)"],
      },
      fontSize: {
        "ui-micro": ["10px", { lineHeight: "13px" }],
        "ui-caption": ["10.5px", { lineHeight: "13px" }],
        "ui-meta": ["11.5px", { lineHeight: "15px" }],
        "ui-tree": ["11px", { lineHeight: "14px" }],
        "ui-sidebar": ["11.5px", { lineHeight: "15px" }],
        "ui-control": ["12px", { lineHeight: "15px" }],
        "ui-body": ["13px", { lineHeight: "20px" }],
      },
      borderRadius: {
        "ui-sm": "var(--ui-radius-sm)",
        "ui-md": "var(--ui-radius-md)",
        "ui-lg": "var(--ui-radius-lg)",
        "ui-xl": "var(--ui-radius-xl)",
      },
      boxShadow: {
        // New three-stop elevation (use these for new code)
        "elev-1": "var(--elev-1)",
        "elev-2": "var(--elev-2)",
        "elev-3": "var(--elev-3)",
        // Legacy aliases — kept so existing components don't break mid-migration
        "ui-card": "var(--elev-1)",
        "ui-float": "var(--elev-2)",
      },
      transitionDuration: {
        fast: "var(--motion-fast)",
        open: "var(--motion-open)",
        exit: "var(--motion-exit)",
        content: "var(--motion-content)",
      },
      transitionTimingFunction: {
        spring: "var(--motion-ease-spring)",
        "out-subtle": "var(--motion-ease-out)",
        standard: "var(--motion-ease-standard)",
      },
      animation: {
        // Fresh, token-aligned motion
        "pop-in": "popIn var(--motion-open) var(--motion-ease-spring)",
        "pop-out": "popOut var(--motion-exit) var(--motion-ease-out)",
        "fade-in-sm":
          "fadeInSm var(--motion-open) var(--motion-ease-standard)",
        // Legacy aliases kept for unmigrated callers
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-in": "slideIn 0.2s ease-out",
        "spotlight-overlay": "spotlightOverlay 0.18s ease-out",
        "spotlight-in": "spotlightIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        popIn: {
          "0%": { opacity: "0", transform: "translateY(4px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        popOut: {
          "0%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(2px) scale(0.99)" },
        },
        fadeInSm: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        spotlightOverlay: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        spotlightIn: {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
}
