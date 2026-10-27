/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Brutal"',
          '"Brutal Type"',
          '"Inter"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        background: "var(--bg-base)",
        surface: "var(--bg-surface)",
        card: "var(--bg-card)",
        border: "var(--border-color)",
        primary: {
          DEFAULT: "var(--accent-primary)",
          hover: "var(--accent-primary)",
        },
        muted: "var(--text-muted)",
      },
    },
  },
  plugins: [],
};
