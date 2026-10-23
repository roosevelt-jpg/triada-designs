import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display-loaded",
  display: "swap",
});

const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-loaded",
  display: "swap",
});

export const metadata = {
  title: {
    default: "Triada Designs",
    template: "%s · Triada Designs",
  },
  description:
    "Thoughtfully selected products and services through a personal, design-led customer experience. AI sales and marketing operations for Triada Designs.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${sans.variable} antialiased`}
        style={{
          ["--font-display"]: "var(--font-display-loaded), Georgia, serif",
          ["--font-sans"]: "var(--font-sans-loaded), Inter, Arial, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
