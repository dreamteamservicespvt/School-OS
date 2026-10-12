import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ACCENT_COOKIE, SIZE_COOKIE, THEME_COOKIE, cleanAccent, cleanTextSize, cleanTheme } from "@/lib/theme";
import "./globals.css";

// The approved design's type: Figtree for reading, Bricolage Grotesque for titles and numbers.
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-figtree", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-bricolage", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "School OS", template: "%s · School OS" },
  description: "The complete software for running a school.",
  applicationName: "School OS",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "School OS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6f5" },
    { media: "(prefers-color-scheme: dark)", color: "#090d0d" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  return (
    <html
      lang="en"
      data-theme={cleanTheme(jar.get(THEME_COOKIE)?.value)}
      data-accent={cleanAccent(jar.get(ACCENT_COOKIE)?.value)}
      data-size={cleanTextSize(jar.get(SIZE_COOKIE)?.value)}
      className={`${figtree.variable} ${bricolage.variable} ${mono.variable}`}
    >
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
