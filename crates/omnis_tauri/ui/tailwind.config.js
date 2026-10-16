/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
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
