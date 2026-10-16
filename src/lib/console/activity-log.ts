// The console's Activity Log page and its export (07-super-admin.md §3.7):
// the same filters on both, so an export holds exactly the lines on screen.
import "server-only";

import type { Prisma } from "@prisma/client";
import { withConsole } from "../db";
import { momentWhere, periodFromSearch, type DayRange } from "../periods";
import { ACTIVITY_TYPES, type ActivityType } from "./activity";
import { CONSOLE_TZ } from "./list";

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export const AUTOMATIC = "auto";
export const LOG_PAGE = 100;

export type LogFilters = { q: string; who: string; school: string; type: ActivityType | ""; range: DayRange | null; limit: number };

export function readLogFilters(sp: Raw): LogFilters {
  const who = one(sp.who);
  const school = one(sp.school);
  const type = one(sp.type);
  const limit = Math.min(Math.max(Number(one(sp.show)) || LOG_PAGE, LOG_PAGE), 2000);
  return {
    q: one(sp.q).slice(0, 100),
    who: who === AUTOMATIC || isUuid(who) ? who : "",
    school: isUuid(school) ? school : "",
    type: type in ACTIVITY_TYPES ? (type as ActivityType) : "",
    range: periodFromSearch(sp, { timeZone: CONSOLE_TZ }),
    limit,
  };
}

export function logWhere(f: LogFilters): Prisma.ConsoleActivityEntryWhereInput {
  return {
    ...(f.who === AUTOMATIC ? { actorId: null } : f.who ? { actorId: f.who } : {}),
    ...(f.school ? { forSchoolId: f.school } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.range ? { at: momentWhere(f.range, CONSOLE_TZ) } : {}),
    ...(f.q ? { OR: [{ text: { contains: f.q, mode: "insensitive" } }, { actorName: { contains: f.q, mode: "insensitive" } }, { schoolName: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
}

export async function listLog(f: LogFilters, limit = f.limit) {
  return withConsole(async (tx) => {
    const where = logWhere(f);
    const [rows, matching, total] = await Promise.all([
      tx.consoleActivityEntry.findMany({ where, orderBy: [{ at: "desc" }, { id: "desc" }], take: limit }),
      tx.consoleActivityEntry.count({ where }),
      tx.consoleActivityEntry.count(),
    ]);
    return { rows, matching, total };
  });
}

export async function logChoices() {
  return withConsole(async (tx) => {
    const [team, schools] = await Promise.all([
      tx.superAdminUser.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.consoleSchool.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    return {
      who: [...team.map((m) => ({ value: m.id, label: m.name })), { value: AUTOMATIC, label: "Automatic (School OS)" }],
      schools: schools.map((s) => ({ value: s.id, label: s.name })),
      types: Object.entries(ACTIVITY_TYPES).map(([value, label]) => ({ value, label })),
    };
  });
}

/** The filters in words, for the export's header and its Activity Log line. */
export function describeLogFilters(f: LogFilters, choices: Awaited<ReturnType<typeof logChoices>>) {
  const parts: string[] = [];
  if (f.who) parts.push(`by ${choices.who.find((x) => x.value === f.who)?.label ?? "one person"}`);
  if (f.school) parts.push(choices.schools.find((x) => x.value === f.school)?.label ?? "one school");
  if (f.type) parts.push(ACTIVITY_TYPES[f.type]);
  if (f.range) parts.push(f.range.label);
  if (f.q) parts.push(`“${f.q}”`);
  return parts.length ? parts.join(", ") : "none";
}
