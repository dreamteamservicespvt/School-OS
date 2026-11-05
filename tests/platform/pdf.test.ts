// Print and PDF buttons (owner's live test, 2026-11-05: "Download PDF or Print
// was loading but nothing is happening"; "Print ID card is not working").
// Every PDF goes through htmlToPdf (src/lib/pdf.ts). On Vercel no browser was
// installed, and a browser that could not start was retried forever, so each
// button loaded until the server gave up. Now: Vercel uses @sparticuz/chromium,
// a browser that cannot start fails at once, and a PDF route shows the document
// as a printable page with a clear note instead.
import { afterEach, describe, expect, it, vi } from "vitest";

const RECEIPT = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,"Noto Sans",sans-serif}</style></head>
<body><h1>Fee receipt R-0001</h1><p>Received ₹20,000 from రవి కుమార్ (Class 5 A).</p></body></html>`;

const savedPath = process.env.CHROMIUM_PATH;
afterEach(() => {
  if (savedPath === undefined) delete process.env.CHROMIUM_PATH;
  else process.env.CHROMIUM_PATH = savedPath;
  vi.resetModules();
});

describe("htmlToPdf", () => {
  it("makes a real PDF of a receipt", async () => {
    const { htmlToPdf } = await import("@/lib/pdf");
    const pdf = await htmlToPdf(RECEIPT, { format: "A5", margin: "8mm" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  }, 60_000);

  it("fails at once with PdfUnavailableError when the browser cannot start (it used to retry forever)", async () => {
    process.env.CHROMIUM_PATH = "/no/such/chromium-for-school-os";
    vi.resetModules();
    const { htmlToPdf, PdfUnavailableError } = await import("@/lib/pdf");
    const started = Date.now();
    const err = await htmlToPdf(RECEIPT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfUnavailableError);
    expect((err as InstanceType<typeof PdfUnavailableError>).html).toBe(RECEIPT);
    expect(Date.now() - started).toBeLessThan(20_000);
    // A second try fails the same way: no stuck, half-started browser is kept.
    await expect(htmlToPdf(RECEIPT)).rejects.toBeInstanceOf(PdfUnavailableError);
  }, 60_000);
});

describe("the serverless browser", () => {
  it("is used on Vercel and AWS Lambda only when CHROMIUM_PATH is not set", async () => {
    const { onServerless } = await import("@/lib/pdf");
    expect(onServerless({ VERCEL: "1" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(onServerless({ AWS_LAMBDA_FUNCTION_NAME: "f" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(onServerless({ VERCEL: "1", CHROMIUM_PATH: "/usr/bin/chromium" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(onServerless({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("adds markup at the start of <head>", async () => {
    const { addToHead } = await import("@/lib/pdf");
    expect(addToHead("<html><head><title>x</title></head></html>", "<style>a{}</style>")).toBe("<html><head><style>a{}</style><title>x</title></head></html>");
    expect(addToHead("<p>x</p>", "<style>a{}</style>")).toBe("<style>a{}</style><p>x</p>");
    expect(addToHead("<p>x</p>", "")).toBe("<p>x</p>");
  });
});

describe("withPdfErrors", () => {
  it("shows the document as a printable page with a clear note when no PDF can be made", async () => {
    const { PdfUnavailableError, withPdfErrors } = await import("@/lib/pdf");
    const GET = withPdfErrors(async (_req: Request) => { throw new PdfUnavailableError(RECEIPT, new Error("no browser")); });
    const res = await GET(new Request("http://localhost/fee-management/payments/x/receipt?download=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect(res.headers.get("X-PDF-Fallback")).toBe("1");
    const body = await res.text();
    expect(body).toContain("The PDF could not be made just now.");
    expect(body).toContain('onclick="window.print()"');
    expect(body).toContain("@media print{.sos-pdf-bar{display:none!important}}");
    expect(body).toContain("Fee receipt R-0001");
    // The note sits inside <body>, before the document.
    expect(body.indexOf("<body>")).toBeLessThan(body.indexOf("sos-pdf-bar\" role"));
    expect(body.indexOf("sos-pdf-bar\" role")).toBeLessThan(body.indexOf("Fee receipt R-0001"));
  });

  it("gives a plain message when there is no document to show", async () => {
    const { PdfUnavailableError, withPdfErrors } = await import("@/lib/pdf");
    const res = await withPdfErrors(async () => { throw new PdfUnavailableError(null); })();
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("The PDF could not be made just now");
  });

  it("passes PDFs through and leaves other errors alone", async () => {
    const { withPdfErrors } = await import("@/lib/pdf");
    const ok = await withPdfErrors(async () => new Response("%PDF-1.7", { headers: { "Content-Type": "application/pdf" } }))();
    expect(ok.headers.get("Content-Type")).toBe("application/pdf");
    await expect(withPdfErrors(async () => { throw new Error("database down"); })()).rejects.toThrow("database down");
  });

  it("wraps every route that answers with a PDF", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const path = await import("node:path");
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === "route.ts") routes.push(p);
      }
    };
    walk(path.resolve(import.meta.dirname, "../../src/app"));
    const unwrapped = routes.filter((p) => {
      const src = readFileSync(p, "utf8");
      const makesPdf = /htmlToPdf\(|\.pdf\(\)|feePdf\(/.test(src);
      // Wrapped, and given time to start the browser on a fresh Vercel server.
      return makesPdf && !(src.includes("withPdfErrors(") && /export const maxDuration = \d+/.test(src));
    });
    expect(unwrapped.map((p) => path.relative(process.cwd(), p))).toEqual([]);
  });
});

describe("list exports to PDF", () => {
  it("open as a printable page when no PDF can be made", async () => {
    process.env.CHROMIUM_PATH = "/no/such/chromium-for-school-os";
    vi.resetModules();
    const { buildExport, exportResponse } = await import("@/lib/exports");
    const file = await buildExport("pdf", [{ label: "Name", value: (r: { n: string }) => r.n }], [{ n: "Asha" }], { title: "Students", schoolName: "Test School", filters: "", exportedBy: "Admin", timeZone: "Asia/Kolkata" });
    expect(file.type).toBe("text/html; charset=utf-8");
    expect(file.name).toBe("students.html");
    const res = exportResponse(file as { body: Buffer; type: string; name: string });
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="students.html"');
    expect(await res.text()).toContain("Asha");
  }, 120_000);
});
