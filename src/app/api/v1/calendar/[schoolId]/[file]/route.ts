// The School Calendar as a read-only feed for Google Calendar or Outlook
// (18 §6, Calendar sharing). The link carries a token worked out from the
// school, the scope and the feed version (no secret is stored); "Make new
// links" in Events Settings changes the version and old links stop. The
// school's feed leaves out staff-only events; the staff feed has everything.
import { timingSafeEqual } from "node:crypto";
import { withSchool } from "@/lib/db";
import { eventsSettings, feedToken, type FeedScope } from "@/lib/events/settings";
import { ENTRY_TYPES, isEntryType, isoOf } from "@/lib/events/words";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return new Response("This calendar link is not valid. Ask the school for the current link.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/** RFC 5545 text: escape, then fold long lines. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}
const ymd = (iso: string) => iso.replace(/-/g, "");
const nextDay = (iso: string) => isoOf(new Date(new Date(`${iso}T00:00:00Z`).getTime() + 86_400_000));
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}${String(min % 60).padStart(2, "0")}00`;

export async function GET(_req: Request, { params }: { params: Promise<{ schoolId: string; file: string }> }) {
  const { schoolId, file } = await params;
  const m = /^(school|staff)-([A-Za-z0-9_-]{32})\.ics$/.exec(file);
  if (!UUID.test(schoolId) || !m) return notFound();
  const scope = m[1] as FeedScope;
  const ctx = { schoolId, userId: null };
  const data = await withSchool(ctx, async (tx) => {
    const s = await eventsSettings(tx, ctx);
    if (!s.feedOn) return null;
    const expected = Buffer.from(feedToken(schoolId, scope, s.feedVersion));
    const given = Buffer.from(m[2]);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { name: true, timeZone: true } });
    const from = new Date(Date.now() - 400 * 86_400_000);
    const to = new Date(Date.now() + 400 * 86_400_000);
    const rows = await tx.calendarEntry.findMany({ where: { archivedAt: null, endDate: { gte: from }, startDate: { lte: to } }, orderBy: { startDate: "asc" }, take: 3000 });
    const eventIds = rows.map((r) => (r.source?.startsWith("event:") ? r.source.slice(6) : null)).filter((x): x is string => Boolean(x));
    const ptmIds = rows.map((r) => (r.source?.startsWith("ptm:") ? r.source.slice(4) : null)).filter((x): x is string => Boolean(x));
    const [events, ptms] = await Promise.all([
      eventIds.length ? tx.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, startMin: true, endMin: true, venue: true, audienceKind: true, cancelledAt: true } }) : [],
      ptmIds.length ? tx.ptm.findMany({ where: { id: { in: ptmIds } }, select: { id: true, startMin: true, endMin: true, venue: true } }) : [],
    ]);
    return { school, rows, events, ptms, version: s.feedVersion };
  });
  if (!data || !data.school) return notFound();

  const tz = data.school.timeZone || "Asia/Kolkata";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//School OS//School Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`${data.school.name}${scope === "staff" ? " (staff)" : ""}`)}`, `X-WR-TIMEZONE:${tz}`, "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  ];
  for (const r of data.rows) {
    const ev = r.source?.startsWith("event:") ? data.events.find((e) => e.id === r.source!.slice(6)) : undefined;
    const ptm = r.source?.startsWith("ptm:") ? data.ptms.find((p) => p.id === r.source!.slice(4)) : undefined;
    if (ev && scope === "school" && ev.audienceKind === "staff") continue;
    if (ev?.cancelledAt) continue;
    const timed = ev ?? ptm;
    const start = isoOf(r.startDate);
    const end = isoOf(r.endDate);
    const kind = isEntryType(r.type) ? ENTRY_TYPES[r.type].label : "Event";
    lines.push("BEGIN:VEVENT", `UID:${r.id}-${data.version}@school-os`, `DTSTAMP:${stamp}`);
    if (timed && start === end) {
      lines.push(`DTSTART;TZID=${tz}:${ymd(start)}T${hm(timed.startMin)}`);
      lines.push(`DTEND;TZID=${tz}:${ymd(start)}T${hm(timed.endMin ?? Math.min(timed.startMin + 60, 1439))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(nextDay(end))}`, "TRANSP:TRANSPARENT");
    }
    lines.push(fold(`SUMMARY:${esc(r.title)}`), fold(`DESCRIPTION:${esc([kind, r.details].filter(Boolean).join(". "))}`), `CATEGORIES:${esc(kind)}`);
    if (timed?.venue) lines.push(fold(`LOCATION:${esc(timed.venue)}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="${scope}.ics"`, "Cache-Control": "private, max-age=900", "X-Content-Type-Options": "nosniff" },
  });
}
