// Homework & Learning on the Dashboard (01-dashboard.md: the teacher's to-do
// "homework to check"). Reach follows src/lib/homework/scope.ts: a teacher sees
// the work of their own classes and subjects; the Principal, School Admin, Vice
// Principal and Academic Head watch the whole school and remind (src/lib/duty.ts),
// so they get who has work piling up and how much homework is handed in.
import "server-only";

import { dayStartUtc } from "../../periods";
import { homeworkScope, inYears, PILING_UP, pilingUp, workToCheck, type HomeworkScope } from "../../homework/scope";
import { homeworkDoneBySection } from "../../homework/progress";
import { pct } from "../../homework/words";
import { homeworkFeatures } from "../../homework/settings";
import { plural, someNames } from "../common";
import type { AgendaItem, AttentionItem, BarRow, DashContext, Widget } from "../types";

const BASE = "/homework-learning";
const DAY = 86_400_000;

/** The person's homework reach today, once per Dashboard. Null when the year has not started. */
function scopeOf(c: DashContext): Promise<HomeworkScope | null> {
  return c.memo("homework-scope", async () => {
    try {
      const s = await homeworkScope(c.tx, c.viewer, c.today);
      return s.yearIds.length ? s : null;
    } catch {
      return null;
    }
  });
}

/** Work handed in and waiting for the person's marks: their own classes and subjects (Homework, ?check=1). */
const toCheck: Widget<"attention"> = {
  id: "homework.to-check",
  module: "homework-learning",
  kind: "attention",
  homes: ["teacher", "class-teacher"],
  async load(c) {
    const s = await scopeOf(c);
    if (!s || s.level === "student" || s.modes.submissions !== "edit") return null;
    // Homework's own "work to check" list (workToCheck, gap list G36).
    const work = await workToCheck(c.tx, s);
    const pieces = work.reduce((a, h) => a + h.pieces, 0);
    if (!pieces) return null;
    const oldest = [...work].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const late = oldest.filter((h) => h.dueDate.getTime() < c.today.getTime() - 3 * DAY).length;
    return {
      id: "homework.to-check", tone: late ? "bad" : "warn", icon: "BookOpenCheck",
      title: `${plural(pieces, "piece")} of homework to check`,
      detail: someNames(oldest.map((h) => `${h.title} (${h.pieces})`), 3),
      action: "Check work", href: `${BASE}?check=1`, value: String(pieces),
    } satisfies AttentionItem;
  },
};

/** For the people who watch homework: teachers with 10 or more pieces waiting to be checked (Remind on Homework). */
const pilingUpCard: Widget<"attention"> = {
  id: "homework.piling-up",
  module: "homework-learning",
  kind: "attention",
  homes: ["leader", "academic-head"],
  async load(c) {
    const s = await scopeOf(c);
    if (!s || s.level !== "full" || !s.modes.homework) return null;
    // Homework's ?check=piling lists these teachers' work (pilingUp, gap list G36).
    const many = pilingUp(await workToCheck(c.tx, s));
    if (!many.length) return null;
    const staff = await c.tx.staff.findMany({ where: { id: { in: many.slice(0, 3).map(([id]) => id) } }, select: { id: true, fullName: true } });
    const name = new Map(staff.map((x) => [x.id, x.fullName]));
    return {
      id: "homework.piling-up", tone: "warn", icon: "BookOpenCheck",
      title: `${plural(many.length, "teacher")} with ${PILING_UP} or more pieces of homework to check`,
      detail: someNames(many.slice(0, 3).map(([id, n]) => `${name.get(id) ?? "Teacher"} (${n})`), 3),
      action: "See and remind", href: `${BASE}?check=piling`, value: many.map(([id, n]) => `${id.slice(0, 6)}${n}`).join(","),
    } satisfies AttentionItem;
  },
};

/** How many sections the leaders' "Homework handed in" shows: the lowest first. */
const HANDED_IN_ROWS = 8;

/**
 * Homework of the last 7 days: the share handed in for each section, Learning Progress's own
 * "Homework done" for that section and dates (homeworkDoneBySection), so each bar opens the
 * class on the same number (gap list G36). Full reach: the sections with the lowest share.
 */
const handedIn: Widget<"panel"> = {
  id: "homework.handed-in",
  module: "homework-learning",
  kind: "panel",
  homes: ["leader", "academic-head", "class-teacher"],
  async load(c) {
    const s = await scopeOf(c);
    if (!s || s.level === "student" || !s.modes["learning-progress"]) return null;
    const from = new Date(c.today.getTime() - 6 * DAY);
    // Full reach: every section (of their campus, when limited to one); a class teacher: their own.
    const ids = s.level === "full" ? s.campusSections : s.ctSections;
    if (ids && !ids.length) return null;
    const sections = await c.tx.section.findMany({ where: { academicYearId: inYears(s), archivedAt: null, ...(ids ? { id: { in: ids } } : {}) }, include: { schoolClass: { select: { name: true, sortOrder: true } } } });
    const share = await homeworkDoneBySection(c.tx, sections.map((x) => x.id), from, c.today);
    const range = `period=custom&from=${from.toISOString().slice(0, 10)}&to=${c.today.toISOString().slice(0, 10)}`;
    const all = sections.filter((x) => (share.get(x.id)?.given ?? 0) > 0).map((x) => {
      const g = share.get(x.id)!;
      return { key: x.id, label: `${x.schoolClass.name} ${x.name}`, value: pct(g.done, g.given), sort: x.schoolClass.sortOrder, href: `${BASE}/learning-progress?section=${x.id}&${range}` };
    });
    if (!all.length) return null;
    const many = s.level === "full" && all.length > HANDED_IN_ROWS;
    const rows: BarRow[] = (many ? [...all].sort((a, b) => a.value - b.value).slice(0, HANDED_IN_ROWS) : all)
      .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "en", { numeric: true }))
      .map((r) => ({ key: r.key, label: r.label, value: r.value, href: r.href }));
    const done = [...share.values()].reduce((n, g) => n + g.done, 0), given = [...share.values()].reduce((n, g) => n + g.given, 0);
    return {
      slot: "side",
      panel: { kind: "bars", title: "Homework handed in", icon: "BookOpenCheck", sub: `Homework of the last 7 days · ${pct(done, given)}% overall${many ? ` · the ${HANDED_IN_ROWS} lowest of ${all.length} sections` : ""}`, rows, goal: 90, lowBelow: 75, href: `${BASE}/learning-progress?${range}`, linkLabel: "Learning Progress", empty: "" },
    };
  },
};

/** The person's own online classes today (Online Classes, when the school has it on). */
const onlineToday: Widget<"agenda"> = {
  id: "homework.online-today",
  module: "homework-learning",
  kind: "agenda",
  homes: ["teacher", "class-teacher"],
  async load(c) {
    const s = await scopeOf(c);
    if (!s || !s.staffId || !s.modes["online-classes"]) return [];
    if (!(await homeworkFeatures(c.tx, c.viewer.ctx)).has("homework-online-classes")) return [];
    const start = dayStartUtc(c.today.toISOString().slice(0, 10), c.tz);
    const sessions = await c.tx.onlineClassSession.findMany({
      where: { archivedAt: null, teacherId: s.staffId, status: { not: "CANCELLED" }, startsAt: { gte: start, lt: new Date(start.getTime() + DAY) } },
      orderBy: { startsAt: "asc" }, take: 4,
    });
    return sessions.map((x): AgendaItem => {
      const minute = Math.round((x.startsAt.getTime() - start.getTime()) / 60_000);
      const h = Math.floor(minute / 60), m = minute % 60;
      return { id: `online:${x.id}`, time: `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`, title: `Online class: ${x.title}`, where: `${x.lengthMin} min`, tone: "info", href: `${BASE}/online-classes?open=${x.id}`, sort: minute };
    });
  },
};

export const HOMEWORK_WIDGETS: Widget[] = [toCheck, pilingUpCard, handedIn, onlineToday] as Widget[];
