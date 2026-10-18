// For the people who look after homework across the school (Principal, School
// Admin, Vice Principal, Academic Head): who gives how much, the load on each
// class each day, and a Remind for a teacher with work waiting to be checked.
// They watch and remind; the teacher does the checking.
import "server-only";

import type { Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { HomeworkProblem } from "./access";
import type { HomeworkRow } from "./homework";
import { listWhere, type HomeworkScope } from "./scope";
import { dayStartUtc } from "../periods";
import { dayDate, plural } from "./words";

/** The start of the school's day as a moment, for "already reminded today". */
const dayStart = (today: Date, tz: string) => dayStartUtc(today.toISOString().slice(0, 10), tz);

export type TeacherLine = { staffId: string; name: string; subjects: string[]; classes: string[]; given: number; assigned: number; handed: number; toCheck: number; remindedAt: Date | null };

/**
 * Homework given in the dates, by teacher; teachers who teach but gave none
 * are listed after (allocations in each campus's current year, only the
 * person's campus's classes when limited to one).
 */
export async function byTeacher(tx: Tx, rows: HomeworkRow[], s: Pick<HomeworkScope, "yearIds" | "campusSections">, today: Date, tz: string) {
  const map = new Map<string, TeacherLine>();
  for (const h of rows) {
    if (!h.teacherId) continue;
    const t = map.get(h.teacherId) ?? { staffId: h.teacherId, name: h.teacher, subjects: [], classes: [], given: 0, assigned: 0, handed: 0, toCheck: 0, remindedAt: null };
    if (!t.subjects.includes(h.subject)) t.subjects.push(h.subject);
    if (!t.classes.includes(h.sectionLabel)) t.classes.push(h.sectionLabel);
    t.given++;
    t.assigned += h.counts.assigned;
    t.handed += h.counts.submitted;
    t.toCheck += h.counts.toCheck;
    map.set(h.teacherId, t);
  }
  const reminded = await tx.auditLogEntry.findMany({ where: { action: "reminded-teacher", recordType: "Staff", at: { gte: dayStart(today, tz) } }, select: { recordId: true, at: true }, orderBy: { at: "asc" } });
  const done = new Map(reminded.map((r) => [r.recordId, r.at]));
  for (const t of map.values()) t.remindedAt = done.get(t.staffId) ?? null;
  const lines = [...map.values()].sort((a, b) => b.given - a.given || a.name.localeCompare(b.name));
  // Teachers with allocations this year who gave nothing in these dates.
  const idle: { staffId: string; name: string; subjects: string[] }[] = [];
  if (s.yearIds.length) {
    const alloc = await tx.teacherAllocation.findMany({
      where: { academicYearId: { in: s.yearIds }, archivedAt: null, staffId: { notIn: [...map.keys()] }, ...(s.campusSections ? { sectionId: { in: s.campusSections } } : {}) },
      select: { staffId: true, subjectId: true },
    });
    const staff = await tx.staff.findMany({ where: { id: { in: [...new Set(alloc.map((a) => a.staffId))] }, archivedAt: null }, select: { id: true, fullName: true } });
    const subjects = await tx.subject.findMany({ where: { id: { in: [...new Set(alloc.map((a) => a.subjectId))] } }, select: { id: true, name: true } });
    const sub = new Map(subjects.map((x) => [x.id, x.name]));
    for (const st of staff) idle.push({ staffId: st.id, name: st.fullName, subjects: [...new Set(alloc.filter((a) => a.staffId === st.id).map((a) => sub.get(a.subjectId) ?? ""))].filter(Boolean) });
    idle.sort((a, b) => a.name.localeCompare(b.name));
  }
  return { lines, idle };
}

/** Current homework by due date; more than one for a class on the same day is shown as heavy. */
export function loadByDay(rows: HomeworkRow[]) {
  const current = rows.filter((r) => r.status === "Current");
  const days = [...new Set(current.map((r) => r.dueDate.toISOString().slice(0, 10)))].sort();
  return days.map((d) => {
    const due = current.filter((r) => r.dueDate.toISOString().slice(0, 10) === d);
    const per = new Map<string, number>();
    for (const r of due) per.set(r.sectionLabel, (per.get(r.sectionLabel) ?? 0) + 1);
    return { day: d, date: due[0].dueDate, due, heavy: [...per.entries()].filter(([, n]) => n > 1) };
  });
}

/** Reminds one teacher about work waiting to be checked: a notification in the app, once a day. */
export async function remindTeacher(tx: Tx, s: HomeworkScope, staffId: string, today: Date, tz: string) {
  if (s.level !== "full" || !s.modes.homework) throw new HomeworkProblem("Only the Principal, the School Admin, the Vice Principal or the Academic Head reminds teachers.");
  const staff = await tx.staff.findFirst({ where: { id: staffId, archivedAt: null }, select: { id: true, fullName: true, userLoginId: true } });
  // Limited to one campus: only a teacher who gives homework in that campus's classes.
  const here = !s.campusSections || (!!staff && (await tx.homework.count({ where: { teacherId: staff.id, sectionId: { in: s.campusSections } } })) > 0);
  if (!staff || !here) throw new HomeworkProblem("This teacher was not found.");
  if (!staff.userLoginId) throw new HomeworkProblem(`${staff.fullName} has no login, so the reminder cannot reach them. Speak to them in person.`);
  const already = await tx.auditLogEntry.findFirst({ where: { action: "reminded-teacher", recordType: "Staff", recordId: staffId, at: { gte: dayStart(today, tz) } } });
  if (already) throw new HomeworkProblem(`${staff.fullName} was already reminded today.`);
  const waiting = await tx.submission.count({ where: { archivedAt: null, status: { in: ["SUBMITTED", "LATE"] }, homework: { teacherId: staffId, archivedAt: null, ...listWhere(s) } } });
  if (!waiting) throw new HomeworkProblem(`${staff.fullName} has nothing waiting to be checked.`);
  await notify(tx, s.ctx, { to: staff.userLoginId, type: "homework-remind", text: `${s.name}: ${plural(waiting, "piece")} of homework ${waiting === 1 ? "is" : "are"} waiting to be checked. Today, ${dayDate(today)}.`, link: "/homework-learning/submissions", groupKey: "homework-remind" });
  await writeAudit(tx, s.ctx, { action: "reminded-teacher", recordType: "Staff", recordId: staffId, after: { teacher: staff.fullName, waiting } });
  return { name: staff.fullName, waiting };
}
