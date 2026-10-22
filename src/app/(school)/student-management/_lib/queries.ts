// Reads shared by the Student Management pages: sections to choose from,
// class tiles, and the Student List with its filters (also used by Export).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { orderByFor, type ListParams } from "@/lib/list";
import { studentScope, type Who } from "@/lib/students/access";
import { STUDENT_STATUSES, STUDYING, type StudentStatusKey } from "@/lib/students/labels";
import { fileLink } from "@/lib/files";
import { ownSectionIds } from "@/lib/people";
import type { ResolvedSettings } from "@/lib/students/settings";
import { listFactsByYear, studentsWithDues, type ResultKind } from "@/lib/students/hooks";
import { classShort } from "@/lib/students/show";
import { studentIdsMatching } from "@/lib/students/find";
import { inCampus, sectionInCampus } from "@/lib/campus";

export type SectionOption = { value: string; label: string; classId: string; className: string; sectionName: string; seats: number; filled: number; yearId: string };

/** One year, or the current year of each campus (a school's campuses can start the year on different dates). */
export type YearIds = string | string[] | null | undefined;
export const yearList = (y: YearIds): string[] => (Array.isArray(y) ? y : y ? [y] : []);

/** "North Campus · " before a class when the list has more than one campus; nothing in a one-campus list. */
export async function campusPrefixes(tx: Tx, campusIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(campusIds)];
  if (ids.length < 2) return new Map();
  const rows = await tx.campus.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(rows.map((c) => [c.id, `${c.name} · `]));
}

/**
 * Sections of the year (or of each campus's current year) in class order,
 * with seats filled. Own reach: only their sections. A person limited to one
 * campus gets only that campus's sections.
 */
export async function sectionOptions(tx: Tx, who: Who, yearId: YearIds, opts: { own?: boolean } = {}): Promise<SectionOption[]> {
  const years = yearList(yearId);
  if (!years.length) return [];
  const only = opts.own ? (await Promise.all(years.map((y) => ownSectionIds(tx, who.ctx, y)))).flat() : null;
  const sections = await tx.section.findMany({
    where: { academicYearId: { in: years }, archivedAt: null, ...(only ? { id: { in: only } } : {}), ...sectionInCampus(who) },
    include: { schoolClass: true },
  });
  const counts = await tx.enrolment.groupBy({ by: ["sectionId"], where: { academicYearId: { in: years }, archivedAt: null, status: "STUDYING" }, _count: true });
  const filled = new Map(counts.map((c) => [c.sectionId, c._count]));
  const live = sections.filter((s) => !s.schoolClass.archivedAt);
  const prefix = await campusPrefixes(tx, live.map((s) => s.schoolClass.campusId));
  const campusOrder = (campusId: string) => prefix.get(campusId) ?? "";
  return live
    .sort((a, b) => campusOrder(a.schoolClass.campusId).localeCompare(campusOrder(b.schoolClass.campusId)) || a.schoolClass.sortOrder - b.schoolClass.sortOrder || a.name.localeCompare(b.name))
    .map((s) => ({ value: s.id, label: `${campusOrder(s.schoolClass.campusId)}${s.schoolClass.name} ${s.name}`, classId: s.classId, className: s.schoolClass.name, sectionName: s.name, seats: s.seats, filled: filled.get(s.id) ?? 0, yearId: s.academicYearId }));
}

/** Classes of the school in order (of their own campus, for a person limited to one campus). */
export async function classOptions(tx: Tx, who?: Who) {
  const classes = await tx.schoolClass.findMany({ where: { archivedAt: null, ...inCampus(who) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const prefix = await campusPrefixes(tx, classes.map((c) => c.campusId));
  return classes.map((c) => ({ value: c.id, label: `${prefix.get(c.campusId) ?? ""}${c.name}` }));
}

// "campus": a campus chosen on the Dashboard (the page narrows the person to it); kept here so the list's links keep it.
export const LIST_FILTERS = ["class", "section", "status", "gender", "category", "new", "photo", "docs", "ids", "fee", "campus"] as const;

/** Builds the Student List's where-clause from the filters in the page address. */
export async function studentListWhere(tx: Tx, who: Who, params: ListParams, yearId: YearIds, yearStart: Date | null, settings: ResolvedSettings): Promise<Prisma.StudentWhereInput> {
  const f = params.filters;
  const years = yearList(yearId);
  const and: Prisma.StudentWhereInput[] = [await studentScope(tx, who, years)];
  and.push({ archivedAt: params.archived ? { not: null } : null });
  const status = f.status ?? "studying";
  if (status === "studying") and.push({ status: { in: [...STUDYING] } });
  else if ((STUDENT_STATUSES as readonly string[]).includes(status)) and.push({ status: status as StudentStatusKey });
  // "all" adds nothing.
  const enrol: Prisma.EnrolmentWhereInput = { archivedAt: null, ...(years.length ? { academicYearId: { in: years } } : {}) };
  if (f.section && /^[0-9a-f-]{36}$/i.test(f.section)) and.push({ enrolments: { some: { ...enrol, sectionId: f.section } } });
  else if (f.class && /^[0-9a-f-]{36}$/i.test(f.class)) and.push({ enrolments: { some: { ...enrol, classId: f.class } } });
  if (f.gender) and.push({ gender: f.gender });
  if (f.category) and.push({ category: f.category });
  if (f.new === "1" && yearStart) and.push({ joiningDate: { gte: yearStart } });
  if (f.photo === "missing") and.push({ photoFileId: null });
  if (f.docs === "missing" && settings.requiredDocuments.length) {
    const complete = await tx.$queryRaw<{ student_id: string }[]>`
      SELECT student_id FROM student_document
      WHERE archived_at IS NULL AND guardian_id IS NULL AND kind = ANY(${settings.requiredDocuments})
      GROUP BY student_id HAVING count(DISTINCT kind) >= ${settings.requiredDocuments.length}`;
    and.push({ id: { notIn: complete.map((c) => c.student_id) } });
  }
  if ((f.fee === "dues" || f.fee === "overdue") && years.length) {
    // Fee Management says which students owe fees, within what this person may see (each campus's current year); people who may not see fees get no fee filter.
    const kind = f.fee;
    const owing = await Promise.all(years.map((y) => studentsWithDues(tx, who, y, kind)));
    if (owing.every((o) => o !== null)) and.push({ id: { in: [...new Set(owing.flatMap((o) => o ?? []))] } });
  }
  if (f.ids) {
    const ids = f.ids.split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    and.push({ id: { in: ids } });
  }
  if (params.q) {
    // The one student search: name in any order or with one letter wrong,
    // admission or roll number, parent name or phone. The filters above still apply.
    const ids = await studentIdsMatching(tx, params.q, { scope: and[0], yearId: years, statuses: "any", archived: "include" });
    and.push({ id: { in: ids } });
  }
  return { AND: and };
}

/** What the list shows for each student: their class in the year given (each campus's current year). */
export function studentListInclude(yearId: YearIds) {
  const years = yearList(yearId);
  return {
    enrolments: { where: { archivedAt: null, ...(years.length ? { academicYearId: { in: years } } : {}) }, take: 1 },
    guardians: { where: { archivedAt: null }, include: { guardian: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
  } satisfies Prisma.StudentInclude;
}

export type ListStudent = Prisma.StudentGetPayload<{ include: ReturnType<typeof studentListInclude> }>;

/** Class and section names for a set of enrolments. */
export async function sectionNames(tx: Tx, sectionIds: string[]) {
  const sections = await tx.section.findMany({ where: { id: { in: [...new Set(sectionIds)] } }, include: { schoolClass: true } });
  return new Map(sections.map((s) => [s.id, { label: `${s.schoolClass.name} ${s.name}`, className: s.schoolClass.name, sectionName: s.name, classId: s.classId }]));
}

/** The parent shown on the list: father first, else the primary contact, else any. */
export function mainGuardian(s: Pick<ListStudent, "guardians">) {
  const links = s.guardians.filter((g) => !g.guardian.archivedAt);
  return links.find((g) => g.relationship === "Father") ?? links.find((g) => g.isPrimary) ?? links[0] ?? null;
}

/** The phone messages go to: the primary contact's. */
export function primaryPhone(s: Pick<ListStudent, "guardians">) {
  const links = s.guardians.filter((g) => !g.guardian.archivedAt && !g.restriction);
  return (links.find((g) => g.isPrimary) ?? links[0])?.guardian.phone ?? null;
}

export const photoSrc = (fileId: string | null, schoolId: string) => (fileId ? fileLink(fileId, schoolId) : null);

/** Class tiles: students studying in each class and section this year, within the person's reach. */
export async function classTiles(tx: Tx, who: Who, yearId: YearIds) {
  const years = yearList(yearId);
  if (!years.length) return [];
  const scope = await studentScope(tx, who, years);
  const rows = await tx.enrolment.groupBy({
    by: ["classId", "sectionId"],
    // The Student List's class and section filter (studentListWhere): a studying student's enrolment in the class this year,
    // whatever the enrolment's own status, so a tile and the list it opens count the same students.
    where: { academicYearId: { in: years }, archivedAt: null, student: { AND: [scope, { archivedAt: null, status: { in: [...STUDYING] } }] } },
    _count: true,
  });
  const sections = await sectionNames(tx, rows.map((r) => r.sectionId));
  const classes = await tx.schoolClass.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.classId))] } } });
  // Two campuses: each campus's classes together, named with the campus.
  const prefix = await campusPrefixes(tx, classes.map((c) => c.campusId));
  const campusOrder = (campusId: string) => prefix.get(campusId) ?? "";
  return classes
    .sort((a, b) => campusOrder(a.campusId).localeCompare(campusOrder(b.campusId)) || a.sortOrder - b.sortOrder)
    .map((c) => {
      const secs = rows.filter((r) => r.classId === c.id).map((r) => ({ id: r.sectionId, name: sections.get(r.sectionId)?.sectionName ?? "", count: r._count })).sort((a, b) => a.name.localeCompare(b.name));
      return { id: c.id, name: `${campusOrder(c.campusId)}${c.name}`, total: secs.reduce((n, s) => n + s.count, 0), sections: secs };
    });
}

/**
 * The year of each student's own campus, from the current years given: for
 * facts such as attendance and fees "this year", worked out per year.
 */
export function studentsByYear(students: { id: string; campusId: string }[], years: { id: string; campusId: string }[]) {
  const ofCampus = new Map(years.map((y) => [y.campusId, y.id]));
  const out = new Map<string, string[]>();
  for (const s of students) {
    const y = ofCampus.get(s.campusId);
    if (y) out.set(y, [...(out.get(y) ?? []), s.id]);
  }
  return out;
}

export type ListRow = ListStudent & {
  sectionLabel: string;
  photo: string | null;
  /** This year's attendance %, for people who may see attendance. */
  att: number | null;
  /** Fees fallen due and not paid (Fees by class's rule); null when nothing has fallen due or the person may not see fees. */
  due: bigint | null;
  overdue: boolean;
  /** The year's published final result, for people who see that class's results. */
  result: ResultKind | null;
  resultText: string | null;
};

/**
 * The Student List (03 §2): the students matching the filters, in class,
 * section and roll order (or by the chosen column), up to `shown`, with the
 * attendance, result and fee facts this person may see. Fast for a school of
 * 2,000: the facts are read once for the students shown, never one by one.
 * `yearId`: each campus's current year (`years`, else looked up), as a school's campuses can
 * start the year on different dates; each student's facts are of their own
 * campus's year.
 */
export async function loadStudentList(tx: Tx, who: Who, o: { params: ListParams; yearId: YearIds; years?: { id: string; campusId: string }[]; yearStart: Date | null; settings: ResolvedSettings; shown: number; seeParents: boolean }) {
  const { params, yearId, shown } = o;
  const years = yearList(yearId);
  const where = await studentListWhere(tx, who, params, yearId, o.yearStart, o.settings);
  const orderBy = orderByFor(params, { name: { fullName: params.dir }, admissionNo: { admissionNo: params.dir }, dateOfBirth: { dateOfBirth: params.dir } }, [{ fullName: "asc" }]);
  const [total, tiles] = await Promise.all([tx.student.count({ where }), classTiles(tx, who, yearId)]);
  let students: ListStudent[];
  if (params.sort) {
    students = await tx.student.findMany({ where, include: studentListInclude(yearId), orderBy: orderBy as object, take: shown });
  } else {
    // Class, section and roll order, as on the class register (design: students.jsx).
    const keys = await tx.student.findMany({ where, select: { id: true, fullName: true, enrolments: { where: { archivedAt: null, ...(years.length ? { academicYearId: { in: years } } : {}) }, take: 1, select: { classId: true, sectionId: true, rollNo: true } } } });
    const classOrder = new Map(tiles.map((t, i) => [t.id, i]));
    const secNames = await sectionNames(tx, keys.flatMap((k) => k.enrolments.map((e) => e.sectionId)));
    const rank = (k: (typeof keys)[number]) => {
      const e = k.enrolments[0];
      return [e ? classOrder.get(e.classId) ?? 999 : 1000, e ? secNames.get(e.sectionId)?.sectionName ?? "" : "", e?.rollNo ?? 99999] as const;
    };
    keys.sort((a, b) => {
      const x = rank(a), y = rank(b);
      return x[0] - y[0] || x[1].localeCompare(y[1]) || x[2] - y[2] || a.fullName.localeCompare(b.fullName);
    });
    const ids = keys.slice(0, shown).map((k) => k.id);
    const found = await tx.student.findMany({ where: { id: { in: ids } }, include: studentListInclude(yearId) });
    const byId = new Map(found.map((x) => [x.id, x]));
    students = ids.map((id) => byId.get(id)!).filter(Boolean);
  }
  const names = await sectionNames(tx, students.flatMap((s) => s.enrolments.map((e) => e.sectionId)));
  const yearRows = o.years ?? (years.length ? await tx.academicYear.findMany({ where: { id: { in: years } }, select: { id: true, campusId: true } }) : []);
  const facts = await listFactsByYear(tx, who, studentsByYear(students, yearRows));
  const rows: ListRow[] = students.map((s) => {
    const f = facts.facts.get(s.id);
    const e = s.enrolments[0];
    return {
      ...s, guardians: o.seeParents ? s.guardians : [],
      sectionLabel: e ? classShort(names.get(e.sectionId)?.className ?? "", names.get(e.sectionId)?.sectionName) : "",
      photo: photoSrc(s.photoFileId, who.ctx.schoolId),
      att: f?.attendancePct ?? null, due: f?.feeDuePaise ?? null, overdue: Boolean(f?.feeOverdue),
      result: f?.result ?? null, resultText: f?.resultText ?? null,
    };
  });
  return { total, rows, tiles, shows: facts.shows };
}
