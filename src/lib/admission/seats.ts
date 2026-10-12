// Seats left (02 §5 "Applying to a full class"): seats per section come from
// Classes & Sections; taken seats are the section's studying Enrolments, and
// approved applications not yet admitted hold a seat in their class.
import "server-only";

import type { Tx } from "../db";

export type SectionSeats = { id: string; name: string; seats: number; enrolled: number; free: number };
/** continuing: students of the class below this year who will move up and are not promoted yet (upcoming years only, inferred). */
export type ClassSeats = { classId: string; className: string; sections: SectionSeats[]; seats: number; enrolled: number; held: number; continuing: number; free: number };

/**
 * For an upcoming year whose promotion has not happened yet: per class, the
 * students studying in the class below in the year before, who have no place
 * in the upcoming year yet. They will take seats, so new joiners cannot.
 */
async function continuingFor(tx: Tx, yearId: string): Promise<Map<string, number>> {
  const year = await tx.academicYear.findUnique({ where: { id: yearId }, select: { status: true, startDate: true } });
  const out = new Map<string, number>();
  if (!year || year.status !== "UPCOMING") return out;
  const before = await tx.academicYear.findFirst({ where: { archivedAt: null, startDate: { lt: year.startDate } }, orderBy: { startDate: "desc" }, select: { id: true } });
  if (!before) return out;
  const classes = await tx.schoolClass.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true } });
  const rows = await tx.enrolment.groupBy({
    by: ["classId"],
    where: { academicYearId: before.id, archivedAt: null, status: "STUDYING", student: { archivedAt: null, enrolments: { none: { academicYearId: yearId, archivedAt: null } } } },
    _count: { _all: true },
  });
  classes.forEach((c, i) => {
    const below = classes[i - 1];
    const n = below ? rows.find((r) => r.classId === below.id)?._count._all ?? 0 : 0;
    if (n) out.set(c.id, n);
  });
  return out;
}

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
  const continuing = await continuingFor(tx, yearId);
  const perClass = new Map<string, number>();
  for (const s of sections) perClass.set(s.classId, (perClass.get(s.classId) ?? 0) + 1);
  const seen = new Map<string, number>();
  const out = new Map<string, ClassSeats>();
  for (const s of sections) {
    // Continuing students are shared out evenly between the class's sections.
    const k = seen.get(s.classId) ?? 0;
    seen.set(s.classId, k + 1);
    const total = continuing.get(s.classId) ?? 0;
    const n = perClass.get(s.classId) ?? 1;
    const share = Math.floor(total / n) + (k < total % n ? 1 : 0);
    const enrolled = (counts.find((c) => c.sectionId === s.id)?._count._all ?? 0) + share;
    const row = out.get(s.classId) ?? { classId: s.classId, className: s.schoolClass.name, sections: [], seats: 0, enrolled: 0, held: 0, continuing: total, free: 0 };
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
