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
        brand: {
          50: '#fff7f2',
          100: '#ffeedf',
          500: '#ea6e35',
          600: '#d95a20',
          700: '#b44315',
        }
      }
    },
  },
  plugins: [],
};
export default config;
