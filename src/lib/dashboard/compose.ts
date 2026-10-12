// Builds one person's Dashboard: picks their homes, runs only the widgets
// they may see (built module, switched on, allowed), and orders the result
// the way the approved design lays it out (01-dashboard.md §2).
import "server-only";

import type { TaskStatus } from "@prisma/client";
import { withSchool, type Tx } from "../db";
import { currentYear } from "../academic/years";
import { academicSettings, mainCampusId } from "../academic/settings";
import { CLOSED_TYPES } from "../academic/calendar";
import { approvalsFor, requestLabel } from "../approvals";
import { decidableIds } from "../approvals-inbox";
import { formatRupees } from "../format";
import { todayFor } from "../periods";
import { homesFor, isLeader } from "./homes";
import { WIDGETS } from "./registry";
import { BUILT_MODULES, type ModuleKey } from "../modules";
import { addDays, daysBetween, dayWord, longDay, minuteIn, moduleOpen, plural } from "./common";
import { taskAccess, isOverdue, OPEN_TASK } from "./tasks";
import type { AgendaItem, AttentionItem, BandItem, Birthday, DashContext, HomeKind, Panel, PanelSlot, Viewer, Widget, WidgetKind } from "./types";

/** Band order inside a home, where it differs from the registry order. Slot ids come first so they lead once wired. */
const BAND_ORDER: Partial<Record<HomeKind, string[]>> = {
  leader: ["attendance.students-present", "attendance.staff-present", "fees.collected-today", "admissions.new-enquiries", "students.head-count", "staff.head-count", "students.parents", "approvals.waiting"],
  hr: ["attendance.staff-present", "staff.leave-requests", "staff.documents-expiring", "staff.open-positions"],
  teacher: ["academic.classes-today-count", "attendance.taken-today", "communication.my-queries"],
  "class-teacher": ["attendance.my-section-today", "attendance.student-leave", "students.my-class-count"],
  staff: ["staff.my-leave", "academic.next-holiday", "communication.new-messages"],
};
const TONE_RANK: Record<AttentionItem["tone"], number> = { bad: 0, warn: 1, info: 2 };

/** Widgets this person gets: on one of their homes, module built and switched on, allowed to them. */
export function widgetsFor(viewer: Viewer, homes: readonly HomeKind[], widgets: readonly Widget[] = WIDGETS, built: ReadonlySet<ModuleKey> = BUILT_MODULES) {
  return widgets.filter((w) =>
    (w.homes === "any" || w.homes.some((h) => homes.includes(h))) &&
    moduleOpen(viewer, w.module, "view", built) &&
    (!w.allowed || w.allowed(viewer)));
}

/** The first of the person's homes a widget belongs to (for ordering). */
const homeRank = (w: Widget, homes: readonly HomeKind[]) => (w.homes === "any" ? homes.length : Math.min(...w.homes.map((h) => (homes.includes(h) ? homes.indexOf(h) : 99))));

export type TaskCardRow = { id: string; title: string; due: string | null; overdue: boolean; done: boolean; status: TaskStatus; by: string | null; to: string | null };
export type ApprovalCardRow = { id: string; who: string; what: string; amount: string | null };

export type Home = {
  homes: HomeKind[];
  leader: boolean;
  first: string;
  dayLine: string;
  band: BandItem[];
  attention: AttentionItem[];
  hiddenSeen: number;
  panels: Record<PanelSlot, Panel[]>;
  agenda: AgendaItem[];
  birthdays: Birthday[];
  approvals: { count: number; rows: ApprovalCardRow[] } | null;
  tasks: { access: "full" | "own"; mine: TaskCardRow[]; given: TaskCardRow[]; left: number; mineTotal: number; givenTotal: number };
  /** Widget ids that failed to load this time (logged; the rest of the page still shows). */
  failed: string[];
};

type Collected = { [K in WidgetKind]: { w: Widget; item: unknown }[] };

async function run(c: DashContext, list: readonly Widget[]) {
  const out: Collected = { band: [], attention: [], agenda: [], birthdays: [], panel: [] };
  const failed: string[] = [];
  for (const w of list) {
    // Each widget runs inside a savepoint: a failed query aborts only its own
    // part of the transaction, so the widgets after it still load.
    await c.tx.$executeRawUnsafe("SAVEPOINT widget");
    try {
      const r = await w.load(c);
      const items = r == null ? [] : Array.isArray(r) ? r : [r];
      await c.tx.$executeRawUnsafe("RELEASE SAVEPOINT widget");
      for (const item of items) out[w.kind].push({ w, item });
    } catch (e) {
      await c.tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT widget");
      failed.push(w.id);
      console.error(JSON.stringify({ level: "error", event: "dashboard-widget", widget: w.id, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  return { out, failed };
}

/** "School day 86 of 220" from the year's working days and closed days on the School Calendar. */
async function schoolDayLine(tx: Tx, viewer: Viewer, today: Date, year: DashContext["year"]) {
  if (!year) return null;
  const campusId = viewer.campusId ?? (await mainCampusId(tx, viewer.ctx));
  const settings = await academicSettings(tx, viewer.ctx, campusId);
  const closed = await tx.calendarEntry.findMany({ where: { archivedAt: null, type: { in: CLOSED_TYPES }, attendanceOn: false, startDate: { lte: year.endDate }, endDate: { gte: year.startDate }, OR: [{ campusId: null }, { campusId }] } });
  const off = new Set<string>();
  for (const e of closed) for (let d = e.startDate; d <= e.endDate; d = addDays(d, 1)) off.add(d.toISOString().slice(0, 10));
  const working = (d: Date) => settings.workingDays.includes(((d.getUTCDay() + 6) % 7) + 1) && !off.has(d.toISOString().slice(0, 10));
  if (today < year.startDate) return `${year.name} starts ${dayWord(year.startDate, today) === "Tomorrow" ? "tomorrow" : `in ${plural(daysBetween(today, year.startDate), "day")}`}`;
  if (today > year.endDate) return `${year.name} has ended`;
  let n = 0, total = 0;
  for (let d = year.startDate; d <= year.endDate; d = addDays(d, 1)) {
    if (!working(d)) continue;
    total++;
    if (d <= today) n++;
  }
  if (!working(today)) {
    const holiday = closed.find((e) => e.startDate <= today && e.endDate >= today);
    return holiday ? `${holiday.title} · no school today` : "No school today";
  }
  return `School day ${n} of ${total}`;
}

export async function buildHome(viewer: Viewer, opts: { now?: Date; widgets?: readonly Widget[]; built?: ReadonlySet<ModuleKey> } = {}): Promise<Home> {
  const now = opts.now ?? new Date();
  const tz = viewer.school.timeZone;
  const today = todayFor(tz, now);
  const homes = homesFor(viewer);
  const list = widgetsFor(viewer, homes, opts.widgets, opts.built);

  return withSchool(viewer.ctx, async (tx) => {
    const y = await currentYear(tx, viewer.ctx, viewer.campusId);
    const year = y ? { id: y.id, name: y.name, startDate: y.startDate, endDate: y.endDate, status: y.status, campusId: y.campusId } : null;
    const cache = new Map<string, Promise<unknown>>();
    const c: DashContext = {
      tx, viewer, homes, today, now, tz, year, minuteNow: minuteIn(tz, now),
      memo: <T,>(key: string, fn: () => Promise<T>) => {
        if (!cache.has(key)) cache.set(key, fn());
        return cache.get(key) as Promise<T>;
      },
    };
    const { out, failed } = await run(c, list);

    // Band: the person's first home first, then the order set for that home, then the registry order.
    const order = (w: Widget, id: string) => {
      const hr = homeRank(w, homes);
      const home = homes[hr] as HomeKind | undefined;
      const set = home ? BAND_ORDER[home] ?? [] : [];
      const i = set.indexOf(id);
      return [hr, i === -1 ? 50 : i, WIDGETS.indexOf(w)];
    };
    const band = out.band
      .map(({ w, item }) => ({ w, item: item as BandItem }))
      .sort((a, b) => {
        const x = order(a.w, a.item.id), y2 = order(b.w, b.item.id);
        return x[0] - y2[0] || x[1] - y2[1] || x[2] - y2[2];
      })
      .map((x) => x.item)
      .filter((b, i, all) => all.findIndex((o) => o.id === b.id) === i)
      .slice(0, 4);

    // Needs attention: duplicates merged by id, most urgent first, minus what the person marked Seen (until the number changes).
    const seen = await tx.dashboardSeen.findMany({ where: { userLoginId: viewer.user.id, archivedAt: null } });
    const seenValue = new Map(seen.map((s) => [s.itemKey, s.value]));
    const attentionAll = (out.attention.map((x) => x.item) as AttentionItem[])
      .filter((a, i, all) => all.findIndex((o) => o.id === a.id) === i)
      .sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
    const attention = attentionAll.filter((a) => seenValue.get(a.id) !== a.value);

    const panels: Record<PanelSlot, Panel[]> = { first: [], main: [], side: [] };
    for (const { item } of out.panel) {
      const p = item as { slot: PanelSlot; panel: Panel };
      panels[p.slot].push(p.panel);
    }

    const agenda = (out.agenda.map((x) => x.item) as AgendaItem[]).sort((a, b) => a.sort - b.sort).slice(0, 7);
    const birthdays = (out.birthdays.map((x) => x.item) as Birthday[])
      .filter((b, i, all) => all.findIndex((o) => o.id === b.id) === i)
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

    // Waiting for your approval: only requests this person may decide.
    const approvalWhere = await approvalsFor(tx, viewer.ctx, viewer.roles.map((r) => r.key));
    const [approvalCount, approvalRows] = await Promise.all([
      tx.approval.count({ where: approvalWhere }),
      tx.approval.findMany({ where: approvalWhere, orderBy: { createdAt: "asc" }, take: 4 }),
    ]);
    const decidable = await decidableIds(tx, viewer.ctx, approvalRows);
    const askers = new Map((await tx.userLogin.findMany({ where: { id: { in: approvalRows.map((a) => a.askedById) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    const leader = isLeader(homes);
    const mayApprove = approvalCount > 0 || leader || homes.includes("class-teacher") || viewer.roles.some((r) => r.key === "hostel-warden");

    // My tasks: open ones (overdue first), and those finished today so they can be undone.
    const access = taskAccess(viewer.permissions);
    const me = viewer.user.id;
    const since = new Date(now.getTime() - 12 * 3_600_000);
    const [mine, given, mineTotal, givenTotal] = await Promise.all([
      tx.task.findMany({ where: { archivedAt: null, assignedToId: me, OR: [{ status: { in: OPEN_TASK } }, { status: "DONE", doneAt: { gte: since } }] }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], take: 30 }),
      access === "full" ? tx.task.findMany({ where: { archivedAt: null, givenById: me, assignedToId: { not: me }, status: { in: OPEN_TASK } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }], take: 6 }) : Promise.resolve([]),
      tx.task.count({ where: { archivedAt: null, assignedToId: me, status: { in: OPEN_TASK } } }),
      access === "full" ? tx.task.count({ where: { archivedAt: null, givenById: me, assignedToId: { not: me }, status: { in: OPEN_TASK } } }) : Promise.resolve(0),
    ]);
    const names = new Map((await tx.userLogin.findMany({ where: { id: { in: [...mine.map((t) => t.givenById), ...given.map((t) => t.assignedToId)] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    const dueWords = (d: Date | null) => {
      if (!d) return null;
      const day = todayFor(tz, d);
      const time = d.toLocaleTimeString("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
      const diff = daysBetween(today, day);
      if (diff < 0) return diff === -1 ? `Was due yesterday, ${time}` : `Was due ${day.getUTCDate()} ${day.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
      return `${diff === 0 ? "Today" : dayWord(day, today)}, ${time}`;
    };
    const row = (t: (typeof mine)[number], kind: "mine" | "given"): TaskCardRow => ({
      id: t.id, title: t.title, due: dueWords(t.dueAt), overdue: isOverdue(t, now), done: t.status === "DONE", status: t.status,
      by: kind === "mine" && t.givenById !== me ? names.get(t.givenById) ?? null : null,
      to: kind === "given" ? names.get(t.assignedToId) ?? null : null,
    });
    const mineRows = mine.map((t) => row(t, "mine")).sort((a, b) => Number(a.done) - Number(b.done) || Number(b.overdue) - Number(a.overdue)).slice(0, 8);

    const dayLine = await schoolDayLine(tx, viewer, today, year).catch(() => null);

    return {
      homes, leader,
      first: viewer.user.displayName.split(" ")[0],
      dayLine: [longDay(today), dayLine].filter(Boolean).join(" · "),
      band, attention, hiddenSeen: attentionAll.length - attention.length, panels, agenda, birthdays,
      approvals: mayApprove ? {
        count: approvalCount,
        rows: approvalRows.filter((a) => decidable.has(a.id)).map((a) => ({ id: a.id, who: askers.get(a.askedById) ?? "Someone", what: `${requestLabel(a.type)} · ${a.summary}`, amount: a.amountPaise !== null ? formatRupees(a.amountPaise) : null })),
      } : null,
      tasks: { access, mine: mineRows, given: given.map((t) => row(t, "given")), left: mineTotal, mineTotal, givenTotal },
      failed,
    };
  }, { timeout: 30_000 });
}
