import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // THEO brand purple — derived from the logo hex icon (#9175FF)
        // Used everywhere green was used before (buttons, accents, focus rings, etc.)
        brand: {
          50:  '#EDEDFE',
          100: '#D8D7FD',
          200: '#B3B2FB',
          300: '#8E8CF8',
          400: '#7B7AF4',  // hover state — slightly lighter than 500
          500: '#5C5BF0',  // rgb(92, 91, 240) — main button color
          600: '#4A49C8',
          700: '#3837A0',
          800: '#272678',
          900: '#161550',
          950: '#0B0A2E',
        },
      },
    },
  },
  plugins: [],
};
export default config;
