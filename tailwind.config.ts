import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // DCC Dungeon palette
        dungeon: {
          950: "#0a0a0f",   // Deepest void
          900: "#0f1019",   // Main background
          850: "#141622",   // Elevated surface
          800: "#1a1d2e",   // Card background
          700: "#252a3a",   // Borders, dividers
          600: "#353b4f",   // Muted elements
          500: "#4a5168",   // Secondary text
        },
        // The System — crimson
        crimson: {
          DEFAULT: "#DC2626",
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#DC2626",
          600: "#b91c1c",
          700: "#991b1b",
          800: "#7f1d1d",
          900: "#450a0a",
        },
        // Zev / Gold accents
        gold: {
          DEFAULT: "#D4A857",
          50: "#fefce8",
          100: "#fef9c3",
          200: "#fef08a",
          300: "#fde047",
          400: "#D4A857",
          500: "#b8942e",
          600: "#92751e",
          700: "#6b5615",
          800: "#4a3b0f",
          900: "#2a2108",
        },
      },
      fontFamily: {
        display: ['"Cinzel"', "serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      backgroundImage: {
        "dungeon-gradient": "linear-gradient(180deg, #0a0a0f 0%, #0f1019 50%, #141622 100%)",
        "card-gradient": "linear-gradient(135deg, #1a1d2e 0%, #141622 100%)",
        "crimson-glow": "radial-gradient(ellipse at center, rgba(220,38,38,0.15) 0%, transparent 70%)",
        "gold-glow": "radial-gradient(ellipse at center, rgba(212,168,87,0.1) 0%, transparent 70%)",
      },
      boxShadow: {
        "dungeon": "0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
        "dungeon-lg": "0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)",
        "crimson-glow": "0 0 20px rgba(220,38,38,0.15), 0 0 4px rgba(220,38,38,0.1)",
        "gold-glow": "0 0 20px rgba(212,168,87,0.15), 0 0 4px rgba(212,168,87,0.1)",
      },
      borderColor: {
        "dungeon": "rgba(255,255,255,0.06)",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "flicker": "flicker 3s ease-in-out infinite alternate",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
