// The staff a visitor can meet, with where they are now (16 §2 "shows if
// they are on leave or in class now"), and one staff member's day for
// appointments: leave, teaching from the Time Table, and booked meetings.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { absentStaffOn } from "../academic/substitutions";
import { effectiveVersion, periodsForStaffOnDate } from "../academic/timetable";
import { dayOff } from "../academic/calendar";
import { weekday } from "../academic/common";
import { clockOf, hhmmOf, minutesOf } from "./words";

export type MeetOption = { id: string; name: string; role: string; now: string; tone: "ok" | "warn" | "bad"; loginId: string | null };

const LEAVE_WORDS: Record<string, string> = { leave: "On leave today", absent: "Absent today", temporary: "Away (temporary teacher in place)" };

const DAY_WORDS: Record<string, string> = { leave: "On leave", absent: "Absent", temporary: "Away" };

export const rank = (designation: string) => (/^principal$/i.test(designation) ? 0 : /principal/i.test(designation) ? 1 : /admin|accountant|counsellor|office/i.test(designation) ? 2 : 3);

/** Every working staff member, each with where they are now: on leave, teaching, in a meeting, or free. */
export async function staffToMeet(tx: Tx, ctx: SchoolContext, today: Date, minute: number): Promise<MeetOption[]> {
  const staff = await tx.staff.findMany({
    where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } },
    select: { id: true, fullName: true, designation: true, campusId: true, userLoginId: true, status: true },
    orderBy: { fullName: "asc" },
  });
  if (!staff.length) return [];
  const hhmm = hhmmOf(minute);
  const away = await absentStaffOn(tx, ctx, today);
  const teaching = new Map<string, { label: string; until: string }>();
  for (const campusId of new Set(staff.map((s) => s.campusId))) {
    if (await dayOff(tx, ctx, today, campusId)) continue;
    const version = await effectiveVersion(tx, ctx, campusId, today);
    if (!version) continue;
    const now = await tx.timetablePeriod.findMany({
      where: { versionId: version.id, dayOfWeek: weekday(today), archivedAt: null, isBreak: false, staffId: { not: null }, startTime: { lte: hhmm }, endTime: { gt: hhmm } },
      select: { id: true, staffId: true, endTime: true, section: { select: { name: true, schoolClass: { select: { name: true } } } } },
    });
    const subs = now.length ? await tx.substitution.findMany({ where: { date: today, archivedAt: null, status: "ARRANGED", periodId: { in: now.map((p) => p.id) } }, select: { periodId: true, substituteStaffId: true, absentStaffId: true } }) : [];
    for (const p of now) {
      const label = `${p.section.schoolClass.name.replace(/^Class\s+/i, "")} ${p.section.name}`;
      const s = subs.find((x) => x.periodId === p.id);
      const who = s?.substituteStaffId ?? p.staffId!;
      if (s && s.absentStaffId === p.staffId && !s.substituteStaffId) continue;
      teaching.set(who, { label, until: p.endTime });
    }
  }
  const meetings = await tx.appointment.findMany({
    where: { date: today, archivedAt: null, status: { in: ["BOOKED", "ARRIVED"] }, startMin: { lte: minute } },
    select: { staffId: true, startMin: true, lengthMin: true },
  });
  const inMeeting = new Map<string, number>();
  for (const m of meetings) if (m.startMin + m.lengthMin > minute) inMeeting.set(m.staffId, m.startMin + m.lengthMin);
  return staff
    .map((s) => {
      const off = away.get(s.id);
      const t = teaching.get(s.id);
      const meet = inMeeting.get(s.id);
      const base = { id: s.id, name: s.fullName, role: s.designation, loginId: s.userLoginId };
      if (off) return { ...base, now: LEAVE_WORDS[off.reason] ?? "Away today", tone: "bad" as const };
      if (s.status === "ON_LEAVE") return { ...base, now: "On leave", tone: "bad" as const };
      if (t) return { ...base, now: `Teaching ${t.label} till ${clockOf(minutesOf(t.until))}`, tone: "warn" as const };
      if (meet) return { ...base, now: `In a meeting till ${clockOf(meet)}`, tone: "warn" as const };
      return { ...base, now: "In school, free now", tone: "ok" as const };
    })
    .sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name));
}

export type Segment = { start: number; end: number; kind: "teach" | "booked" | "now" | "done" | "noshow" | "arrived"; label: string; appointmentId?: string; status?: string };

/** One staff member's day: off (holiday or leave), teaching periods and appointments. */
export async function staffDay(tx: Tx, ctx: SchoolContext, staffId: string, date: Date) {
  const staff = await tx.staff.findFirst({ where: { id: staffId, archivedAt: null }, select: { id: true, fullName: true, designation: true, campusId: true, status: true } });
  if (!staff) return null;
  const off = await dayOff(tx, ctx, date, staff.campusId);
  const away = (await absentStaffOn(tx, ctx, date)).get(staffId);
  const leave = off ? off.title : away ? DAY_WORDS[away.reason] ?? "Away" : null;
  const segments: Segment[] = [];
  if (!leave) {
    const { periods } = await periodsForStaffOnDate(tx, ctx, staffId, date);
    for (const p of periods) {
      if (p.isBreak) continue;
      if (p.substitution && !p.isSubstitute && p.substitution.status === "ARRANGED") continue;
      const section = p.sectionLabel.replace(/^Class\s+/i, "");
      segments.push({ start: minutesOf(p.startTime), end: minutesOf(p.endTime), kind: "teach", label: `Teaching ${section}${p.subjectName ? ` · ${p.subjectName}` : ""}` });
    }
  }
  const appts = await tx.appointment.findMany({ where: { staffId, date, archivedAt: null, status: { not: "CANCELLED" } }, orderBy: { startMin: "asc" } });
  for (const a of appts) {
    const kind = a.status === "DONE" ? "done" : a.status === "NO_SHOW" ? "noshow" : a.status === "ARRIVED" ? "arrived" : "booked";
    segments.push({ start: a.startMin, end: a.startMin + a.lengthMin, kind, label: `${a.visitorName} · ${a.purpose}`, appointmentId: a.id, status: a.status });
  }
  segments.sort((a, b) => a.start - b.start);
  return { staff, leave, segments };
}
