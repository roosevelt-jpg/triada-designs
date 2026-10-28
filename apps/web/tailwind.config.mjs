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
        muted: "var(--color-muted)",
        line: "var(--color-border)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        info: "var(--color-info)",
      },
      keyframes: {
        "fade-rise": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "gold-sheen": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "0.85" },
        },
      },
      animation: {
        "fade-rise": "fade-rise 320ms ease both",
        "gold-sheen": "gold-sheen 8s ease-in-out infinite",
        "pulse-soft": "pulse-soft 3.6s ease-in-out infinite",
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
