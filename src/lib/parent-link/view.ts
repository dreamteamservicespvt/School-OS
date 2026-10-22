// Builds what one guardian may see on their Parent Link: only their own
// children studying in the school (rule 31), never a child the guardian has a
// custody or access restriction for (03 §2; ../students/guardian-access.ts).
// The child chosen on the page (?child=) is checked against that list on the
// server.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { currentYears } from "../academic/years";
import { childrenOfGuardian } from "../students/guardian-access";
import type { GuardianView, ParentLinkChild } from "./sections";

/**
 * "Joining Class 3 A in 2027-28" for each child with no class this year whose
 * only class is in a later year (a newly admitted child, PL-01). The child has
 * no attendance, results or class notices of this year yet, so its class and
 * section stay unset for the page's sections; only the words change.
 */
export async function joiningLabels(tx: Tx, ctx: SchoolContext, studentIds: string[], current: { id: string; campusId: string; startDate: Date }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!studentIds.length) return out;
  const later = await tx.academicYear.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, id: { notIn: current.map((y) => y.id) }, status: { not: "CLOSED" } },
    select: { id: true, name: true, campusId: true, startDate: true },
  });
  // A year is "later" when it starts after its campus's current year (or the campus has none yet).
  const ahead = later.filter((y) => { const c = current.find((x) => x.campusId === y.campusId); return !c || y.startDate > c.startDate; });
  if (!ahead.length) return out;
  const rows = await tx.enrolment.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, studentId: { in: studentIds }, academicYearId: { in: ahead.map((y) => y.id) } } });
  const [classes, sections] = await Promise.all([
    tx.schoolClass.findMany({ where: { schoolId: ctx.schoolId, id: { in: rows.map((e) => e.classId) } }, select: { id: true, name: true } }),
    tx.section.findMany({ where: { schoolId: ctx.schoolId, id: { in: rows.map((e) => e.sectionId) } }, select: { id: true, name: true } }),
  ]);
  const start = (yearId: string) => ahead.find((y) => y.id === yearId)!.startDate.getTime();
  for (const e of [...rows].sort((a, b) => start(a.academicYearId) - start(b.academicYearId))) {
    if (out.has(e.studentId)) continue;
    const label = `${classes.find((c) => c.id === e.classId)?.name ?? ""} ${sections.find((x) => x.id === e.sectionId)?.name ?? ""}`.trim();
    const year = ahead.find((y) => y.id === e.academicYearId)!.name;
    out.set(e.studentId, label ? `Joining ${label} in ${year}` : `Joining in ${year}`);
  }
  return out;
}

export async function guardianChildren(tx: Tx, ctx: SchoolContext, guardianId: string): Promise<{ children: ParentLinkChild[]; academicYearId: string | null; yearOfCampus: Map<string, string> }> {
  const ids = await childrenOfGuardian(tx, ctx, guardianId, { studying: true });
  const students = ids.length ? await tx.student.findMany({ where: { schoolId: ctx.schoolId, id: { in: ids } } }) : [];
  // Each child's class in the current year of the child's own campus (a school can have several campuses).
  const years = await currentYears(tx, ctx);
  const enrolments = years.length && ids.length
    ? await tx.enrolment.findMany({ where: { schoolId: ctx.schoolId, academicYearId: { in: years.map((y) => y.id) }, archivedAt: null, studentId: { in: ids } } })
    : [];
  const [classes, sections] = await Promise.all([
    tx.schoolClass.findMany({ where: { schoolId: ctx.schoolId, id: { in: enrolments.map((e) => e.classId) } }, select: { id: true, name: true, campusId: true } }),
    tx.section.findMany({ where: { schoolId: ctx.schoolId, id: { in: enrolments.map((e) => e.sectionId) } }, select: { id: true, name: true } }),
  ]);
  const joining = await joiningLabels(tx, ctx, students.filter((s) => !enrolments.some((e) => e.studentId === s.id)).map((s) => s.id), years);
  const children = students
    .map((s) => {
      const mine = enrolments.filter((x) => x.studentId === s.id);
      const e = mine.find((x) => classes.find((c) => c.id === x.classId)?.campusId === s.campusId) ?? mine[0];
      const cls = e ? classes.find((c) => c.id === e.classId) : undefined;
      return {
        id: s.id,
        name: s.fullName,
        firstName: s.firstName,
        classLabel: e ? `${cls?.name ?? ""} ${sections.find((x) => x.id === e.sectionId)?.name ?? ""}`.trim() : joining.get(s.id) ?? "",
        sectionId: e?.sectionId ?? null,
        classId: e?.classId ?? null,
        campusId: cls?.campusId ?? s.campusId,
        admissionNo: s.admissionNo,
        photoFileId: s.photoFileId,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  // The school's main current year, as currentYear() picks it: the newest active one.
  const main = [...years].sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") || b.startDate.getTime() - a.startDate.getTime())[0];
  return { children, academicYearId: main?.id ?? null, yearOfCampus: new Map(years.map((y) => [y.campusId, y.id])) };
}

export async function loadGuardianView(tx: Tx, ctx: SchoolContext, input: { linkId: string; guardianId: string; childId?: string | null; token: string; preview: boolean }): Promise<GuardianView | null> {
  const [school, guardian] = await Promise.all([
    tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true, timeZone: true } }),
    tx.guardian.findFirstOrThrow({ where: { id: input.guardianId, schoolId: ctx.schoolId }, select: { name: true, language: true } }),
  ]);
  const { children, academicYearId, yearOfCampus } = await guardianChildren(tx, ctx, input.guardianId);
  if (!children.length) return null;
  // A child id from the address that is not this guardian's own is ignored.
  const child = children.find((c) => c.id === input.childId) ?? children[0];
  return {
    schoolId: ctx.schoolId,
    schoolName: school.name,
    timeZone: school.timeZone,
    linkId: input.linkId,
    guardianId: input.guardianId,
    guardianName: guardian.name,
    language: guardian.language,
    children,
    child,
    token: input.token,
    preview: input.preview,
    academicYearId: (child.campusId && yearOfCampus.get(child.campusId)) || academicYearId,
  };
}
