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
        brown: {
          DEFAULT: "var(--color-brand-brown)",
          dark: "var(--color-brand-brown-dark)",
        },
        champagne: "var(--color-brand-champagne)",
        sand: "var(--color-brand-sand)",
        ivory: "var(--color-brand-ivory)",
        stone: "var(--color-stone)",
        muted: "var(--color-muted)",
        line: "var(--color-border)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        info: "var(--color-info)",
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
