// Live test as Principal (17 Nov 2026): the first fee receipt after the site
// was idle came back as the printable page (text/html, 6 s) instead of a PDF;
// the next requests gave a real PDF. htmlToPdf gave up on the first failed
// browser start, although the request had most of its 60 seconds left.
// Now a failed or stuck try is made again with a fresh browser, at most three
// tries inside a time budget, and only then is the printable page shown. That
// page has a visible "Download PDF" link that asks for the PDF again, and
// prints on the document's own paper size.
//
// The browser here is a stand-in (no Chromium, no network): these tests are
// about the decision, not about printing. tests/platform/pdf.test.ts prints
// with the real browser.
import { afterEach, describe, expect, it, vi } from "vitest";

const RECEIPT = `<!doctype html><html><head><meta charset="utf-8"></head><body><h1>Fee receipt R-0001</h1><p>Received ₹20,000.</p></body></html>`;
const PDF = Buffer.from("%PDF-1.7 stand-in");
const FAST = { pauseMs: 1 };

type Step = "ok" | "fail" | "hang" | "dies-after-one" | "print-hangs";
const never = () => new Promise<never>(() => {});

/** A stand-in browser: prints a fixed PDF, or behaves as the step says. */
function standIn(step: Step) {
  let connected = true;
  let prints = 0;
  return {
    isConnected: () => connected,
    on: () => undefined,
    close: async () => { connected = false; },
    newContext: async () => {
      if (step === "print-hangs") return never();
      if (step === "dies-after-one" && ++prints > 1) throw new Error("Target page, context or browser has been closed");
      return {
        newPage: async () => ({ route: async () => undefined, setContent: async () => undefined, pdf: async () => PDF }),
        close: async () => undefined,
      };
    },
  };
}

/** Loads src/lib/pdf.ts with a stand-in browser whose starts follow the script (the last step repeats). */
async function load(script: Step[]) {
  const seen = { launches: 0 };
  vi.resetModules();
  vi.doMock("playwright-core", () => ({
    chromium: {
      launch: async () => {
        const step = script[Math.min(seen.launches, script.length - 1)];
        seen.launches++;
        if (step === "fail") throw new Error("browserType.launch: Failed to launch the browser process");
        if (step === "hang") return never();
        return standIn(step);
      },
    },
  }));
  const pdf = await import("@/lib/pdf");
  return { ...pdf, seen };
}

afterEach(() => {
  vi.doUnmock("playwright-core");
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("the first PDF after the server was idle", () => {
  it("starts the browser again in the same request when the first start fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { htmlToPdf, seen } = await load(["fail", "ok"]);
    const pdf = await htmlToPdf(RECEIPT, { format: "A5" }, FAST);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(seen.launches).toBe(2);
  }, 10_000);

  it("replaces a kept browser that died, and starts once more when that fresh start fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { htmlToPdf, seen } = await load(["dies-after-one", "fail", "ok"]);
    expect((await htmlToPdf(RECEIPT, {}, FAST)).subarray(0, 5).toString()).toBe("%PDF-");
    expect(seen.launches).toBe(1);
    // The server slept: the kept browser cannot print any more, and the first fresh start fails too.
    expect((await htmlToPdf(RECEIPT, {}, FAST)).subarray(0, 5).toString()).toBe("%PDF-");
    expect(seen.launches).toBe(3);
  }, 10_000);

  it("gives up a try that is stuck after its time, and prints with a fresh browser", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { htmlToPdf, seen } = await load(["print-hangs", "ok"]);
    const pdf = await htmlToPdf(RECEIPT, {}, { pauseMs: 1, tryMs: 60 });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(seen.launches).toBe(2);
  }, 10_000);

  it("stops after three tries when the browser can never start, and hands over the document and its paper size", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { htmlToPdf, PdfUnavailableError, seen } = await load(["fail"]);
    const err = await htmlToPdf(RECEIPT, { format: "A5", margin: "8mm" }, FAST).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfUnavailableError);
    expect((err as InstanceType<typeof PdfUnavailableError>).html).toBe(RECEIPT);
    expect((err as InstanceType<typeof PdfUnavailableError>).opts).toEqual({ format: "A5", margin: "8mm" });
    expect(seen.launches).toBe(3);
  }, 10_000);

  it("never waits past its time budget: a start that hangs ends as the printable page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { htmlToPdf, PdfUnavailableError, seen } = await load(["hang"]);
    const started = Date.now();
    const err = await htmlToPdf(RECEIPT, {}, { pauseMs: 1, tryMs: 60, budgetMs: 150 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfUnavailableError);
    expect(Date.now() - started).toBeLessThan(2_000);
    // The one start that hangs is waited for again, not started three times over.
    expect(seen.launches).toBe(1);
  }, 10_000);

  it("keeps the limits inside the 60 seconds a PDF route is given", async () => {
    const { PDF_LIMITS } = await load(["ok"]);
    expect(PDF_LIMITS.tries).toBe(3);
    expect(PDF_LIMITS.budgetMs).toBeLessThanOrEqual(45_000);
    expect(PDF_LIMITS.tryMs).toBeLessThan(PDF_LIMITS.budgetMs);
  });
});

describe("the printable page shown when no PDF could be made", () => {
  it("has a visible Download PDF link that asks for the PDF again, next to Print", async () => {
    const { PdfUnavailableError, withPdfErrors } = await load(["ok"]);
    const GET = withPdfErrors(async (_req: Request) => { throw new PdfUnavailableError(RECEIPT, new Error("no browser")); });
    const res = await GET(new Request("http://localhost/fee-management/payments/x/receipt"));
    expect(res.headers.get("X-PDF-Fallback")).toBe("1");
    const body = await res.text();
    // An empty href is this same address: the browser asks the PDF route again.
    expect(body).toMatch(/<a [^>]*id="sos-pdf-retry"[^>]*href=""[^>]*>Download PDF<\/a>/);
    expect(body).toContain('id="sos-pdf-print"');
    expect(body).toContain("Choose Download PDF to try again");
    // The link and the button are hidden on paper, and nothing new may run as script.
    expect(body).toContain("@media print{.sos-pdf-bar{display:none!important}}");
    expect(body).not.toContain("onclick=");
    expect(body.match(/<script/g)?.length).toBe(1);
    expect(body.indexOf('id="sos-pdf-retry"')).toBeLessThan(body.indexOf("Fee receipt R-0001"));
  });

  it("prints on the document's own paper size and margins", async () => {
    const { pdfFallbackPage } = await load(["ok"]);
    expect(pdfFallbackPage(RECEIPT, { format: "A5", margin: "8mm" })).toContain("@page{size:A5;margin:8mm}");
    expect(pdfFallbackPage(RECEIPT, { landscape: true })).toContain("@page{size:A4 landscape;margin:12mm}");
    expect(pdfFallbackPage(RECEIPT, { width: "80mm", height: "200mm", margin: "4mm" })).toContain("@page{size:80mm 200mm;margin:4mm}");
    // No size given: the PDF would be A4 with 12 mm margins, and so is the printed page.
    expect(pdfFallbackPage(RECEIPT)).toContain("@page{size:A4;margin:12mm}");
    // Only sizes can get in: anything else falls back to A4.
    expect(pdfFallbackPage(RECEIPT, { width: "1mm}</style><script>alert(1)</script>", height: "2mm" })).not.toContain("alert(1)");
  });
});
