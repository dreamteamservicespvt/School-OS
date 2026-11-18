import { createHash } from "node:crypto";
// Turns a printable HTML page into a PDF (receipts, certificates, ID cards,
// report cards, list printouts), using a headless Chromium on the server.
// CHROMIUM_PATH points at the browser; see docs/DEPLOYMENT.md. On Vercel (and
// AWS Lambda), where no browser is installed, @sparticuz/chromium fetches its
// Chromium pack (pinned release, PACK_URL) once per server instance into /tmp.
// The pack is not bundled: at ~68 MB in every function it pushed the app past
// the Hobby plan's 12 functions (deploys of 2026-11-12 failed).
//
// A start or a print that fails (a cold or just-woken server) is tried again
// inside the same request, within PDF_LIMITS. When no PDF can be made after
// that, htmlToPdf throws PdfUnavailableError, and a route wrapped in
// withPdfErrors() shows the document as a printable page (Print, or "Download
// PDF" to ask again) instead of failing or loading forever.
import "server-only";

import type { Browser } from "playwright-core";

const LAUNCH_TIMEOUT_MS = 30_000;
const RENDER_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 2_000;

/**
 * How hard one request tries before it shows the printable page instead. A start
 * or a print that fails, or gives no answer for `tryMs`, is tried again with a
 * fresh browser after `pauseMs`; no try runs past `budgetMs`. Live, the first
 * receipt after the site was idle came back as the printable page after 6
 * seconds, though the request had 60 (17 Nov 2026). The budget stays well inside
 * the 60 seconds every PDF route is given, so the person gets the PDF or the
 * printable page, never a request that dies.
 */
export const PDF_LIMITS = { tries: 3, tryMs: 20_000, budgetMs: 40_000, pauseMs: 300 };
export type PdfLimits = typeof PDF_LIMITS;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The work's answer, or an error once `ms` have passed (the work itself is not stopped). */
function within<T>(ms: number, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No answer within ${Math.round(ms / 100) / 10} seconds.`)), ms);
    work.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

/** True on a serverless host with no browser of its own (Vercel, AWS Lambda). */
export function onServerless(env: NodeJS.ProcessEnv = process.env) {
  return !env.CHROMIUM_PATH && Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME);
}

/** No PDF could be made (no browser, or it crashed). Carries the document's HTML and paper size for the printable fallback. */
export class PdfUnavailableError extends Error {
  constructor(public readonly html: string | null, cause?: unknown, public readonly opts: PdfOptions = {}) {
    super(`The PDF could not be made: ${cause instanceof Error ? cause.message : String(cause ?? "unknown reason")}`);
    this.name = "PdfUnavailableError";
  }
}

let browser: Promise<Browser> | null = null;

/** The Chromium pack for serverless hosts: the release matching @sparticuz/chromium in package.json. */
export const PACK_URL = "https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.x64.tar";

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  if (onServerless()) {
    const { default: lambda } = await import("@sparticuz/chromium");
    return chromium.launch({
      executablePath: await lambda.executablePath(process.env.CHROMIUM_PACK_URL || PACK_URL),
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
 * The shared browser. A browser that closed is started again; a browser that
 * cannot start fails at once here, and htmlToPdf decides whether to try again
 * (it used to retry forever, so every Print and PDF button loaded until the
 * server gave up).
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
// The rupee sign (U+20B9) comes from the Devanagari file: the serverless browser's Latin fonts have none, so receipts printed "20,000" with no ₹ (live test, 17 Nov 2026).
export const INDIAN_FONTS: [file: string, range: string][] = [
  ["noto-sans-devanagari.woff2", "U+0900-097F, U+1CD0-1CFF, U+A8E0-A8FF, U+200C-200D, U+20B9, U+25CC"],
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

/** Drops the shared browser (and closes it) so the next PDF starts a fresh one. */
async function dropBrowser(b: Browser) {
  if (browser) {
    const current = await browser.catch(() => null);
    if (current === b) browser = null;
  }
  // A dead browser may never answer: do not wait long for it to close.
  await within(CLOSE_TIMEOUT_MS, b.close()).catch(() => {});
}

/**
 * A browser kept from an earlier request can be dead while it still says it is
 * connected: Vercel freezes the server between requests. Live, every second
 * receipt came out as the "could not be made" page (school demo check, 14 Nov).
 * And on a server that was idle, the first start can fail or take long (17 Nov).
 * So a try that fails or gets stuck is made again with a fresh browser, at most
 * `tries` times inside `budgetMs` (PDF_LIMITS); only then is the printable page shown.
 */
export async function htmlToPdf(html: string, opts: PdfOptions = {}, limits: Partial<PdfLimits> = {}): Promise<Buffer> {
  const { tries, tryMs, budgetMs, pauseMs } = { ...PDF_LIMITS, ...limits };
  const content = onServerless() ? addToHead(html, await indianFontCss()) : html;
  const started = Date.now();
  let cause: unknown = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    if (attempt > 1) await sleep(pauseMs);
    const left = budgetMs - (Date.now() - started);
    if (left <= 0) break;
    const used: { browser: Browser | null } = { browser: null };
    const work = (async () => {
      used.browser = await getBrowser();
      return printWith(used.browser, content, opts);
    })();
    // A try that is given up for time may still fail later: that failure is already counted below.
    work.catch(() => {});
    try {
      return await within(Math.min(tryMs, left), work);
    } catch (e) {
      cause = e;
      console.error(`PDF: try ${attempt} of ${tries} failed ${used.browser ? "while printing" : "to start the browser"}.`, e);
      // A browser that could not print (dead after the server slept, or stuck) is dropped: the next try starts a fresh one.
      if (used.browser) await dropBrowser(used.browser);
    }
  }
  console.error("PDF: the document could not be made; showing the printable page instead.", cause);
  throw new PdfUnavailableError(html, cause, opts);
}

async function printWith(b: Browser, content: string, opts: PdfOptions): Promise<Buffer> {
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

// The only script the fallback page may run (its hash is in FALLBACK_CSP): the document itself
// holds school-typed text, so nothing else in it may run (security review 2026-11-05).
const PRINT_SCRIPT = 'document.getElementById("sos-pdf-print").addEventListener("click",function(){window.print()})';
export const FALLBACK_CSP = `default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline'; font-src data: https:; script-src 'sha256-${createHash("sha256").update(PRINT_SCRIPT).digest("base64")}'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`;

const FALLBACK_BAR = `<style>
  .sos-pdf-bar{font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#FFF7E6;color:#3D2A00;border-bottom:1px solid #E8C77A;padding:12px 16px;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
  .sos-pdf-bar p{margin:0;flex:1 1 260px}
  .sos-pdf-bar button,.sos-pdf-bar a{font:inherit;font-weight:600;border-radius:10px;padding:9px 18px;cursor:pointer;text-decoration:none;display:inline-block}
  .sos-pdf-bar button{background:#1D4ED8;color:#fff;border:1px solid #1D4ED8}
  .sos-pdf-bar a{background:#fff;color:#1E3A8A;border:1px solid #1D4ED8}
  .sos-pdf-bar button:focus-visible,.sos-pdf-bar a:focus-visible{outline:3px solid #93C5FD;outline-offset:2px}
  @media print{.sos-pdf-bar{display:none!important}}
</style>
<div class="sos-pdf-bar" role="status"><p><strong>The PDF could not be made just now.</strong> The document is shown below. Choose Download PDF to try again, or Print to print it or save it as a PDF.</p><a id="sos-pdf-retry" href="">Download PDF</a><button type="button" id="sos-pdf-print">Print</button></div><script>${PRINT_SCRIPT}</script>`;

/**
 * The paper the PDF would have had, as a print rule, so the printable page prints the same
 * way (an A5 receipt on A5, a wide list in landscape). Only sizes get in; anything else is A4.
 */
function paperRule(opts: PdfOptions): string {
  const length = (v: string | undefined) => (v && /^\d+(\.\d+)?(mm|cm|in|px|pt)$/.test(v) ? v : null);
  const width = length(opts.width);
  const height = length(opts.height);
  const format = opts.format === "A5" || opts.format === "Letter" ? opts.format : "A4";
  const paper = width && height ? `${width} ${height}` : `${format}${opts.landscape ? " landscape" : ""}`;
  return `<style>@page{size:${paper};margin:${length(opts.margin) ?? "12mm"}}</style>`;
}

/**
 * The document as a printable page, with a bar that explains why and offers Download PDF
 * (the same address again: an empty href) and Print, on the document's own paper size.
 */
export function pdfFallbackPage(html: string, opts: PdfOptions = {}): string {
  const bar = paperRule(opts) + FALLBACK_BAR;
  const m = /<body[^>]*>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + bar + html.slice(m.index + m[0].length) : `<!doctype html><meta charset="utf-8">${bar}${html}`;
}

const NO_PDF_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDF not ready</title>
<style>body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;margin:0;padding:48px 16px;background:#fff;color:#111}main{max-width:520px;margin:0 auto}h1{font-size:22px;margin:0 0 8px}a{color:#1D4ED8}</style></head>
<body><main><h1>The PDF could not be made just now</h1><p>Please try again in a minute. If it keeps happening, tell DREAM TEAM.</p><p>Use your browser&rsquo;s Back button to return.</p></main></body></html>`;

/** The response for a PDF that could not be made: the printable page, or a plain message. */
export function pdfUnavailableResponse(e: PdfUnavailableError): Response {
  return new Response(e.html ? pdfFallbackPage(e.html, e.opts) : NO_PDF_PAGE, {
    status: e.html ? 200 : 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-PDF-Fallback": "1", "Content-Security-Policy": FALLBACK_CSP, "X-Content-Type-Options": "nosniff" },
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
