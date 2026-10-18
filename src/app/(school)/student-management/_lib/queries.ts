// Reads shared by the Student Management pages: sections to choose from,
// class tiles, and the Student List with its filters (also used by Export).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";
import type { ListParams } from "@/lib/list";
import { studentScope, type Who } from "@/lib/students/access";
import { STUDENT_STATUSES, STUDYING, type StudentStatusKey } from "@/lib/students/labels";
import { fileLink } from "@/lib/files";
import { ownSectionIds } from "@/lib/people";
import type { ResolvedSettings } from "@/lib/students/settings";
import { studentsWithDues } from "@/lib/students/hooks";
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

export const LIST_FILTERS = ["class", "section", "status", "gender", "category", "new", "photo", "docs", "ids", "fee"] as const;

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
    // Fee Management says which students owe fees; without it the filter is not offered.
    const kind = f.fee;
    const owing = await Promise.all(years.map((y) => studentsWithDues(tx, who.ctx, y, kind)));
    if (owing.every((o) => o !== null)) and.push({ id: { in: owing.flatMap((o) => o ?? []) } });
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
    where: { academicYearId: { in: years }, archivedAt: null, status: "STUDYING", student: { AND: [scope, { archivedAt: null, status: { in: [...STUDYING] } }] } },
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
