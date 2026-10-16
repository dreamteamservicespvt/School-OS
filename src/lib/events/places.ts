// Where students sit this year: class, section and roll number, as one label
// ("Class 5 A"). Used by event registrations, PTM slots and the gallery.
import "server-only";

import type { Tx } from "../db";
import { sectionLabel } from "../people";

export type Place = { classId: string; sectionId: string; className: string; sectionName: string; label: string; classSort: number; rollNo: number | null };

export async function placesOf(tx: Tx, studentIds: string[], academicYearId: string): Promise<Map<string, Place>> {
  const out = new Map<string, Place>();
  if (!studentIds.length) return out;
  const enrol = await tx.enrolment.findMany({ where: { studentId: { in: studentIds }, academicYearId, archivedAt: null }, select: { studentId: true, classId: true, sectionId: true, rollNo: true } });
  const sections = await tx.section.findMany({ where: { id: { in: [...new Set(enrol.map((e) => e.sectionId))] } }, select: { id: true, name: true, schoolClass: { select: { name: true, sortOrder: true } } } });
  const byId = new Map(sections.map((s) => [s.id, s]));
  for (const e of enrol) {
    const s = byId.get(e.sectionId);
    if (!s) continue;
    out.set(e.studentId, { classId: e.classId, sectionId: e.sectionId, className: s.schoolClass.name, sectionName: s.name, label: sectionLabel(s.schoolClass.name, s.name), classSort: s.schoolClass.sortOrder, rollNo: e.rollNo });
  }
  return out;
}

/** Class order, then section, then roll number. */
export function placeOrder(a: Place | undefined, b: Place | undefined) {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  return a.classSort - b.classSort || a.sectionName.localeCompare(b.sectionName) || (a.rollNo ?? 999) - (b.rollNo ?? 999);
}
