// What every Library file route (exports, labels, cards) starts with: the
// action checked on the server, the module switched on, the page open to this
// person, the date filter from the address (exports honour what is on
// screen), and a plain answer when something is refused.
import "server-only";

import { requireAction, type Current } from "@/lib/current";
import { PermissionDeniedError, type Action } from "@/lib/permissions";
import { periodFromSearch, type DayRange, type PeriodKey } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { todayDate } from "@/lib/front-office/time";
import { formatDate } from "@/lib/format";
import { libCan, libViewer, pageOpen, type LibCan, type LibPage, type LibViewer } from "@/lib/library/access";
import type { ExportFormat } from "@/lib/exports";
import { MODULE } from "@/lib/library/words";

export const plain = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export type LibRoute = {
  current: Current; v: LibViewer; can: LibCan; tz: string; today: Date; format: ExportFormat; url: URL;
  get: (k: string) => string;
  range: (fallback: PeriodKey | null, prefix?: string) => Promise<DayRange | null>;
};

export async function libRoute(req: Request, page: LibPage, action: Action = "export"): Promise<LibRoute | Response> {
  let current: Current;
  try {
    ({ current } = await requireAction(MODULE, action));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain(action === "export" ? "You do not have permission to export from Library Management." : "You do not have permission to do this in Library Management.", 403);
    throw e;
  }
  if (!current.modulesOn.has(MODULE)) return plain("Library Management is switched off for this school.", 404);
  const v = libViewer(current);
  if (!pageOpen(v, page)) return plain("You do not have permission to open this Library page.", 403);
  const can = libCan(v);
  if (action === "export" && !can.export) return plain("You do not have permission to export from Library Management.", 403);
  const url = new URL(req.url);
  const get = (k: string) => (url.searchParams.get(k) ?? "").slice(0, 200);
  const format = (["csv", "xlsx", "pdf"].includes(get("format")) ? get("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const range = async (fallback: PeriodKey | null, prefix = "") => periodFromSearch(Object.fromEntries(url.searchParams), { ...(await periodSetup(current)), fallback, prefix });
  return { current, v, can, tz, today: todayDate(tz), format, url, get, range };
}

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00Z`), "UTC");
export const rangeWords = (r: DayRange | null) => (!r ? "All dates" : r.from === r.to ? `${r.label}, ${day(r.from)}` : `${r.label}: ${day(r.from)} to ${day(r.to)}`);
