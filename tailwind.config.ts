import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          50: "#f3f7f2",
          100: "#e3ecdf",
          200: "#c7d9bf",
          300: "#a2bf95",
          400: "#7ba36b",
          500: "#5a8849",
          600: "#456c38",
          700: "#37562e",
          800: "#2e4628",
          900: "#283b23",
          950: "#142010",
        },
        lake: {
          50: "#f0f9fb",
          100: "#daeff4",
          200: "#bae0ea",
          300: "#88cad9",
          400: "#4daac0",
          500: "#308ea6",
          600: "#2c738c",
          700: "#2b5d72",
          800: "#2c4d5e",
          900: "#294150",
          950: "#172935",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
