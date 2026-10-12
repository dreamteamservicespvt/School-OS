// Seating arrangement (08 §2, optional for larger schools): seat numbers per
// room by roll number for one sitting (a date and start time), mixing
// classes when chosen so neighbours sit different papers, and seating charts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { esc } from "../pdf";
import { time12, plural } from "../academic/common";
import { ExamRuleError } from "./common";
import { sectionStudents, sitters } from "./roster";

export type Sitting = { key: string; date: Date; startTime: string; label: string; classes: string[]; papers: number };

/** The sittings of an exam: each date and start time with the classes writing then. */
export async function sittings(tx: Tx, examId: string): Promise<Sitting[]> {
  const entries = await tx.datesheetEntry.findMany({ where: { examId, archivedAt: null }, orderBy: [{ date: "asc" }, { startTime: "asc" }] });
  const classes = await tx.schoolClass.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.classId))] } }, select: { id: true, name: true, sortOrder: true } });
  const map = new Map<string, Sitting>();
  for (const e of entries) {
    const key = `${e.date.toISOString().slice(0, 10)}T${e.startTime}`;
    const s = map.get(key) ?? { key, date: e.date, startTime: e.startTime, label: `${formatDate(e.date)}, ${time12(e.startTime)}`, classes: [], papers: 0 };
    const name = classes.find((c) => c.id === e.classId)?.name ?? "";
    if (!s.classes.includes(name)) s.classes.push(name);
    s.papers++;
    map.set(key, s);
  }
  return [...map.values()];
}

export function parseSitting(key: string): { date: Date; startTime: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(key);
  return m ? { date: new Date(`${m[1]}T00:00:00Z`), startTime: m[2] } : null;
}

export type RoomSeats = { name: string; capacity: number };

/** Who writes at a sitting, in class, section and roll order. */
async function candidates(tx: Tx, examId: string, date: Date, startTime: string) {
  const exam = await tx.exam.findFirstOrThrow({ where: { id: examId } });
  const entries = await tx.datesheetEntry.findMany({ where: { examId, archivedAt: null, date, startTime } });
  const sections = await tx.section.findMany({ where: { classId: { in: entries.map((e) => e.classId) }, academicYearId: exam.academicYearId, archivedAt: null }, include: { schoolClass: true }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }] });
  const subjects = await tx.subject.findMany({ where: { id: { in: entries.map((e) => e.subjectId) } } });
  const roster = await sectionStudents(tx, sections.map((s) => s.id), exam.academicYearId);
  const out: { studentId: string; name: string; rollNo: number | null; sectionId: string; label: string; classOrder: number; classId: string }[] = [];
  for (const sec of sections) {
    const inSection = roster.filter((r) => r.sectionId === sec.id);
    const seen = new Set<string>();
    for (const e of entries.filter((x) => x.classId === sec.classId)) {
      const subject = subjects.find((s) => s.id === e.subjectId);
      for (const s of subject ? sitters(inSection, subject) : inSection) {
        if (seen.has(s.studentId)) continue;
        seen.add(s.studentId);
        out.push({ studentId: s.studentId, name: s.name, rollNo: s.rollNo, sectionId: sec.id, label: `${sec.schoolClass.name} ${sec.name}`, classOrder: sec.schoolClass.sortOrder, classId: sec.classId });
      }
    }
  }
  return { exam, list: out };
}

/** Makes the seat plan for one sitting, replacing any earlier plan for it. */
export async function generateSeating(tx: Tx, ctx: SchoolContext, examId: string, input: { sitting: string; rooms: RoomSeats[]; mix: boolean }) {
  const s = parseSitting(input.sitting);
  if (!s) throw new ExamRuleError("Choose the sitting (date and time).", "sitting");
  const rooms = input.rooms.map((r) => ({ name: r.name.trim(), capacity: r.capacity })).filter((r) => r.name);
  if (rooms.length === 0) throw new ExamRuleError("Add at least one room with its seats, such as Room 12 and 40.", "rooms");
  const names = new Set<string>();
  for (const r of rooms) {
    if (names.has(r.name.toLowerCase())) throw new ExamRuleError(`${r.name} is listed twice.`, "rooms");
    names.add(r.name.toLowerCase());
    if (!Number.isInteger(r.capacity) || r.capacity < 1 || r.capacity > 500) throw new ExamRuleError(`${r.name}: seats must be a whole number from 1 to 500.`, "rooms");
  }
  const { exam, list } = await candidates(tx, examId, s.date, s.startTime);
  if (exam.status === "DRAFT") throw new ExamRuleError("Publish the datesheet first.");
  if (list.length === 0) throw new ExamRuleError("Nobody writes a paper at this sitting.", "sitting");
  const seats = rooms.reduce((n, r) => n + r.capacity, 0);
  if (seats < list.length) throw new ExamRuleError(`The rooms seat ${seats} but ${list.length} students write at ${time12(s.startTime)} on ${formatDate(s.date)}. Add a room or more seats.`, "rooms");

  list.sort((a, b) => a.classOrder - b.classOrder || a.label.localeCompare(b.label) || (a.rollNo ?? 9999) - (b.rollNo ?? 9999));
  let ordered = list;
  if (input.mix) {
    // Take one student from each class in turn, so neighbours write different papers.
    const byClass = new Map<string, typeof list>();
    for (const x of list) byClass.set(x.classId, [...(byClass.get(x.classId) ?? []), x]);
    const queues = [...byClass.values()];
    ordered = [];
    while (queues.some((q) => q.length)) for (const q of queues) { const x = q.shift(); if (x) ordered.push(x); }
  }
  await tx.seatAllocation.updateMany({ where: { examId, date: s.date, startTime: s.startTime, archivedAt: null }, data: { archivedAt: new Date() } });
  let i = 0;
  const used: { room: string; students: number }[] = [];
  for (const room of rooms) {
    const take = ordered.slice(i, i + room.capacity);
    if (take.length === 0) break;
    await tx.seatAllocation.createMany({ data: take.map((x, k) => ({ schoolId: ctx.schoolId, examId, date: s.date, startTime: s.startTime, room: room.name, seatNo: k + 1, studentId: x.studentId, sectionId: x.sectionId })) });
    used.push({ room: room.name, students: take.length });
    i += take.length;
  }
  await writeAudit(tx, ctx, { action: "seating-made", recordType: "Exam", recordId: examId, after: { sitting: input.sitting, mix: input.mix, rooms: used } });
  return { students: list.length, rooms: used };
}

/** The seat plan of a sitting, room by room. */
export async function seatingPlan(tx: Tx, examId: string, sitting: string) {
  const s = parseSitting(sitting);
  if (!s) return [];
  const rows = await tx.seatAllocation.findMany({ where: { examId, date: s.date, startTime: s.startTime, archivedAt: null }, orderBy: [{ room: "asc" }, { seatNo: "asc" }] });
  if (rows.length === 0) return [];
  const [students, sections, enrol] = await Promise.all([
    tx.student.findMany({ where: { id: { in: rows.map((r) => r.studentId) } }, select: { id: true, fullName: true, admissionNo: true } }),
    tx.section.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.sectionId))] } }, include: { schoolClass: true } }),
    tx.enrolment.findMany({ where: { studentId: { in: rows.map((r) => r.studentId) }, sectionId: { in: [...new Set(rows.map((r) => r.sectionId))] } }, select: { studentId: true, rollNo: true } }),
  ]);
  const rooms = new Map<string, { seatNo: number; name: string; admissionNo: string; label: string; rollNo: number | null }[]>();
  const order: string[] = [];
  for (const r of rows) {
    if (!rooms.has(r.room)) { rooms.set(r.room, []); order.push(r.room); }
    const sec = sections.find((x) => x.id === r.sectionId);
    const st = students.find((x) => x.id === r.studentId);
    rooms.get(r.room)!.push({ seatNo: r.seatNo, name: st?.fullName ?? "", admissionNo: st?.admissionNo ?? "", label: sec ? `${sec.schoolClass.name} ${sec.name}` : "", rollNo: enrol.find((e) => e.studentId === r.studentId)?.rollNo ?? null });
  }
  // Keep the order rooms were filled in (by first allocation time is not stored; seat 1 rows come in the room order typed).
  return order.map((name) => ({ name, seats: rooms.get(name)!.sort((a, b) => a.seatNo - b.seatNo) }));
}

/** A printable seating chart: one page per room. */
export function seatingHtml(schoolName: string, examTitle: string, sittingLabel: string, plan: Awaited<ReturnType<typeof seatingPlan>>) {
  const pages = plan.map((room) => `<section class="page"><h1>${esc(schoolName)}</h1>
    <h2>${esc(examTitle)}: seating chart</h2><p class="meta">${esc(room.name)} · ${esc(sittingLabel)} · ${esc(plural(room.seats.length, "student"))}</p>
    <table><thead><tr><th>Seat</th><th>Roll no.</th><th>Student</th><th>Class</th><th>Admission no.</th><th>Signature</th></tr></thead>
    <tbody>${room.seats.map((s) => `<tr><td>${s.seatNo}</td><td>${esc(s.rollNo ?? "")}</td><td>${esc(s.name)}</td><td>${esc(s.label)}</td><td>${esc(s.admissionNo)}</td><td></td></tr>`).join("")}</tbody></table></section>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,"Noto Sans",sans-serif;font-size:10.5pt;color:#111}
    .page{page-break-after:always}.page:last-child{page-break-after:auto}
    h1{font-size:15pt;margin:0;text-align:center}h2{font-size:12pt;margin:2mm 0;text-align:center}.meta{text-align:center;color:#333;margin:0 0 4mm}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:2mm 2.5mm;text-align:left}th{background:#eef2ff}td:last-child{width:35mm}
  </style></head><body>${pages}</body></html>`;
}
