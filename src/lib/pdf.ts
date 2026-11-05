// Turns a printable HTML page into a PDF (receipts, certificates, ID cards,
// report cards, list printouts), using a headless Chromium on the server.
// CHROMIUM_PATH points at the browser; see docs/DEPLOYMENT.md. On Vercel (and
// AWS Lambda), where no browser is installed, the Chromium build packed in
// @sparticuz/chromium is used instead.
//
// When no PDF can be made, htmlToPdf throws PdfUnavailableError, and a route
// wrapped in withPdfErrors() shows the document as a printable page (Print, then
// "Save as PDF") instead of failing or loading forever.
import "server-only";

import type { Browser } from "playwright-core";

const LAUNCH_TIMEOUT_MS = 30_000;
const RENDER_TIMEOUT_MS = 30_000;

/** True on a serverless host with no browser of its own (Vercel, AWS Lambda). */
export function onServerless(env: NodeJS.ProcessEnv = process.env) {
  return !env.CHROMIUM_PATH && Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME);
}

/** No PDF could be made (no browser, or it crashed). Carries the document's HTML for the printable fallback. */
export class PdfUnavailableError extends Error {
  constructor(public readonly html: string | null, cause?: unknown) {
    super(`The PDF could not be made: ${cause instanceof Error ? cause.message : String(cause ?? "unknown reason")}`);
    this.name = "PdfUnavailableError";
  }
}

let browser: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  if (onServerless()) {
    const { default: lambda } = await import("@sparticuz/chromium");
    return chromium.launch({
      executablePath: await lambda.executablePath(),
      // Playwright sets the headless mode itself.
      args: [...lambda.args.filter((a) => !a.startsWith("--headless")), "--font-render-hinting=none"],
      headless: true,
      timeout: LAUNCH_TIMEOUT_MS,
    });
  }
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
    timeout: LAUNCH_TIMEOUT_MS,
  });
}

/**
 * The shared browser. A browser that closed is started again once; a browser
 * that cannot start fails at once (it used to retry forever, so every Print and
 * PDF button loaded until the server gave up).
 */
async function getBrowser(): Promise<Browser> {
  if (browser) {
    try {
      const b = await browser;
      if (b.isConnected()) return b;
    } catch {
      // The last start failed; try a fresh start below.
    }
    browser = null;
  }
  const starting = launch();
  browser = starting;
  try {
    const b = await starting;
    b.on("disconnected", () => { if (browser === starting) browser = null; });
    return b;
  } catch (e) {
    if (browser === starting) browser = null;
    throw e;
  }
}

/**
 * The serverless browser has only Latin fonts. Documents name "Noto Sans" or
 * "Noto Serif" in their font lists, so the app's own Noto files for the Indian
 * scripts are added under those names (each used only for its own letters).
 */
let indianFonts: Promise<string> | null = null;
const INDIAN_FONTS: [file: string, range: string][] = [
  ["noto-sans-devanagari.woff2", "U+0900-097F, U+1CD0-1CFF, U+A8E0-A8FF, U+200C-200D, U+25CC"],
  ["noto-sans-bengali.woff2", "U+0980-09FF, U+200C-200D, U+25CC"],
  ["noto-sans-telugu.woff2", "U+0C00-0C7F, U+200C-200D, U+25CC"],
  ["noto-sans-tamil.woff2", "U+0B80-0BFF, U+200C-200D, U+25CC"],
  ["noto-sans-kannada.woff2", "U+0C80-0CFF, U+200C-200D, U+25CC"],
  ["noto-sans-malayalam.woff2", "U+0D00-0D7F, U+200C-200D, U+25CC"],
];
function indianFontCss(): Promise<string> {
  indianFonts ??= (async () => {
    const [{ readFile }, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
    const faces: string[] = [];
    for (const [file, range] of INDIAN_FONTS) {
      try {
        const data = (await readFile(join(process.cwd(), "src", "app", "fonts", file))).toString("base64");
        for (const family of ["Noto Sans", "Noto Serif"]) {
          faces.push(`@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${data}) format("woff2");font-weight:100 900;unicode-range:${range}}`);
        }
      } catch {
        // A missing font file only means those letters print in a fallback font.
      }
    }
    return faces.length ? `<style>${faces.join("")}</style>` : "";
  })();
  return indianFonts;
}

/** Puts extra markup at the start of the document's <head> (or at the very start). */
export function addToHead(html: string, extra: string) {
  if (!extra) return html;
  const m = /<head[^>]*>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + extra + html.slice(m.index + m[0].length) : extra + html;
}

export type PdfOptions = { format?: "A4" | "A5" | "Letter"; landscape?: boolean; width?: string; height?: string; margin?: string };

export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
  let b: Browser;
  try {
    b = await getBrowser();
  } catch (e) {
    console.error("PDF: the browser could not start.", e);
    throw new PdfUnavailableError(html, e);
  }
  const content = onServerless() ? addToHead(html, await indianFontCss()) : html;
  let context;
  try {
    context = await b.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    // No outside requests: everything a document needs is inline.
    await page.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await page.setContent(content, { waitUntil: "load", timeout: RENDER_TIMEOUT_MS });
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
  } catch (e) {
    console.error("PDF: the document could not be printed.", e);
    throw new PdfUnavailableError(html, e);
  } finally {
    await context?.close().catch(() => {});
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

const FALLBACK_BAR = `<style>
  .sos-pdf-bar{font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#FFF7E6;color:#3D2A00;border-bottom:1px solid #E8C77A;padding:12px 16px;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
  .sos-pdf-bar p{margin:0;flex:1 1 260px}
  .sos-pdf-bar button{font:inherit;font-weight:600;background:#1D4ED8;color:#fff;border:0;border-radius:10px;padding:9px 18px;cursor:pointer}
  .sos-pdf-bar button:focus-visible{outline:3px solid #93C5FD;outline-offset:2px}
  @media print{.sos-pdf-bar{display:none!important}}
</style>
<div class="sos-pdf-bar" role="status"><p><strong>The PDF could not be made just now.</strong> The document is shown below. Choose Print, then “Save as PDF” to keep a copy, or try the PDF again in a minute.</p><button type="button" onclick="window.print()">Print</button></div>`;

/** The document as a printable page, with a bar that explains why and offers Print. */
export function pdfFallbackPage(html: string): string {
  const m = /<body[^>]*>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + FALLBACK_BAR + html.slice(m.index + m[0].length) : `<!doctype html><meta charset="utf-8">${FALLBACK_BAR}${html}`;
}

const NO_PDF_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDF not ready</title>
<style>body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;margin:0;padding:48px 16px;background:#fff;color:#111}main{max-width:520px;margin:0 auto}h1{font-size:22px;margin:0 0 8px}a{color:#1D4ED8}</style></head>
<body><main><h1>The PDF could not be made just now</h1><p>Please try again in a minute. If it keeps happening, tell DREAM TEAM support.</p><p><a href="javascript:history.back()">Go back</a></p></main></body></html>`;

/** The response for a PDF that could not be made: the printable page, or a plain message. */
export function pdfUnavailableResponse(e: PdfUnavailableError): Response {
  return new Response(e.html ? pdfFallbackPage(e.html) : NO_PDF_PAGE, {
    status: e.html ? 200 : 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-PDF-Fallback": "1" },
  });
}

/**
 * Wraps a route that answers with a PDF: when the PDF cannot be made, the person
 * sees the document as a printable page (or a clear message), never a blank error
 * or a page that loads forever.
 */
export function withPdfErrors<A extends unknown[]>(handler: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof PdfUnavailableError) return pdfUnavailableResponse(e);
      throw e;
    }
  };
}
