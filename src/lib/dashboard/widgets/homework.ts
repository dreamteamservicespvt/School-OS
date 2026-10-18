// Homework & Learning on the Dashboard (01-dashboard.md: the teacher's to-do
// "homework to check"). Reach follows src/lib/homework/scope.ts: a teacher sees
// the work of their own classes and subjects; the Principal, School Admin, Vice
// Principal and Academic Head watch the whole school and remind (src/lib/duty.ts),
// so they get who has work piling up and how much homework is handed in.
import "server-only";

import { dayStartUtc } from "../../periods";
import { homeworkScope, inYears, listWhere, workWhere, type HomeworkScope } from "../../homework/scope";
import { homeworkFeatures } from "../../homework/settings";
import { plural, someNames } from "../common";
import type { AgendaItem, AttentionItem, BarRow, DashContext, Widget } from "../types";

const BASE = "/homework-learning";
const TO_CHECK = ["SUBMITTED", "LATE"] as const;
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

/** Work handed in and waiting for the person's marks: their own classes and subjects. */
const toCheck: Widget<"attention"> = {
  id: "homework.to-check",
  module: "homework-learning",
  kind: "attention",
  homes: ["teacher", "class-teacher"],
  async load(c) {
    const s = await scopeOf(c);
    if (!s || s.level === "student" || s.modes.submissions !== "edit") return null;
    const rows = await c.tx.submission.findMany({
      where: { archivedAt: null, status: { in: [...TO_CHECK] }, homework: { archivedAt: null, academicYearId: inYears(s), ...workWhere(s) } },
      select: { homework: { select: { id: true, title: true, dueDate: true } } },
    });
    if (!rows.length) return null;
    const byHw = new Map<string, { title: string; n: number; due: Date }>();
    for (const r of rows) {
      const h = byHw.get(r.homework.id) ?? { title: r.homework.title, n: 0, due: r.homework.dueDate };
      h.n++;
      byHw.set(r.homework.id, h);
    }
    const oldest = [...byHw.values()].sort((a, b) => a.due.getTime() - b.due.getTime());
    const late = oldest.filter((h) => h.due.getTime() < c.today.getTime() - 3 * DAY).length;
    return {
      id: "homework.to-check", tone: late ? "bad" : "warn", icon: "BookOpenCheck",
      title: `${plural(rows.length, "piece")} of homework to check`,
      detail: someNames(oldest.map((h) => `${h.title} (${h.n})`), 3),
      action: "Check work", href: `${BASE}/submissions`, value: String(rows.length),
    } satisfies AttentionItem;
  },
};

/** For the people who watch homework: teachers with 10 or more pieces waiting to be checked (Remind on Homework). */
const pilingUp: Widget<"attention"> = {
  id: "homework.piling-up",
  module: "homework-learning",
  kind: "attention",
  homes: ["leader", "academic-head"],
  async load(c) {
    const s = await scopeOf(c);
    if (!s || s.level !== "full" || !s.modes.homework) return null;
    const waiting = await c.tx.homework.findMany({
      where: { archivedAt: null, ...listWhere(s), teacherId: { not: null }, submissions: { some: { archivedAt: null, status: { in: [...TO_CHECK] } } } },
      select: { teacherId: true, _count: { select: { submissions: { where: { archivedAt: null, status: { in: [...TO_CHECK] } } } } } },
    });
    const per = new Map<string, number>();
    for (const h of waiting) per.set(h.teacherId!, (per.get(h.teacherId!) ?? 0) + h._count.submissions);
    const many = [...per.entries()].filter(([, n]) => n >= 10).sort((a, b) => b[1] - a[1]);
    if (!many.length) return null;
    const staff = await c.tx.staff.findMany({ where: { id: { in: many.slice(0, 3).map(([id]) => id) } }, select: { id: true, fullName: true } });
    const name = new Map(staff.map((x) => [x.id, x.fullName]));
    return {
      id: "homework.piling-up", tone: "warn", icon: "BookOpenCheck",
      title: `${plural(many.length, "teacher")} with 10 or more pieces of homework to check`,
      detail: someNames(many.slice(0, 3).map(([id, n]) => `${name.get(id) ?? "Teacher"} (${n})`), 3),
      action: "See and remind", href: BASE, value: many.map(([id, n]) => `${id.slice(0, 6)}${n}`).join(","),
    } satisfies AttentionItem;
  },
};

/** Homework due in the last 7 days: the share handed in, by class (full reach) or by the person's sections. */
const handedIn: Widget<"panel"> = {
  id: "homework.handed-in",
  module: "homework-learning",
  kind: "panel",
  homes: ["leader", "academic-head", "class-teacher"],
  async load(c) {
    const s = await scopeOf(c);
    if (!s || s.level === "student" || !s.modes["learning-progress"]) return null;
    const from = new Date(c.today.getTime() - 7 * DAY);
    // Full reach: every section (of their campus, when limited to one); a class teacher: their own.
    const sectionIds = s.level === "full" ? s.campusSections : s.ctSections;
    if (sectionIds && !sectionIds.length) return null;
    const hws = await c.tx.homework.findMany({
      where: { archivedAt: null, academicYearId: inYears(s), dueDate: { gte: from, lt: c.today }, ...(sectionIds ? { sectionId: { in: sectionIds } } : {}) },
      select: { sectionId: true, classId: true, submissions: { where: { archivedAt: null, status: { not: "EXCUSED" } }, select: { status: true } } },
    });
    if (!hws.length) return null;
    const sections = await c.tx.section.findMany({ where: { id: { in: [...new Set(hws.map((h) => h.sectionId))] } }, include: { schoolClass: { select: { name: true, sortOrder: true } } } });
    const byClass = sectionIds === null;
    const groups = new Map<string, { label: string; sort: number; done: number; all: number; href: string }>();
    for (const h of hws) {
      const sec = sections.find((x) => x.id === h.sectionId);
      if (!sec) continue;
      const key = byClass ? h.classId : h.sectionId;
      const g = groups.get(key) ?? { label: byClass ? sec.schoolClass.name : `${sec.schoolClass.name} ${sec.name}`, sort: sec.schoolClass.sortOrder, done: 0, all: 0, href: `${BASE}/learning-progress?section=${sec.id}&period=last7` };
      g.all += h.submissions.length;
      g.done += h.submissions.filter((x) => x.status === "SUBMITTED" || x.status === "LATE" || x.status === "GRADED").length;
      groups.set(key, g);
    }
    const rows: BarRow[] = [...groups.entries()].filter(([, g]) => g.all > 0).sort((a, b) => a[1].sort - b[1].sort || a[1].label.localeCompare(b[1].label))
      .map(([key, g]) => ({ key, label: g.label, value: Math.round((g.done / g.all) * 100), href: g.href }));
    if (!rows.length) return null;
    const done = [...groups.values()].reduce((n, g) => n + g.done, 0), all = [...groups.values()].reduce((n, g) => n + g.all, 0);
    return {
      slot: "side",
      panel: { kind: "bars", title: "Homework handed in", icon: "BookOpenCheck", sub: `Due in the last 7 days · ${Math.round((done / all) * 100)}% overall`, rows, goal: 90, lowBelow: 75, href: `${BASE}/learning-progress`, linkLabel: "Learning Progress", empty: "" },
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

export const HOMEWORK_WIDGETS: Widget[] = [toCheck, pilingUp, handedIn, onlineToday] as Widget[];
