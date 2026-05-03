import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#0c0f14", 900: "#121722", 800: "#1a2130", 700: "#252f42" },
        mist: { 100: "#e8ecf4", 200: "#d1d8e6", 300: "#a8b4cc" },
        accent: { DEFAULT: "#3d7eff", muted: "#2a5fcc" },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
