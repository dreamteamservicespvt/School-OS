import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ACCENT_COOKIE, THEME_COOKIE, cleanAccent, cleanTheme } from "@/lib/theme";
import "./globals.css";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  return (
    <html lang="en" data-theme={cleanTheme(jar.get(THEME_COOKIE)?.value)} data-accent={cleanAccent(jar.get(ACCENT_COOKIE)?.value)}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
