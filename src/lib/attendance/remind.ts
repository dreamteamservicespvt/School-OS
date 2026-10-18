// "Not marked yet" (owner's prototype changes of 13 Oct 2026, attendance.jsx
// NotMarked): the sections whose register is not taken today, and Remind,
// which asks their class teachers to take it before the lock. Only people who
// see the whole school's attendance may remind; each reminder is audited.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { remindedSince, sendReminder } from "../reminders";
import { isoDay } from "../staff/dates";
import { AttendanceProblem, BASE, sectionAllowed, type AttendanceAccess } from "./access";
import { classWise } from "./classwise";
import { lockState } from "./marks";
import { attendanceSettings } from "./settings";
import { dayText } from "./marks";

export const REMIND_ACTION = "attendance-reminder";

export type NotMarkedRow = { sectionId: string; name: string; students: number; teacher: string | null; teacherLogin: string | null; remindedAt: Date | null };

/**
 * Sections not marked on a day (today for the Dashboard), with their class
 * teachers and any reminder already sent: every campus's current year, or
 * only the person's campus when their access is limited to one.
 */
export async function notMarkedOn(tx: Tx, ctx: SchoolContext, access: Pick<AttendanceAccess, "yearIds" | "campusId" | "limitSections">, date: Date, since: Date): Promise<NotMarkedRow[]> {
  if (access.yearIds.length === 0) return [];
  const cw = await classWise(tx, ctx, { yearId: access.yearIds, from: date, to: date, today: date, sectionIds: access.limitSections, campusId: access.campusId });
  const rows = cw.sections.filter((s) => s.notMarked);
  const sent = await remindedSince(tx, ctx, REMIND_ACTION, rows.map((r) => r.sectionId), since);
  return rows.map((r) => ({ sectionId: r.sectionId, name: r.name, students: r.students, teacher: r.teacher?.name ?? null, teacherLogin: r.teacher?.userLoginId ?? null, remindedAt: sent.get(r.sectionId) ?? null }));
}

/**
 * Reminds the class teachers of these sections to take today's attendance.
 * Server rule: only someone who sees every section's attendance (Principal,
 * School Admin, Vice Principal, Academic Head) may send it. Sections already
 * marked, or without a class teacher who can sign in, are skipped.
 */
export async function remindNotMarked(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: { sectionIds: string[]; date: Date; now: Date; timeZone: string }) {
  if (access.students !== "all") throw new AttendanceProblem("Only people who look after the whole school's attendance can send these reminders.");
  if (access.yearIds.length === 0) throw new AttendanceProblem("There is no academic year running now.");
  const settings = await attendanceSettings(tx, ctx);
  const lock = lockState(settings, input.date, input.now, input.timeZone);
  // Another campus's sections are left out for a person limited to one campus.
  const sectionIds = input.sectionIds.filter((id) => sectionAllowed(access, id));
  const cw = await classWise(tx, ctx, { yearId: access.yearIds, from: input.date, to: input.date, today: input.date, sectionIds, campusId: access.campusId });
  const reminded: string[] = [];
  const skipped: { name: string; why: string }[] = [];
  for (const s of cw.sections) {
    if (!s.notMarked) { skipped.push({ name: s.name, why: "already marked" }); continue; }
    if (!s.teacher?.userLoginId) { skipped.push({ name: s.name, why: s.teacher ? `${s.teacher.name} cannot sign in` : "no class teacher" }); continue; }
    const ok = await sendReminder(tx, ctx, {
      action: REMIND_ACTION, recordType: "Section", recordId: s.sectionId, to: s.teacher.userLoginId,
      text: lock.locked
        ? `Attendance for ${s.name} was not taken on ${dayText(input.date)}. Please take it now; it needs a correction after the lock.`
        : `Please take today's attendance for ${s.name} before the ${lock.atText} lock.`,
      link: `${BASE}?section=${s.sectionId}&date=${isoDay(input.date)}`,
      about: { section: s.name, date: isoDay(input.date), teacher: s.teacher.name },
    });
    if (ok) reminded.push(s.teacher.name);
    else skipped.push({ name: s.name, why: "you are its class teacher" });
  }
  return { reminded, skipped };
}
