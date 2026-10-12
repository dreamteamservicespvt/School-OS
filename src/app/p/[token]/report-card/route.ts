// A report card PDF for a guardian, from their Parent Link. The phone must be
// confirmed, the child must be the guardian's own, and every result on the
// report card must be published (08 Done when 11). Logged in the Audit Log.
import { cookies } from "next/headers";
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { writeAudit } from "@/lib/audit";
import { hitLimit } from "@/lib/rate-limit";
import { deviceCookieName, findLink, openLink } from "@/lib/parent-link/links";
import { guardianChildren } from "@/lib/parent-link/view";
import { messageSettings } from "@/lib/messaging/settings";
import { parentReportCardPdf } from "@/lib/exams/parent-link";

export const dynamic = "force-dynamic";

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(request.url);
  const childId = url.searchParams.get("child") ?? "";
  const yearId = url.searchParams.get("year") ?? "";
  const period = url.searchParams.get("period") ?? "";
  if (!UUID.test(childId) || !UUID.test(yearId) || !/^(year|exam:[0-9a-f-]{36}|term:[0-9a-f-]{36})$/i.test(period)) return plain("This link is not complete. Open the report card from your Parent Link again.", 400);
  const device = await deviceInfo();
  const limited = await hitLimit(`pl-report:ip:${device.ipAddress ?? "unknown"}`, 30, 600);
  if (!limited.ok) return plain("Please wait a few minutes and try again.", 429);
  const found = await findLink(token);
  if (!found) return plain("This link does not work. Please ask the school for a new one.", 404);
  const key = (await cookies()).get(deviceCookieName(found.linkId))?.value ?? null;
  const state = await openLink(token, key, device);
  if (state.state !== "open") return Response.redirect(new URL(`/p/${token}`, request.url), 303);
  const ctx = { schoolId: state.schoolId, userId: null };
  try {
    const out = await withSchool(ctx, async (tx) => {
      const settings = await messageSettings(tx, ctx);
      if (settings.parentLink.shows["report-cards"] === false) return null;
      const { children } = await guardianChildren(tx, ctx, state.guardianId);
      if (!children.some((c) => c.id === childId)) return null;
      const pdf = await parentReportCardPdf(tx, ctx, childId, yearId, period);
      if (pdf) await writeAudit(tx, ctx, { action: "downloaded", recordType: "Report Card", recordId: childId, after: { period, by: "guardian", linkId: state.linkId }, device: device.userAgent, ipAddress: device.ipAddress });
      return pdf;
    }, { timeout: 60_000 });
    if (!out) return plain("This report card is not available. Results may not be published yet.", 404);
    return new Response(new Uint8Array(out.body), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${out.fileName}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "parent-report-card", error: e instanceof Error ? e.message : String(e) }));
    return plain("The report card could not be made right now. Please try again in a minute.", 503);
  }
}
