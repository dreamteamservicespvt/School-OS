// What every Events & Calendar export starts with: Export checked on the
// server, the person's Events level, the school's time zone and the date
// filter from the page address (the export honours what is on screen).
import "server-only";

import { requireAction, type Current } from "@/lib/current";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodFromSearch, type DayRange, type PeriodKey } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { evCan, evViewer, type EvCan, type EvViewer } from "@/lib/events/access";
import { localNow } from "@/lib/events/jobs";
import type { ExportFormat } from "@/lib/exports";
import { formatDate } from "@/lib/format";

export type EvExport = { current: Current; v: EvViewer; can: EvCan; tz: string; today: string; format: ExportFormat; get: (k: string) => string; range: (fallback: PeriodKey) => Promise<DayRange> };

export const plain = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function evExport(req: Request): Promise<EvExport | Response> {
  let current: Current;
  try {
    ({ current } = await requireAction("events-calendar", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain("You do not have permission to export from Events & Calendar.", 403);
    throw e;
  }
  const v = evViewer(current);
  const can = evCan(v);
  const url = new URL(req.url);
  const get = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(get("format")) ? get("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const { today } = localNow(new Date(), tz);
  const range = async (fallback: PeriodKey) => {
    const r = periodFromSearch(Object.fromEntries(url.searchParams), { ...(await periodSetup(current)), fallback });
    return r ?? { period: "today" as PeriodKey, from: today, to: today, label: "Today" };
  };
  return { current, v, can, tz, today, format, get, range };
}

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00Z`), "UTC");
export const rangeWords = (r: DayRange) => (r.from === r.to ? `${r.label}, ${day(r.from)}` : `${r.label}: ${day(r.from)} to ${day(r.to)}`);
