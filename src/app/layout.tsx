import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { ACCENT_COOKIE, SIZE_COOKIE, THEME_COOKIE, cleanAccent, cleanTextSize, cleanTheme } from "@/lib/theme";
import { Suspense } from "react";
import { ScrollHints } from "@/components/ui/scroll-hints";
import { LANG_COOKIE, cleanLang } from "@/lib/i18n/languages";
import "./globals.css";

// The approved design's type: Figtree for reading, Bricolage Grotesque for titles and numbers.
// The variable font files ship with the app (src/app/fonts, from Google Fonts, SIL Open Font
// License), so a build never depends on reaching Google and pages never wait on it.
const figtree = localFont({ src: "./fonts/figtree.woff2", weight: "400 800", variable: "--font-figtree", display: "swap" });
const bricolage = localFont({ src: "./fonts/bricolage-grotesque.woff2", weight: "500 700", variable: "--font-bricolage", display: "swap" });
const mono = localFont({ src: "./fonts/jetbrains-mono.woff2", weight: "500 600", variable: "--font-jetbrains", display: "swap" });

// The school's Indian languages (00-global.md P17): Noto Sans for each script, shipped with the app
// (src/app/fonts, from Google Fonts via Fontsource, SIL Open Font License). Each is fetched only
// when a page has letters of its script (unicode-range), so an English page loads none of them.
// next/font needs each call written out in full.
const devanagari = localFont({ src: "./fonts/noto-sans-devanagari.woff2", weight: "400 800", variable: "--font-deva", display: "swap", preload: false, adjustFontFallback: false, declarations: [{ prop: "unicode-range", value: "U+0900-097F, U+1CD0-1CFF, U+A8E0-A8FF, U+200C-200D, U+25CC" }] });
const bengali = localFont({ src: "./fonts/noto-sans-bengali.woff2", weight: "400 800", variable: "--font-beng", display: "swap", preload: false, adjustFontFallback: false, declarations: [{ prop: "unicode-range", value: "U+0980-09FF, U+200C-200D, U+25CC" }] });
const telugu = localFont({ src: "./fonts/noto-sans-telugu.woff2", weight: "400 800", variable: "--font-telu", display: "swap", preload: false, adjustFontFallback: false, declarations: [{ prop: "unicode-range", value: "U+0C00-0C7F, U+200C-200D, U+25CC" }] });
const tamil = localFont({ src: "./fonts/noto-sans-tamil.woff2", weight: "400 800", variable: "--font-taml", display: "swap", preload: false, adjustFontFallback: false, declarations: [{ prop: "unicode-range", value: "U+0B80-0BFF, U+200C-200D, U+25CC" }] });
const kannada = localFont({ src: "./fonts/noto-sans-kannada.woff2", weight: "400 800", variable: "--font-knda", display: "swap", preload: false, adjustFontFallback: false, declarations: [{ prop: "unicode-range", value: "U+0C80-0CFF, U+200C-200D, U+25CC" }] });
const malayalam = localFont({ src: "./fonts/noto-sans-malayalam.woff2", weight: "400 800", variable: "--font-mlym", display: "swap", preload: false, adjustFontFallback: false, declarations: [{ prop: "unicode-range", value: "U+0D00-0D7F, U+200C-200D, U+25CC" }] });
const indicFonts = [devanagari, bengali, telugu, tamil, kannada, malayalam].map((f) => f.variable).join(" ");

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
      // The person's screen language when known (pages set it again once they load: src/lib/i18n/client.tsx).
      lang={cleanLang(jar.get(LANG_COOKIE)?.value)}
      data-theme={cleanTheme(jar.get(THEME_COOKIE)?.value)}
      data-accent={cleanAccent(jar.get(ACCENT_COOKIE)?.value)}
      data-size={cleanTextSize(jar.get(SIZE_COOKIE)?.value)}
      className={`${figtree.variable} ${bricolage.variable} ${mono.variable} ${indicFonts}`}
    >
      <body className="min-h-dvh">
        {children}
        {/* Sideways-scrolling rows on every page: selected item in view, fades, scrollbar on computers. */}
        <Suspense fallback={null}><ScrollHints /></Suspense>
      </body>
    </html>
  );
}
