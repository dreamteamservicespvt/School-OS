// The achievements list for the dates, level and search on screen.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { evPageAllowed } from "@/lib/events/access";
import { eventsSettings } from "@/lib/events/settings";
import { isoOf, longDay } from "@/lib/events/words";
import { evExport, plain, rangeWords } from "../../_lib/export";
import { achievementList, type AchievementRow } from "../../_lib/co";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await evExport(req);
  if (x instanceof Response) return x;
  if (!evPageAllowed(x.v, "cocurricular")) return plain("You do not have permission to export achievements.", 403);
  const range = await x.range("acyear");
  const level = x.get("level");
  const q = x.get("q").trim().slice(0, 60);
  const title = "Achievements";
  const filters = [rangeWords(range), level ? `Level: ${level}` : "", q ? `Search: ${q}` : ""].filter(Boolean).join(" · ");
  const r = await withSchool(x.current.ctx, async (tx) => {
    const s = await eventsSettings(tx, x.current.ctx);
    const rows = await achievementList(tx, range, { level: level || "all", q });
    await logExport(tx, x.current.ctx, { title, format: x.format, filters, rows: rows.length });
    return { rows, creditsOn: s.creditsOn };
  });
  const columns: ExportColumn<AchievementRow>[] = [
    { label: "Student", value: (a) => a.student },
    { label: "Admission no.", value: (a) => a.admissionNo },
    { label: "Class", value: (a) => a.place },
    { label: "Activity or competition", value: (a) => a.activity },
    { label: "Kind", value: (a) => a.kind },
    { label: "Level", value: (a) => a.level },
    { label: "Result", value: (a) => (a.won ? a.position || "Won" : "Took part") },
    { label: "Date", value: (a) => longDay(isoOf(a.date)) },
    ...(r.creditsOn ? [{ label: "Credits", value: (a: AchievementRow) => String(a.credits) }] : []),
    { label: "Certificate", value: (a) => a.certificateNo ?? "" },
  ];
  return exportResponse(await buildExport(x.format, columns, r.rows, { title, schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters }));
}
