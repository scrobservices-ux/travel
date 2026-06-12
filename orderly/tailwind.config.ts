import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Premium, calm, "ordered" palette — warm ivory + deep ink + brass accent.
        ink: {
          DEFAULT: "#0c0a09",
          soft: "#1c1917",
          muted: "#44403c",
        },
        ivory: {
          DEFAULT: "#f7f4ee",
          deep: "#efe9df",
        },
        brass: {
          DEFAULT: "#b08d57",
          light: "#d8b888",
          dark: "#8a6d3e",
        },
        sage: {
          DEFAULT: "#5b6b58",
          light: "#8a9a82",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        shimmer: "shimmer 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
