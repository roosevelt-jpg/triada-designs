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
    default: "Admin · Triada Designs",
    template: "%s · Triada Designs Admin",
  },
  description:
    "Triada Designs AI sales and marketing operations — admin login for the ops subdomain.",
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: [
      { url: "/brand/triada-favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/triada-favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/brand/triada-favicon-180.png", sizes: "180x180" }],
    shortcut: ["/brand/triada-favicon-32.png"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${sans.variable} antialiased`}
        style={{
          ["--font-display"]:
            "var(--font-display-loaded), Georgia, 'Times New Roman', serif",
          ["--font-sans"]:
            "var(--font-sans-loaded), 'Helvetica Neue', Helvetica, Arial, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
