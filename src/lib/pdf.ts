// Turns a printable HTML page into a PDF (receipts, certificates, ID cards,
// report cards, list printouts), using a headless Chromium on the server.
// CHROMIUM_PATH points at the browser; see docs/DEPLOYMENT.md.
import "server-only";

import type { Browser } from "playwright-core";

let browser: Promise<Browser> | null = null;

async function getBrowser() {
  browser ??= import("playwright-core").then(({ chromium }) =>
    chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
    }),
  );
  try {
    const b = await browser;
    if (!b.isConnected()) throw new Error("closed");
    return b;
  } catch {
    browser = null;
    return getBrowser();
  }
}

export type PdfOptions = { format?: "A4" | "A5" | "Letter"; landscape?: boolean; width?: string; height?: string; margin?: string };

export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
  const b = await getBrowser();
  const context = await b.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    // No outside requests: everything a document needs is inline.
    await page.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await page.setContent(html, { waitUntil: "load" });
    const margin = opts.margin ?? "12mm";
    const pdf = await page.pdf({
      format: opts.width ? undefined : opts.format ?? "A4",
      width: opts.width,
      height: opts.height,
      landscape: opts.landscape,
      printBackground: true,
      margin: { top: margin, bottom: margin, left: margin, right: margin },
    });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}

/** Escapes text for HTML documents. Every merge field goes through this. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
