import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { htmlToPdf } from "@/lib/pdf";
import { PermissionDeniedError } from "@/lib/permissions";
import { getStudentSettings } from "@/lib/students/settings";
import { abilities, visibleStudentIds } from "@/lib/students/access";
import { certificateHtml, printContext } from "@/lib/students/certificates";
import { writeAudit } from "@/lib/audit";
import { origin } from "../../_lib/page";

export const dynamic = "force-dynamic";

const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/**
 * Joins printable pages into one document, one certificate per page. Each
 * certificate type may have its own design (Settings, Document Designs), so
 * every distinct style is kept, and each page keeps its own font and colour.
 */
function joinPages(pages: string[]) {
  if (pages.length === 1) return pages[0];
  const styleOf = (p: string) => /<style>([\s\S]*?)<\/style>/.exec(p)?.[1] ?? "";
  // A design's font and colour sit on its <body>; they move onto the page's own wrapper.
  const pageVars = (p: string) => {
    const m = /body\{font-family:([^;]+);color:#111;font-size:([^;]+);line-height:[^;]+;--accent:([^}]+)\}/.exec(styleOf(p));
    return m ? `font-family:${m[1]};font-size:${m[2]};--accent:${m[3]};`.replace(/"/g, "'") : "";
  };
  const styles = [...new Set(pages.map(styleOf))];
  const bodies = pages.map((p) => p.slice(p.indexOf("<body>") + 6, p.lastIndexOf("</body>")));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${styles.join("\n")}</style></head><body>${bodies
    .map((b, i) => `<div style="${pageVars(pages[i])}${i ? "break-before:page;page-break-before:always;" : ""}">${b}</div>`)
    .join("")}</body></html>`;
}

/** Certificates as a print-ready PDF (?ids=a,b). Only issued (or cancelled, marked so) certificates print. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("student-management", "print"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to print certificates.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(isId).slice(0, 100);
  if (ids.length === 0) return new Response("Choose the certificates to print.", { status: 400 });
  const site = await origin();
  const out = await withSchool(current.ctx, async (tx) => {
    const can = abilities(current, await getStudentSettings(tx, current.ctx));
    if (can.reach !== "all" || can.lookupOnly) return { error: "You do not have permission to print certificates.", status: 403 } as const;
    const mine = await visibleStudentIds(tx, current);
    const certs = await tx.certificate.findMany({ where: { id: { in: ids }, status: { in: ["ISSUED", "CANCELLED"] }, ...(mine ? { studentId: { in: mine } } : {}) }, orderBy: { createdAt: "asc" } });
    if (certs.length === 0) return { error: "These certificates are not issued yet. Issue them first.", status: 409 } as const;
    const pages: string[] = [];
    for (const c of certs) pages.push(await certificateHtml(c, await printContext(tx, current.ctx, c, site)));
    await writeAudit(tx, current.ctx, { action: "printed", recordType: "Certificate", recordId: certs.length === 1 ? certs[0].id : null, after: { numbers: certs.map((c) => c.number) } });
    return { html: joinPages(pages), name: certs.length === 1 ? `${certs[0].number ?? "certificate"}`.replace(/[^\w-]+/g, "-") : `certificates-${certs.length}` } as const;
  }, { timeout: 60_000 });
  if ("error" in out) return new Response(out.error, { status: out.status });
  const pdf = await htmlToPdf(out.html, { format: "A4", margin: "10mm" });
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${out.name}.pdf"`, "Cache-Control": "private, no-store" } });
}
