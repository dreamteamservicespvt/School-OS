// Builds one person's Dashboard: picks their homes, runs only the widgets
// they may see (built module, switched on, allowed), and orders the result
// the way the approved design lays it out (01-dashboard.md §2).
import "server-only";

import { availableParallelism } from "node:os";
import type { TaskStatus } from "@prisma/client";
import { withSchool, type Tx } from "../db";
import { currentYear, yearsFor } from "../academic/years";
import { personCampusId } from "../campus";
import { approvalsFor, requestLabel } from "../approvals";
import { decidableIds } from "../approvals-inbox";
import { askerJobs } from "../approval-people";
import { formatRupees } from "../format";
import { todayFor } from "../periods";
import { homesFor, isLeader } from "./homes";
import { WIDGETS } from "./registry";
import { BUILT_MODULES, type ModuleKey } from "../modules";
import { daysBetween, dayWord, longDay, minuteIn, moduleOpen, plural } from "./common";
import { schoolCalendar } from "../calendar/school-days";
import { taskAccess, isOverdue, OPEN_TASK } from "./tasks";
import type { AgendaItem, AttentionItem, BandItem, Birthday, DashContext, HomeKind, Panel, PanelSlot, Viewer, Widget, WidgetKind, WidgetOutput } from "./types";

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
/** One request on the home card: who asks (their job), what, and the reason they gave (owner's changes of 13 Oct 2026). */
export type ApprovalCardRow = { id: string; who: string; as: string | null; what: string; why: string | null; amount: string | null };

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

/** At most this many transactions load one Dashboard at once (QA PLATFORM-13). */
const MAX_LANES = 6;

/**
 * Connections in the app's database pool: connection_limit in DATABASE_URL
 * (the Vercel test copy sets 3), else about Prisma's default (2 per CPU core + 1).
 */
export function poolSize(url = process.env.DATABASE_URL ?? "", cpus = availableParallelism()) {
  const m = /[?&]connection_limit=(\d+)/.exec(url);
  return m ? Math.max(1, Number(m[1])) : cpus + 1;
}

/** Lanes for one page: never more than the pool holds, MAX_LANES, or the bundles to share out. */
export function laneCount(bundles: number, pool = poolSize()) {
  return Math.max(1, Math.min(MAX_LANES, pool, bundles));
}

/**
 * Modules whose widgets read the same records load in one bundle: the fee
 * and finance widgets share the person's fee view, the academic ones the
 * attendance choices of the day.
 */
const SHARES: Partial<Record<ModuleKey, ModuleKey>> = { "finance-management": "fee-management", "academic-management": "attendance-management" };

/** One piece of a lane's work: a widget, or one of the page's own reads. A job that throws ends its lane's transaction. */
type Job = { run: (c: DashContext) => Promise<void>; fail: (e: unknown) => void };

/**
 * The widgets in bundles, one per module (SHARES joins a few): widgets of a
 * module share their reads (the person's attendance reach, fee view, exam
 * sections), so they load in one transaction and read them once. Biggest
 * bundles go first so the lanes finish at about the same time; ties keep
 * the registry order.
 */
export function bundlesOf<T extends { w: Widget }>(jobs: readonly T[]): T[][] {
  const by = new Map<string, T[]>();
  for (const j of jobs) {
    const key = SHARES[j.w.module] ?? j.w.module;
    by.set(key, [...(by.get(key) ?? []), j]);
  }
  return [...by.values()].sort((a, b) => b.length - a.length);
}

/** A memo for one transaction: a shared read is made once, and only used in the transaction that read it. */
function memoFor(): DashContext["memo"] {
  const cache = new Map<string, Promise<unknown>>();
  return <T,>(key: string, fn: () => Promise<T>) => {
    let p = cache.get(key) as Promise<T> | undefined;
    if (!p) {
      p = fn();
      // Whoever awaits it still gets the error; a read nobody awaits any more must not crash the server.
      p.catch(() => {});
      cache.set(key, p);
    }
    return p;
  };
}

/**
 * The school year the Dashboard is about, read in each transaction: the
 * current year of the person's own campus (the one they are limited to, else
 * their Staff record's, else the main campus).
 */
async function yearIn(tx: Tx, viewer: Viewer): Promise<DashContext["year"]> {
  const y = await currentYear(tx, viewer.ctx, await personCampusId(tx, viewer.ctx, viewer));
  return y ? { id: y.id, name: y.name, startDate: y.startDate, endDate: y.endDate, status: y.status, campusId: y.campusId } : null;
}

/** The current year of every campus the person sees (one each), for numbers about every student. */
async function yearIdsIn(tx: Tx, viewer: Viewer, year: DashContext["year"]): Promise<string[]> {
  const ids = (await yearsFor(tx, viewer.ctx, viewer.campusId ?? null)).map((y) => y.id);
  return ids.length ? ids : year ? [year.id] : [];
}

/** Thrown inside a lane's transaction to roll it back after a job failed. */
const RESTART = Symbol("restart");

/**
 * Runs the bundles in a few transactions at the same time (QA PLATFORM-13:
 * 66 widgets one after another took up to 3 s). Each lane takes the next
 * bundle from the queue until it is empty, job after job, with its own memo:
 * no lane ever waits for another lane's query, only for a free connection.
 * When a job fails, its lane's transaction is rolled back (a failed query
 * leaves it unusable) and the lane goes on with the next job in a new one,
 * so one failing widget never stops the others. Widgets only read, so
 * nothing already loaded is lost (a settings row some modules make on first
 * read is simply made again next time).
 */
async function runLanes(viewer: Viewer, base: Omit<DashContext, "tx" | "memo" | "year" | "yearIds">, queue: Job[][], lanes = laneCount(queue.length)) {
  const lane = async () => {
    let bundle = queue.shift();
    let at = 0;
    while (bundle) {
      try {
        await withSchool(viewer.ctx, async (tx) => {
          const year = await yearIn(tx, viewer);
          const c: DashContext = { ...base, tx, year, yearIds: await yearIdsIn(tx, viewer, year), memo: memoFor() };
          for (; bundle; bundle = queue.shift(), at = 0) {
            while (at < bundle.length) {
              const job = bundle[at++];
              try {
                await job.run(c);
              } catch (e) {
                job.fail(e);
                throw RESTART;
              }
            }
          }
        }, { timeout: 30_000 });
      } catch (e) {
        if (e !== RESTART) throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, queue.length) }, lane));
}

type Loaded = { i: number; w: Widget; items: unknown[] };

/** One widget as a job: its items go to `results`, a failure to `failed` and the log. */
function widgetJob(w: Widget, i: number, results: Loaded[], failed: Set<string>) {
  return {
    w,
    run: async (c: DashContext) => {
      const r = await w.load(c);
      results.push({ i, w, items: r == null ? [] : Array.isArray(r) ? r : [r] });
    },
    fail: (e: unknown) => {
      failed.add(w.id);
      console.error(JSON.stringify({ level: "error", event: "dashboard-widget", widget: w.id, error: e instanceof Error ? e.message : String(e) }));
    },
  };
}

/** One of the page's own reads (Seen marks, approvals, tasks). Its failure fails the page, unless it has a fallback. */
function pageJob<T>(read: (c: DashContext) => Promise<T>, errors: unknown[], fallback?: () => T) {
  const job = {
    value: undefined as T | undefined,
    run: async (c: DashContext) => { job.value = await read(c); },
    fail: (e: unknown) => { if (fallback) job.value = fallback(); else errors.push(e); },
  };
  return job;
}

/** "School day 86 of 220", from the school's one rule for a school day (src/lib/calendar/school-days.ts). */
async function schoolDayLine(tx: Tx, viewer: Viewer, today: Date, year: DashContext["year"]) {
  if (!year) return null;
  if (today < year.startDate) return `${year.name} starts ${dayWord(year.startDate, today) === "Tomorrow" ? "tomorrow" : `in ${plural(daysBetween(today, year.startDate), "day")}`}`;
  if (today > year.endDate) return `${year.name} has ended`;
  // The year's own campus: its working days and its days off.
  const cal = await schoolCalendar(tx, viewer.ctx, year.startDate, year.endDate, year.campusId);
  const info = cal.info(today);
  if (!info.on) return info.reason === "holiday" ? `${info.title} · no school today` : "No school today";
  const working = cal.working();
  return `School day ${working.filter((d) => d <= today).length} of ${working.length}`;
}

/** Of these widget ids, the ones this person's Dashboard shows (their homes, module open, allowed). */
export function widgetsOpenTo(viewer: Viewer, ids: readonly string[]) {
  return widgetsFor(viewer, homesFor(viewer)).filter((w) => ids.includes(w.id));
}

/**
 * Loads some of this person's widgets of one kind in the given transaction,
 * exactly as their Dashboard does (Ask answers "Whose birthday is this week?"
 * with the Dashboard's own rows, gap list G27).
 */
export async function loadWidgetsIn<K extends WidgetKind>(tx: Tx, viewer: Viewer, kind: K, ids: readonly string[], now = new Date()): Promise<WidgetOutput[K][]> {
  const list = widgetsOpenTo(viewer, ids).filter((w) => w.kind === kind);
  if (!list.length) return [];
  const tz = viewer.school.timeZone;
  const year = await yearIn(tx, viewer);
  const c: DashContext = { tx, viewer, homes: homesFor(viewer), today: todayFor(tz, now), now, tz, minuteNow: minuteIn(tz, now), year, yearIds: await yearIdsIn(tx, viewer, year), memo: memoFor() };
  const out: WidgetOutput[K][] = [];
  for (const w of list) {
    const r = await w.load(c);
    if (r != null) out.push(...((Array.isArray(r) ? r : [r]) as WidgetOutput[K][]));
  }
  return out;
}

/** `lanes` sets how many transactions load the page (tests and measuring; 1 loads it all in one, one widget after another). */
export async function buildHome(viewer: Viewer, opts: { now?: Date; widgets?: readonly Widget[]; built?: ReadonlySet<ModuleKey>; lanes?: number } = {}): Promise<Home> {
  const now = opts.now ?? new Date();
  const tz = viewer.school.timeZone;
  const today = todayFor(tz, now);
  const homes = homesFor(viewer);
  const list = widgetsFor(viewer, homes, opts.widgets, opts.built);
  const leader = isLeader(homes);
  const access = taskAccess(viewer);
  const me = viewer.user.id;

  // The page's own reads share the lanes with the widgets.
  const results: Loaded[] = [];
  const failedIds = new Set<string>();
  const errors: unknown[] = [];
  const seenJob = pageJob(({ tx }) => tx.dashboardSeen.findMany({ where: { userLoginId: me, archivedAt: null } }), errors);
  // Waiting for your approval: only requests this person may decide.
  const approvalJob = pageJob(async ({ tx }) => {
    const where = await approvalsFor(tx, viewer.ctx, viewer.roles.map((r) => r.key));
    const [count, rows] = await Promise.all([
      tx.approval.count({ where }),
      tx.approval.findMany({ where, orderBy: { createdAt: "asc" }, take: 4 }),
    ]);
    const decidable = await decidableIds(tx, viewer.ctx, rows);
    const askers = new Map((await tx.userLogin.findMany({ where: { id: { in: rows.map((a) => a.askedById) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    const jobs = await askerJobs(tx, rows.map((a) => a.askedById));
    return { count, rows, decidable, askers, jobs };
  }, errors);
  // My tasks: open ones (overdue first), and those finished today so they can be undone.
  const taskJob = pageJob(async ({ tx }) => {
    const since = new Date(now.getTime() - 12 * 3_600_000);
    const [mine, given, mineTotal, givenTotal] = await Promise.all([
      tx.task.findMany({ where: { archivedAt: null, assignedToId: me, OR: [{ status: { in: OPEN_TASK } }, { status: "DONE", doneAt: { gte: since } }] }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], take: 30 }),
      access === "full" ? tx.task.findMany({ where: { archivedAt: null, givenById: me, assignedToId: { not: me }, status: { in: OPEN_TASK } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }], take: 6 }) : Promise.resolve([]),
      tx.task.count({ where: { archivedAt: null, assignedToId: me, status: { in: OPEN_TASK } } }),
      access === "full" ? tx.task.count({ where: { archivedAt: null, givenById: me, assignedToId: { not: me }, status: { in: OPEN_TASK } } }) : Promise.resolve(0),
    ]);
    const names = new Map((await tx.userLogin.findMany({ where: { id: { in: [...mine.map((t) => t.givenById), ...given.map((t) => t.assignedToId)] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    return { mine, given, mineTotal, givenTotal, names };
  }, errors);
  const dayJob = pageJob(({ tx, year }) => schoolDayLine(tx, viewer, today, year), errors, () => null);

  const queue: Job[][] = [...bundlesOf(list.map((w, i) => widgetJob(w, i, results, failedIds))), [seenJob], [approvalJob], [taskJob], [dayJob]];
  await runLanes(viewer, { viewer, homes, today, now, tz, minuteNow: minuteIn(tz, now) }, queue, opts.lanes);
  if (errors.length) throw errors[0];

  const out: Collected = { band: [], attention: [], agenda: [], birthdays: [], panel: [] };
  for (const { w, items } of results.sort((a, b) => a.i - b.i)) for (const item of items) out[w.kind].push({ w, item });
  const failed = list.filter((w) => failedIds.has(w.id)).map((w) => w.id);

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
  const seenValue = new Map(seenJob.value!.map((s) => [s.itemKey, s.value]));
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

  const ap = approvalJob.value!;
  const mayApprove = ap.count > 0 || leader || homes.includes("class-teacher") || viewer.roles.some((r) => r.key === "hostel-warden");

  const { mine, given, mineTotal, givenTotal, names } = taskJob.value!;
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

  return {
    homes, leader,
    first: viewer.user.displayName.split(" ")[0],
    dayLine: [longDay(today), dayJob.value].filter(Boolean).join(" · "),
    band, attention, hiddenSeen: attentionAll.length - attention.length, panels, agenda, birthdays,
    approvals: mayApprove ? {
      count: ap.count,
      rows: ap.rows.filter((a) => ap.decidable.has(a.id)).map((a) => ({ id: a.id, who: ap.askers.get(a.askedById) ?? "Someone", as: ap.jobs.get(a.askedById) ?? null, what: `${requestLabel(a.type)} · ${a.summary}`, why: a.reason, amount: a.amountPaise !== null ? formatRupees(a.amountPaise) : null })),
    } : null,
    tasks: { access, mine: mineRows, given: given.map((t) => row(t, "given")), left: mineTotal, mineTotal, givenTotal },
    failed,
  };
}
