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
  const children = students
    .map((s) => {
      const mine = enrolments.filter((x) => x.studentId === s.id);
      const e = mine.find((x) => classes.find((c) => c.id === x.classId)?.campusId === s.campusId) ?? mine[0];
      const cls = e ? classes.find((c) => c.id === e.classId) : undefined;
      return {
        id: s.id,
        name: s.fullName,
        firstName: s.firstName,
        classLabel: e ? `${cls?.name ?? ""} ${sections.find((x) => x.id === e.sectionId)?.name ?? ""}`.trim() : "",
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
