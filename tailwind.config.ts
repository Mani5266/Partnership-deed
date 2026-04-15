import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── OnEasy Design System ──────────────────────────────────────────
        // Gold accent palette (from variables.css --accent-*)
        gold: {
          50:  "#fefce8",
          100: "#fef9e7",
          200: "#fdf0c4",
          300: "#fce49c",
          400: "#f9d056",
          500: "#f0b929",  // --accent (primary gold)
          600: "#d9a21e",  // --accent-dark
          700: "#b58316",
          800: "#8c6511",
          900: "#6b4d0d",
        },
        // Navy/slate palette (from variables.css --primary-*)
        navy: {
          50:  "#f8f9fc",  // --bg-main
          100: "#f1f5f9",  // --border-light
          200: "#e2e8f0",  // --border, --text-on-dark
          300: "#cbd5e1",
          400: "#94a3b8",  // --text-light, --sidebar-text-muted
          500: "#64748b",  // --text-muted
          600: "#475569",
          700: "#334155",  // --primary-mid
          800: "#1e293b",  // --primary-light, --text-main
          900: "#0f172a",  // --primary, --bg-sidebar
          950: "#0b1220",
        },
        // Semantic aliases
        primary: {
          DEFAULT: "#0f172a",
          light:   "#1e293b",
          mid:     "#334155",
        },
        accent: {
          DEFAULT: "#f0b929",
          light:   "#f9d056",
          dark:    "#d9a21e",
          bg:      "#fefce8",
        },
        sidebar: {
          bg:      "#0f172a",
          text:    "#f1f5f9",
          muted:   "#94a3b8",
          accent:  "#f0b929",
          border:  "rgba(255, 255, 255, 0.08)",
          hover:   "rgba(255, 255, 255, 0.06)",
          active:  "rgba(255, 255, 255, 0.1)",
        },
      },
      fontFamily: {
        body: ["'DM Sans'", "system-ui", "-apple-system", "sans-serif"],
        display: ["'DM Serif Display'", "Georgia", "serif"],
      },
      borderRadius: {
        DEFAULT: "10px",
        sm:  "6px",
        lg:  "16px",
      },
      boxShadow: {
        sm:  "0 1px 3px 0 rgb(15 23 42 / 0.04)",
        DEFAULT: "0 4px 12px -2px rgb(15 23 42 / 0.07)",
        lg:  "0 12px 28px -4px rgb(15 23 42 / 0.1)",
      },
      fontSize: {
        // Map custom sizes from variables.css
        "2xs": ["0.72rem", { lineHeight: "1rem" }],
      },
      transitionTimingFunction: {
        ease: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      animation: {
        "spin-slow": "spin 0.8s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
