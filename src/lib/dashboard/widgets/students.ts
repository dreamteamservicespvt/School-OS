// Student Management on the Dashboard: head counts, students per class
// and section, guardians without data consent, a class teacher's own
// section, birthdays, discipline and counselling (01 §2, 03).
// Each number uses the same query as the list it opens, so they always match.
import "server-only";

import { Prisma } from "@prisma/client";
import { readListParams } from "../../list";
import { abilities, studentScope } from "../../students/access";
import { getStudentSettings } from "../../students/settings";
import { consentRows, consentState } from "../../students/consent";
import { STUDYING } from "../../students/labels";
import { classTiles, LIST_FILTERS, studentListWhere } from "@/app/(school)/student-management/_lib/queries";
import { addDays, dayWord, myClassSections, n, plural } from "../common";
import type { BandItem, Birthday, DashContext, ListRow, Viewer, Widget } from "../types";

const BASE = "/student-management";

const settingsOf = (c: DashContext) => c.memo("student-settings", () => getStudentSettings(c.tx, c.viewer.ctx));
const canOf = async (c: DashContext) => abilities(c.viewer, await settingsOf(c));
/** People who work with students (not only look one up). */
const worksWithStudents = (v: Viewer) => { const a = abilities(v); return a.reach !== "none" && !a.lookupOnly; };

/** Students in the default Student List (studying, within the person's reach). */
async function studentCount(c: DashContext, raw: Record<string, string> = {}) {
  const settings = await settingsOf(c);
  const where = await studentListWhere(c.tx, c.viewer, readListParams(raw, LIST_FILTERS), c.year?.id ?? null, c.year?.startDate ?? null, settings);
  return c.tx.student.count({ where });
}

const studentsBand: Widget<"band"> = {
  id: "students.head-count",
  module: "student-management",
  kind: "band",
  homes: ["leader", "office"],
  allowed: (v) => abilities(v).reach === "all",
  async load(c) {
    const [total, fresh] = await Promise.all([studentCount(c), c.year ? studentCount(c, { new: "1" }) : Promise.resolve(0)]);
    const sections = c.year ? await c.tx.section.count({ where: { academicYearId: c.year.id, archivedAt: null } }) : 0;
    return { id: "students.head-count", label: "Students", big: n(total), foot: [sections ? `${plural(sections, "section")}` : null, fresh ? `${n(fresh)} joined this year` : null].filter(Boolean).join(" · ") || "Studying now", href: BASE };
  },
};

/** Guardians with data consent not given, the same as Parents & Guardians filtered to "Consent not given". */
async function guardiansWithoutConsent(c: DashContext) {
  return c.memo("guardians-no-consent", async () => {
    const can = await canOf(c);
    const and: Prisma.GuardianWhereInput[] = [{ archivedAt: null }];
    if (can.reach === "own") and.push({ students: { some: { archivedAt: null, student: await studentScope(c.tx, c.viewer, c.year?.id) } } });
    const guardians = await c.tx.guardian.findMany({ where: { AND: and }, select: { id: true } });
    if (!guardians.length) return { total: 0, without: 0 };
    const rows = await consentRows(c.tx, c.viewer.ctx, { guardianIds: guardians.map((g) => g.id) });
    const by = new Map<string, { consentType: string; status: string }[]>();
    for (const r of rows) by.set(r.guardianId, [...(by.get(r.guardianId) ?? []), r]);
    const without = guardians.filter((g) => consentState(by.get(g.id) ?? [], "data-processing") !== "GIVEN").length;
    return { total: guardians.length, without };
  });
}

const parentsBand: Widget<"band"> = {
  id: "students.parents",
  module: "student-management",
  kind: "band",
  homes: ["leader"],
  allowed: (v) => abilities(v).reach === "all",
  async load(c) {
    const g = await guardiansWithoutConsent(c);
    if (!g.total) return null;
    return { id: "students.parents", label: "Parents", big: n(g.total), foot: g.without ? `${n(g.without)} without data consent` : "All gave data consent", href: `${BASE}/guardians` };
  },
};

const consentAttention: Widget<"attention"> = {
  id: "students.no-consent",
  module: "student-management",
  kind: "attention",
  homes: ["leader", "class-teacher", "office"],
  allowed: worksWithStudents,
  async load(c) {
    const g = await guardiansWithoutConsent(c);
    if (!g.without) return null;
    const can = await canOf(c);
    return {
      id: "students.no-consent", tone: "warn", icon: "BadgeCheck",
      title: `${plural(g.without, "guardian")} ${g.without === 1 ? "has" : "have"} not given data consent`,
      detail: can.manage ? "Send the consent request through Parent Link from the list" : "Of the students you teach · the office sends the request through Parent Link",
      action: "See list", href: `${BASE}/guardians?consent=not-given`, value: String(g.without),
    };
  },
};

const classesOverview: Widget<"panel"> = {
  id: "students.classes-overview",
  module: "student-management",
  kind: "panel",
  homes: ["leader", "academic-head", "office"],
  allowed: (v) => abilities(v).reach === "all",
  async load(c) {
    if (!c.year) return null;
    const tiles = await classTiles(c.tx, c.viewer, c.year.id);
    if (!tiles.length) return null;
    const total = tiles.reduce((s, t) => s + t.total, 0);
    return {
      slot: "main",
      panel: {
        kind: "classes-overview", title: "Classes overview", sub: `${n(total)} students studying in ${plural(tiles.reduce((s, t) => s + t.sections.length, 0), "section")}`, total, href: BASE,
        classes: tiles.map((t) => ({ id: t.id, name: t.name, total: t.total, href: `${BASE}?class=${t.id}`, sections: t.sections.map((s) => ({ ...s, href: `${BASE}?class=${t.id}&section=${s.id}` })) })),
      },
    };
  },
};

/** The class teacher's own section (or sections). */
const myClass: Widget<"panel"> = {
  id: "students.my-class",
  module: "student-management",
  kind: "panel",
  homes: ["class-teacher"],
  async load(c) {
    if (!c.year) return null;
    const ids = await myClassSections(c);
    if (!ids.length) return null;
    const sections = await c.tx.section.findMany({ where: { id: { in: ids } }, include: { schoolClass: true } });
    const s = sections.sort((a, b) => a.schoolClass.sortOrder - b.schoolClass.sortOrder)[0];
    const label = `${s.schoolClass.name} ${s.name}`;
    const q = { class: s.classId, section: s.id };
    const link = (extra: Record<string, string> = {}) => `${BASE}?${new URLSearchParams({ ...q, ...extra })}`;
    const [count, fresh, noPhoto] = await Promise.all([studentCount(c, q), studentCount(c, { ...q, new: "1" }), studentCount(c, { ...q, photo: "missing" })]);
    const settings = await settingsOf(c);
    const missing = await c.tx.student.findMany({
      where: await studentListWhere(c.tx, c.viewer, readListParams({ ...q, photo: "missing" }, LIST_FILTERS), c.year.id, c.year.startDate, settings),
      orderBy: { fullName: "asc" }, take: 3,
      include: { enrolments: { where: { academicYearId: c.year.id, archivedAt: null }, take: 1 } },
    });
    const rows: ListRow[] = missing.map((m) => ({ id: m.id, avatar: m.fullName, title: m.fullName, sub: `${m.enrolments[0]?.rollNo ? `Roll ${m.enrolments[0].rollNo} · ` : ""}photo missing`, href: `${BASE}/students/${m.id}` }));
    return {
      slot: "side",
      panel: {
        kind: "my-class", title: `My class: ${label}`, sub: [plural(count, "student"), s.room ? (/^\d/.test(s.room) ? `Room ${s.room}` : s.room) : null, sections.length > 1 ? `and ${plural(sections.length - 1, "more section")}` : null].filter(Boolean).join(" · "),
        href: link(),
        stats: [
          { label: "Students", value: n(count), href: link() },
          { label: "New this year", value: n(fresh), href: link({ new: "1" }) },
          { label: "Photo missing", value: n(noPhoto), href: link({ photo: "missing" }) },
        ],
        rows,
      },
    };
  },
};

const myClassBand: Widget<"band"> = {
  id: "students.my-class-count",
  module: "student-management",
  kind: "band",
  homes: ["class-teacher"],
  async load(c) {
    const ids = await myClassSections(c);
    if (!ids.length || !c.year) return null;
    const s = await c.tx.section.findFirst({ where: { id: { in: ids } }, include: { schoolClass: true }, orderBy: { schoolClass: { sortOrder: "asc" } } });
    if (!s) return null;
    const count = await studentCount(c, { class: s.classId, section: s.id });
    return { id: "students.my-class-count", label: `My class: ${s.schoolClass.name} ${s.name}`, big: n(count), foot: s.room ? `Students · ${/^\d/.test(s.room) ? `Room ${s.room}` : s.room}` : "Students", href: `${BASE}?${new URLSearchParams({ class: s.classId, section: s.id })}` };
  },
};

// ---------------------------------------------------------------- birthdays

/** "MM-DD" for each of the next 7 days, and the day each one falls on. */
function nextWeek(today: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i);
    return { key: d.toISOString().slice(5, 10), date: d };
  });
}

const birthdays: Widget<"birthdays"> = {
  id: "students.birthdays",
  module: "student-management",
  kind: "birthdays",
  homes: ["leader", "teacher", "class-teacher", "academic-head", "counsellor"],
  allowed: worksWithStudents,
  async load(c) {
    const days = nextWeek(c.today);
    const keys = days.map((d) => d.key);
    const found = await c.tx.$queryRaw<{ id: string }[]>`SELECT id FROM student WHERE archived_at IS NULL AND date_of_birth IS NOT NULL AND to_char(date_of_birth, 'MM-DD') = ANY(${keys})`;
    if (!found.length) return [];
    const scope = await studentScope(c.tx, c.viewer, c.year?.id);
    const students = await c.tx.student.findMany({
      where: { AND: [scope, { id: { in: found.map((f) => f.id) }, status: { in: [...STUDYING] } }] },
      include: { enrolments: { where: { archivedAt: null, ...(c.year ? { academicYearId: c.year.id } : {}) }, take: 1 } },
    });
    const sections = new Map((await c.tx.section.findMany({ where: { id: { in: students.flatMap((s) => s.enrolments.map((e) => e.sectionId)) } }, include: { schoolClass: true } })).map((s) => [s.id, `${s.schoolClass.name.replace(/^Class /, "")} ${s.name}`]));
    const out: Birthday[] = students.map((s) => {
      const day = days.find((d) => d.key === s.dateOfBirth!.toISOString().slice(5, 10))!;
      const sec = s.enrolments[0] ? sections.get(s.enrolments[0].sectionId) : null;
      return { id: `student:${s.id}`, name: sec ? `${s.fullName}, ${sec}` : s.fullName, when: dayWord(day.date, c.today), sort: day.date.getTime() };
    });
    // Parents appear when a guardian's date of birth is recorded; a teacher sees only their own students' parents.
    const parentFound = await c.tx.$queryRaw<{ id: string }[]>`SELECT id FROM guardian WHERE archived_at IS NULL AND date_of_birth IS NOT NULL AND to_char(date_of_birth, 'MM-DD') = ANY(${keys})`;
    if (parentFound.length) {
      const parents = await c.tx.guardian.findMany({
        where: { id: { in: parentFound.map((p) => p.id) }, students: { some: { archivedAt: null, student: { AND: [scope, { status: { in: [...STUDYING] } }] } } } },
        include: { students: { where: { archivedAt: null }, include: { student: { select: { fullName: true } } }, take: 1 } },
      });
      for (const p of parents) {
        const day = days.find((d) => d.key === p.dateOfBirth!.toISOString().slice(5, 10))!;
        const child = p.students[0]?.student.fullName.split(" ")[0];
        out.push({ id: `guardian:${p.id}`, name: child ? `${p.name} (${child}'s ${p.relationship.toLowerCase()})` : p.name, when: dayWord(day.date, c.today), sort: day.date.getTime() });
      }
    }
    return out;
  },
};

// ---------------------------------------------------------------- behaviour, certificates, counselling

const openIncidents: Widget<"attention"> = {
  id: "students.open-incidents",
  module: "student-management",
  kind: "attention",
  homes: ["leader", "counsellor"],
  allowed: (v) => abilities(v).reach === "all" && abilities(v).seeBehaviour,
  async load(c) {
    if (!c.year) return null;
    const count = await c.tx.behaviourIncident.count({ where: { archivedAt: null, academicYearId: c.year.id, status: "OPEN" } });
    if (!count) return null;
    const latest = await c.tx.behaviourIncident.findFirst({ where: { archivedAt: null, academicYearId: c.year.id, status: "OPEN" }, orderBy: { date: "desc" }, select: { typeKey: true, date: true } });
    return {
      id: "students.open-incidents", tone: "info", icon: "UserX",
      title: `${plural(count, "discipline case")} still open`,
      detail: latest ? `Latest on ${latest.date.getUTCDate()} ${latest.date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} · close each one when it is dealt with` : "Close each one when it is dealt with",
      action: "Open", href: `${BASE}/behaviour?status=OPEN`, value: String(count),
    };
  },
};

const certificateRequests: Widget<"attention"> = {
  id: "students.certificate-requests",
  module: "student-management",
  kind: "attention",
  homes: ["office", "leader"],
  allowed: (v) => abilities(v).manage,
  async load(c) {
    const rows = await c.tx.certificate.findMany({ where: { status: "REQUESTED" }, orderBy: { createdAt: "asc" }, select: { type: true, studentId: true } });
    if (!rows.length) return null;
    const first = await c.tx.student.findUnique({ where: { id: rows[0].studentId }, select: { fullName: true } });
    const words = rows[0].type.toLowerCase().replace(/_/g, " ");
    return {
      id: "students.certificate-requests", tone: "info", icon: "Award",
      title: `${plural(rows.length, "certificate request")} waiting`,
      detail: `${first ? `${words} for ${first.fullName}` : words}${rows.length > 1 ? ` and ${rows.length - 1} more` : ""}`,
      action: "Open", href: `${BASE}/certificates?status=REQUESTED`, value: String(rows.length),
    };
  },
};

/** Counselling cases given to the person (or every case for those allowed in Student Settings). */
async function caseWhere(c: DashContext): Promise<Prisma.CounsellingCaseWhereInput | null> {
  const settings = await settingsOf(c);
  if (!settings.counsellingOn) return null;
  const can = await canOf(c);
  return { archivedAt: null, ...(can.seeCounselling ? {} : { counsellorId: c.viewer.ctx.userId ?? "" }) };
}

const openCases: Widget<"band"> = {
  id: "students.open-cases",
  module: "student-management",
  kind: "band",
  homes: ["counsellor"],
  async load(c): Promise<BandItem | null> {
    const where = await caseWhere(c);
    if (!where) return null;
    const [open, recent] = await Promise.all([
      c.tx.counsellingCase.count({ where: { ...where, status: "OPEN" } }),
      c.tx.counsellingCase.count({ where: { ...where, status: "OPEN", openedOn: { gte: addDays(c.today, -6) } } }),
    ]);
    return { id: "students.open-cases", label: "Open cases", big: n(open), foot: recent ? `${n(recent)} new this week · only you see the notes` : "Only you see the notes", href: `${BASE}/behaviour/counselling?status=OPEN` };
  },
};

const sessions: Widget<"agenda"> = {
  id: "students.sessions",
  module: "student-management",
  kind: "agenda",
  homes: ["counsellor"],
  async load(c) {
    const where = await caseWhere(c);
    if (!where) return [];
    const rows = await c.tx.counsellingCase.findMany({ where: { ...where, status: "OPEN", nextSessionOn: { gte: c.today, lte: addDays(c.today, 6) } }, orderBy: { nextSessionOn: "asc" }, take: 6 });
    const names = new Map((await c.tx.student.findMany({ where: { id: { in: rows.map((r) => r.studentId) } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
    return rows.map((r) => ({
      id: `case:${r.id}`, time: dayWord(r.nextSessionOn!, c.today), title: `Session · ${names.get(r.studentId) ?? "a student"}`,
      where: r.reason.length > 60 ? `${r.reason.slice(0, 57)}…` : r.reason, tone: "brand" as const, href: `${BASE}/behaviour/counselling/${r.id}`,
      sort: Math.round((r.nextSessionOn!.getTime() - c.today.getTime()) / 60_000) + 2,
    }));
  },
};

export const STUDENT_WIDGETS: Widget[] = [studentsBand, parentsBand, myClassBand, openCases, consentAttention, certificateRequests, openIncidents, classesOverview, myClass, birthdays, sessions] as Widget[];
