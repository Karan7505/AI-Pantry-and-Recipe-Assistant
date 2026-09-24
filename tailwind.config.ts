import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm, food-inspired palette (no default purple/blue)
        cream: {
          50: "#FBF8F1",
          100: "#F5EFE2",
          200: "#EBE0C9",
        },
        herb: {
          50: "#EFF7F0",
          100: "#D6EBDA",
          200: "#ABD7B6",
          300: "#77BE8B",
          400: "#4AA067",
          500: "#2F855A",
          600: "#256B4A",
          700: "#1E563C",
          800: "#173F2C",
          900: "#102A1E",
        },
        tomato: {
          50: "#FDF2F0",
          100: "#FBE1DB",
          200: "#F6C4B9",
          300: "#EF9E8D",
          400: "#E5725B",
          500: "#D9553C",
          600: "#C03D24",
          700: "#9A2F1C",
          800: "#7A2617",
          900: "#5C1E13",
        },
        amber: {
          400: "#F5B73C",
          500: "#E89C1C",
        },
        ink: {
          50: "#F6F7F6",
          100: "#E7E9E7",
          200: "#C9CDCB",
          300: "#A0A6A3",
          400: "#737B78",
          500: "#565E5B",
          600: "#414946",
          700: "#333A38",
          800: "#242A28",
          900: "#191E1C",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(25,30,28,0.04), 0 8px 24px rgba(25,30,28,0.06)",
      },
      borderRadius: {
        xl2: "1rem",
      },
    },
  },
  plugins: [],
};

export default config;
