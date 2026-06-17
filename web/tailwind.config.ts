import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          muted: "var(--color-ink-muted)",
          faint: "var(--color-ink-faint)",
        },
        glass: {
          border: "var(--color-glass-border)",
          fill: "var(--color-glass-fill)",
          highlight: "var(--color-glass-highlight)",
          "border-dense": "var(--color-glass-border-dense)",
          "fill-dense": "var(--color-glass-fill-dense)",
          "highlight-dense": "var(--color-glass-highlight-dense)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          soft: "var(--color-accent-soft)",
        },
      },
      borderRadius: {
        glass: "var(--radius-glass)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        glass: "var(--shadow-glass)",
        glow: "var(--shadow-glow)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
