/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,jsx,mdx}",
    "./src/components/**/*.{js,jsx,mdx}",
    "./src/app/**/*.{js,jsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "var(--color-brand-ink)",
        black: "var(--color-black)",
        brown: {
          DEFAULT: "var(--color-brand-brown)",
          dark: "var(--color-brand-brown-dark)",
        },
        champagne: "var(--color-brand-champagne)",
        gold: "var(--color-brand-gold)",
        sand: "var(--color-brand-sand)",
        ivory: "var(--color-brand-ivory)",
        stone: "var(--color-stone)",
        field: "var(--color-field)",
        muted: "var(--color-muted)",
        line: "var(--color-border)",
        "line-strong": "var(--color-border-strong)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        info: "var(--color-info)",
      },
      keyframes: {
        "fade-rise": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "rule-draw": {
          from: { transform: "scaleX(0)", opacity: "0.4" },
          to: { transform: "scaleX(1)", opacity: "1" },
        },
      },
      animation: {
        "fade-rise": "fade-rise 280ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "rule-draw": "rule-draw 420ms ease both",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        popover: "var(--shadow-popover)",
      },
      maxWidth: {
        content: "var(--content-max-width)",
      },
    },
  },
  plugins: [],
};
