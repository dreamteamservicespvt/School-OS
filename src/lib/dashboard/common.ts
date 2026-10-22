// Small helpers shared by the Dashboard loaders: words for dates and
// counts, and the person's own records read once per page.
import "server-only";

import { reachFor, type Action } from "../permissions";
import { BUILT_MODULES, MODULES, type ModuleKey } from "../modules";
import { ownSectionIds, classTeacherSectionIds, staffForUser } from "../people";
import type { DashContext, Viewer } from "./types";

const DAY = 86_400_000;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG_MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const n = (v: number) => v.toLocaleString("en-IN");
export const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

/** "Friday, 9 October". */
export function longDay(d: Date) {
  return `${LONG_WEEKDAY[d.getUTCDay()]}, ${d.getUTCDate()} ${LONG_MONTH[d.getUTCMonth()]}`;
}

/** "9 Oct". */
export function shortDate(d: Date) {
  return `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

/** How a day near today reads on the agenda: "Today", "Tomorrow", "Mon", "Sat 17". */
export function dayWord(d: Date, today: Date) {
  const diff = daysBetween(today, d);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return WEEKDAY[d.getUTCDay()];
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** "Mon 12 Oct". */
export function dayDate(d: Date) {
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

/**
 * A due date on a card: "due today", "due tomorrow", "due Fri", or "due Mon 19 Oct"
 * for a day already gone or a week or more away (QA ADMIT-04: not "due mon 19").
 */
export function dueWord(d: Date, today: Date) {
  const diff = daysBetween(today, d);
  if (diff === 0) return "due today";
  if (diff === 1) return "due tomorrow";
  if (diff > 1 && diff < 7) return `due ${WEEKDAY[d.getUTCDay()]}`;
  return `due ${dayDate(d)}`;
}

/** "08:45" to "8:45". */
export function clock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`;
}

export function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes since midnight in a time zone. */
export function minuteIn(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** A module's widgets show only when it is built, switched on for the school, and the person may open it. */
export function moduleOpen(v: Pick<Viewer, "permissions" | "modulesOn">, module: ModuleKey, action: Action = "view", built: ReadonlySet<ModuleKey> = BUILT_MODULES) {
  const info = MODULES.find((m) => m.key === module);
  if (!info) return false;
  if (module !== "dashboard" && !built.has(module)) return false;
  if (info.optional && !v.modulesOn.has(module)) return false;
  return reachFor(v.permissions, module, action) !== "none";
}

export const reach = (v: Pick<Viewer, "permissions">, module: ModuleKey, action: Action = "view") => reachFor(v.permissions, module, action);
export const hasRole = (v: Pick<Viewer, "roles">, ...keys: string[]) => v.roles.some((r) => r.key !== null && keys.includes(r.key));

/** The person's Staff record, read once. */
export function myStaff(c: DashContext) {
  return c.memo("staff", () => staffForUser(c.tx, c.viewer.ctx));
}

/** Sections the person teaches or is class teacher of, this year. */
export function mySections(c: DashContext) {
  return c.memo("own-sections", async () => (c.year ? ownSectionIds(c.tx, c.viewer.ctx, c.year.id) : []));
}

/** Sections where the person is the class teacher, this year. */
export function myClassSections(c: DashContext) {
  return c.memo("class-sections", async () => (c.year ? classTeacherSectionIds(c.tx, c.viewer.ctx, c.year.id) : []));
}

/** Words for a list of names: "Ravi, Anitha and 2 more". */
/** One campus: the ids of that campus's students; null for the whole school. Read once per page. */
export function campusStudents(c: DashContext): Promise<string[] | null> {
  return c.memo("campus-students", async () => (c.viewer.campusId ? (await c.tx.student.findMany({ where: { campusId: c.viewer.campusId }, select: { id: true } })).map((s) => s.id) : null));
}

export function someNames(names: string[], show = 2) {
  if (names.length <= show) return names.length === 2 ? `${names[0]} and ${names[1]}` : names.join(", ");
  return `${names.slice(0, show).join(", ")} and ${names.length - show} more`;
}

