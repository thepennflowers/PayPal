import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bloom: {
          50: "#fdf2f8",
          100: "#fce7f3",
          400: "#f472b6",
          600: "#db2777",
          900: "#831843",
        },
        leaf: {
          600: "#15803d",
          700: "#166534",
        },
      },
    },
  },
  plugins: [],
};

export default config;
