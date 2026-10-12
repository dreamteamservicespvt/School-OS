// Seats left (02 §5 "Applying to a full class"): seats per section come from
// Classes & Sections; taken seats are the section's studying Enrolments, and
// approved applications not yet admitted hold a seat in their class.
import "server-only";

import type { Tx } from "../db";

export type SectionSeats = { id: string; name: string; seats: number; enrolled: number; free: number };
export type ClassSeats = { classId: string; className: string; sections: SectionSeats[]; seats: number; enrolled: number; held: number; free: number };

export async function seatsFor(tx: Tx, yearId: string, classIds?: string[]): Promise<Map<string, ClassSeats>> {
  const sections = await tx.section.findMany({
    where: { academicYearId: yearId, archivedAt: null, ...(classIds ? { classId: { in: classIds } } : {}) },
    include: { schoolClass: { select: { id: true, name: true, sortOrder: true } } },
    orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }],
  });
  const counts = await tx.enrolment.groupBy({
    by: ["sectionId"],
    where: { academicYearId: yearId, archivedAt: null, status: "STUDYING", student: { archivedAt: null }, sectionId: { in: sections.map((s) => s.id) } },
    _count: { _all: true },
  });
  const held = await tx.application.groupBy({
    by: ["classId"],
    where: { academicYearId: yearId, archivedAt: null, stage: "APPROVED", studentId: null, ...(classIds ? { classId: { in: classIds } } : {}) },
    _count: { _all: true },
  });
  const out = new Map<string, ClassSeats>();
  for (const s of sections) {
    const enrolled = counts.find((c) => c.sectionId === s.id)?._count._all ?? 0;
    const row = out.get(s.classId) ?? { classId: s.classId, className: s.schoolClass.name, sections: [], seats: 0, enrolled: 0, held: 0, free: 0 };
    row.sections.push({ id: s.id, name: s.name, seats: s.seats, enrolled, free: Math.max(0, s.seats - enrolled) });
    row.seats += s.seats;
    row.enrolled += enrolled;
    out.set(s.classId, row);
  }
  for (const row of out.values()) {
    row.held = held.find((h) => h.classId === row.classId)?._count._all ?? 0;
    row.free = Math.max(0, row.seats - row.enrolled - row.held);
  }
  return out;
}

/** "Class 1 A and B are full (40 of 40)." */
export function fullWords(c: ClassSeats) {
  const names = c.sections.map((s) => s.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "";
  return `${c.className}${list ? ` ${list}` : ""} ${names.length > 1 ? "are" : "is"} full (${c.enrolled + c.held} of ${c.seats}${c.held ? `, ${c.held} held for approved applications` : ""}).`;
}

/** The section with most free seats (inferred rule). */
export function bestSection(c: ClassSeats): SectionSeats | null {
  return [...c.sections].sort((a, b) => b.free - a.free || a.name.localeCompare(b.name))[0] ?? null;
}
