// What every Front Office export starts with: the Export permission checked
// on the server, the person's Front Office level, the school's time zone and
// the date filter from the page address (the export honours what is on screen).
import "server-only";

import { requireAction, type Current } from "@/lib/current";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodFromSearch, type DayRange, type PeriodKey } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { foCan, foViewer, type FoCan, type FoViewer } from "@/lib/front-office/access";
import { todayIso } from "@/lib/front-office/time";
import type { ExportFormat } from "@/lib/exports";
import { formatDate } from "@/lib/format";

export type FoExport = { current: Current; v: FoViewer; can: FoCan; tz: string; format: ExportFormat; get: (k: string) => string; range: (fallback: PeriodKey, prefix?: string) => Promise<DayRange> };

export const plain = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** Checks Export on the server; returns a ready refusal when it is not allowed. */
export async function foExport(req: Request): Promise<FoExport | Response> {
  let current: Current;
  try {
    ({ current } = await requireAction("front-office", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain("You do not have permission to export from Front Office.", 403);
    throw e;
  }
  const v = foViewer(current);
  const can = foCan(v);
  const url = new URL(req.url);
  const get = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(get("format")) ? get("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const range = async (fallback: PeriodKey, prefix = "") => {
    const r = periodFromSearch(Object.fromEntries(url.searchParams), { ...(await periodSetup(current)), fallback, prefix });
    if (r) return r;
    const t = todayIso(tz);
    return { period: "today" as PeriodKey, from: t, to: t, label: "Today" };
  };
  return { current, v, can, tz, format, get, range };
}

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00Z`), "UTC");
export const rangeWords = (r: DayRange) => (r.from === r.to ? `${r.label === day(r.from) ? "" : `${r.label}, `}${day(r.from)}` : `${r.label}: ${day(r.from)} to ${day(r.to)}`);
