import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

// UI sans: nav, buttons, forms, body copy. See docs/DESIGN-SYSTEM.md for why.
const fontUi = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

// Editorial display face, for major headings only.
const fontDisplay = Fraunces({
  variable: "--font-display-face",
  subsets: ["latin"],
  display: "swap",
});

const siteName = "Couch";
const description =
  "Pick something to watch, then settle in together. Couch keeps everyone in sync, wherever they are.";

// Lets Next resolve the social-share image URLs to absolute ones. Optional:
// when unset (for example in CI builds) they stay relative.
const baseUrl = process.env.BETTER_AUTH_URL;

export const metadata: Metadata = {
  ...(baseUrl ? { metadataBase: new URL(baseUrl) } : {}),
  title: { default: siteName, template: `%s | ${siteName}` },
  description,
  applicationName: siteName,
  openGraph: {
    type: "website",
    siteName,
    title: siteName,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#171412",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fontUi.variable} ${fontDisplay.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
