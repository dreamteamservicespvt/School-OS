// Small read helpers shared by the transport pages: students with their
// class, and the guardians of students at a stop.
import "server-only";

import type { Tx } from "../db";
import { STUDYING } from "../students/labels";

export type StudentCard = { id: string; name: string; admissionNo: string; cls: string; classSort: number; photoFileId: string | null; status: string; campusId: string; studying: boolean };

/** Students by id with their latest class and section ("5 A"). */
export async function studentCards(tx: Tx, ids: string[]): Promise<Map<string, StudentCard>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, StudentCard>();
  if (!unique.length) return out;
  const [students, enrolments] = await Promise.all([
    tx.student.findMany({ where: { id: { in: unique } }, select: { id: true, fullName: true, admissionNo: true, photoFileId: true, status: true, campusId: true } }),
    tx.enrolment.findMany({ where: { studentId: { in: unique }, archivedAt: null }, orderBy: { createdAt: "desc" }, select: { studentId: true, sectionId: true } }),
  ]);
  const latest = new Map<string, string>();
  for (const e of enrolments) if (!latest.has(e.studentId)) latest.set(e.studentId, e.sectionId);
  const sections = await tx.section.findMany({ where: { id: { in: [...new Set(latest.values())] } }, include: { schoolClass: { select: { name: true, sortOrder: true } } } });
  for (const s of students) {
    const sec = sections.find((x) => x.id === latest.get(s.id));
    out.set(s.id, {
      id: s.id, name: s.fullName, admissionNo: s.admissionNo, photoFileId: s.photoFileId, status: s.status, campusId: s.campusId,
      cls: sec ? `${sec.schoolClass.name.replace(/^Class\s+/i, "")} ${sec.name}` : "",
      classSort: sec?.schoolClass.sortOrder ?? 999,
      studying: (STUDYING as readonly string[]).includes(s.status),
    });
  }
  return out;
}

/** The ids of students who are studying (not left, not graduated). */
export async function studyingIds(tx: Tx, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await tx.student.findMany({ where: { id: { in: [...new Set(ids)] }, archivedAt: null, status: { in: [...STUDYING] } }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}
