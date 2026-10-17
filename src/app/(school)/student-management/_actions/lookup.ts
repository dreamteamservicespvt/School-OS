"use server";

// Finding students while filling a form (the one student search), or a whole
// section. Only students the person may see are returned.

import { withSchool } from "@/lib/db";
import { abilities, studentScope } from "@/lib/students/access";
import { findStudents } from "@/lib/students/find";
import { currentYear } from "@/lib/academic/years";
import { STUDYING } from "@/lib/students/labels";
import { studentAction } from "../_lib/page";

export type PickedStudent = { id: string; name: string; admissionNo: string; cls: string };

async function shape(tx: Parameters<Parameters<typeof withSchool>[1]>[0], yearId: string | null, rows: { id: string; fullName: string; admissionNo: string; enrolments: { sectionId: string }[] }[]): Promise<PickedStudent[]> {
  const ids = [...new Set(rows.flatMap((r) => r.enrolments.map((e) => e.sectionId)))];
  const secs = await tx.section.findMany({ where: { id: { in: ids } }, include: { schoolClass: true } });
  const label = new Map(secs.map((s) => [s.id, `${s.schoolClass.name} ${s.name}`]));
  void yearId;
  return rows.map((r) => ({ id: r.id, name: r.fullName, admissionNo: r.admissionNo, cls: r.enrolments[0] ? label.get(r.enrolments[0].sectionId) ?? "" : "" }));
}

export async function searchStudents(q: string, opts: { anyStatus?: boolean } = {}): Promise<PickedStudent[]> {
  const { current } = await studentAction("view");
  const text = q.trim().slice(0, 60);
  if (text.length < 2) return [];
  return withSchool(current.ctx, async (tx) => {
    const year = await currentYear(tx, current.ctx);
    const scope = await studentScope(tx, current, year?.id);
    const hits = await findStudents(tx, text, { scope, yearId: year?.id ?? null, statuses: opts.anyStatus ? "any" : STUDYING, byParent: abilities(current).seeParents, take: 15 });
    return hits.map((h) => ({ id: h.id, name: h.name, admissionNo: h.admissionNo, cls: h.classSection ?? "" }));
  });
}

export async function studentsInSection(sectionId: string): Promise<PickedStudent[]> {
  const { current } = await studentAction("view");
  if (!/^[0-9a-f-]{36}$/i.test(sectionId)) return [];
  return withSchool(current.ctx, async (tx) => {
    const year = await currentYear(tx, current.ctx);
    const scope = await studentScope(tx, current, year?.id);
    const rows = await tx.student.findMany({
      where: { AND: [scope, { archivedAt: null, status: { in: [...STUDYING] } }, { enrolments: { some: { sectionId, archivedAt: null, status: "STUDYING" } } }] },
      include: { enrolments: { where: { sectionId, archivedAt: null }, take: 1 } },
      orderBy: { fullName: "asc" },
      take: 200,
    });
    return shape(tx, year?.id ?? null, rows);
  });
}
