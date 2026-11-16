"use server";

// Finding students while filling a form (the one student search), or a whole
// section. Only students the person may see are returned.

import { withSchool } from "@/lib/db";
import { abilities, studentScope } from "@/lib/students/access";
import { findStudents } from "@/lib/students/find";
import { STUDYING } from "@/lib/students/labels";
import { studentAction } from "../_lib/page";
import { dueChipsFor, type DueChip } from "@/lib/fees/due-chips";
import { todayIn } from "@/lib/staff/dates";
import { classSection } from "@/lib/class-name";

/** `due` only for people who may see fees, and only for students in their fee reach (adopt item 8). */
export type PickedStudent = { id: string; name: string; admissionNo: string; cls: string; due?: DueChip };

type Tx = Parameters<Parameters<typeof withSchool>[1]>[0];
type Who = Awaited<ReturnType<typeof studentAction>>["current"];

/** Adds each student's due chip for a person who may see fees; unchanged for everyone else. */
async function withDue(tx: Tx, current: Who, list: PickedStudent[]): Promise<PickedStudent[]> {
  if (!list.length) return list;
  const chips = await dueChipsFor(tx, current.ctx, current, list.map((s) => s.id), todayIn(current.school?.timeZone ?? "Asia/Kolkata"));
  return chips.size ? list.map((s) => (chips.has(s.id) ? { ...s, due: chips.get(s.id) } : s)) : list;
}

async function shape(tx: Parameters<Parameters<typeof withSchool>[1]>[0], yearId: string | null, rows: { id: string; fullName: string; admissionNo: string; enrolments: { sectionId: string }[] }[]): Promise<PickedStudent[]> {
  const ids = [...new Set(rows.flatMap((r) => r.enrolments.map((e) => e.sectionId)))];
  const secs = await tx.section.findMany({ where: { id: { in: ids } }, include: { schoolClass: true } });
  const label = new Map(secs.map((s) => [s.id, `${classSection(s.schoolClass.name, s.name)}`]));
  void yearId;
  return rows.map((r) => ({ id: r.id, name: r.fullName, admissionNo: r.admissionNo, cls: r.enrolments[0] ? label.get(r.enrolments[0].sectionId) ?? "" : "" }));
}

export async function searchStudents(q: string, opts: { anyStatus?: boolean } = {}): Promise<PickedStudent[]> {
  const { current, yearIds } = await studentAction("view");
  const text = q.trim().slice(0, 60);
  if (text.length < 2) return [];
  return withSchool(current.ctx, async (tx) => {
    const scope = await studentScope(tx, current, yearIds);
    const hits = await findStudents(tx, text, { scope, yearId: yearIds, statuses: opts.anyStatus ? "any" : STUDYING, byParent: abilities(current).seeParents, take: 15 });
    return withDue(tx, current, hits.map((h) => ({ id: h.id, name: h.name, admissionNo: h.admissionNo, cls: h.classSection ?? "" })));
  });
}

export async function studentsInSection(sectionId: string): Promise<PickedStudent[]> {
  const { current, yearIds } = await studentAction("view");
  if (!/^[0-9a-f-]{36}$/i.test(sectionId)) return [];
  return withSchool(current.ctx, async (tx) => {
    const scope = await studentScope(tx, current, yearIds);
    const rows = await tx.student.findMany({
      where: { AND: [scope, { archivedAt: null, status: { in: [...STUDYING] } }, { enrolments: { some: { sectionId, archivedAt: null, status: "STUDYING" } } }] },
      include: { enrolments: { where: { sectionId, archivedAt: null }, take: 1 } },
      orderBy: { fullName: "asc" },
      take: 200,
    });
    return withDue(tx, current, await shape(tx, null, rows));
  });
}
