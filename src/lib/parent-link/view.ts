// Builds what one guardian may see on their Parent Link: only their own
// children studying in the school (rule 31). The child chosen on the page
// (?child=) is checked against that list on the server.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { currentYear } from "../academic/years";
import type { GuardianView, ParentLinkChild } from "./sections";

export async function guardianChildren(tx: Tx, ctx: SchoolContext, guardianId: string): Promise<{ children: ParentLinkChild[]; academicYearId: string | null }> {
  const links = await tx.studentGuardian.findMany({
    where: { schoolId: ctx.schoolId, guardianId, archivedAt: null, student: { archivedAt: null, status: { in: ["ACTIVE", "ADMITTED"] } } },
    include: { student: true },
  });
  const year = await currentYear(tx, ctx);
  const enrolments = year
    ? await tx.enrolment.findMany({ where: { schoolId: ctx.schoolId, academicYearId: year.id, archivedAt: null, studentId: { in: links.map((l) => l.studentId) } } })
    : [];
  const [classes, sections] = await Promise.all([
    tx.schoolClass.findMany({ where: { schoolId: ctx.schoolId, id: { in: enrolments.map((e) => e.classId) } }, select: { id: true, name: true } }),
    tx.section.findMany({ where: { schoolId: ctx.schoolId, id: { in: enrolments.map((e) => e.sectionId) } }, select: { id: true, name: true } }),
  ]);
  const children = links
    .map((l) => {
      const e = enrolments.find((x) => x.studentId === l.studentId);
      return {
        id: l.student.id,
        name: l.student.fullName,
        firstName: l.student.firstName,
        classLabel: e ? `${classes.find((c) => c.id === e.classId)?.name ?? ""} ${sections.find((x) => x.id === e.sectionId)?.name ?? ""}`.trim() : "",
        sectionId: e?.sectionId ?? null,
        classId: e?.classId ?? null,
        admissionNo: l.student.admissionNo,
        photoFileId: l.student.photoFileId,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { children, academicYearId: year?.id ?? null };
}

export async function loadGuardianView(tx: Tx, ctx: SchoolContext, input: { linkId: string; guardianId: string; childId?: string | null; token: string; preview: boolean }): Promise<GuardianView | null> {
  const [school, guardian] = await Promise.all([
    tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true, timeZone: true } }),
    tx.guardian.findFirstOrThrow({ where: { id: input.guardianId, schoolId: ctx.schoolId }, select: { name: true, language: true } }),
  ]);
  const { children, academicYearId } = await guardianChildren(tx, ctx, input.guardianId);
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
    academicYearId,
  };
}
