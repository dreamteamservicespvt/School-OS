// Attendance demo: every school day of this year so far marked for students
// and staff (a few late, a few students below 75%, one absent several days
// in a row), today taken for most classes but not Class 5 A (so the class
// teacher can take it), student leave in every state, a correction waiting
// and one approved, two devices with punches (some from unknown users), a QR
// check-in, the school's location for phone check-in, and overtime.
// Today's saves, leave, corrections, devices and QR go through the module's
// own functions; the months before are written in bulk.
import type { Prisma } from "@prisma/client";
import { withSchool, type SchoolContext } from "../../src/lib/db";
import { accessIn } from "../../src/lib/auth/access";
import { attendanceAccess, type AccessSource, type AttendanceAccess } from "../../src/lib/attendance/access";
import { ensureAttendanceDefaults, setAttendanceFeature } from "../../src/lib/attendance/settings";
import { schoolDays } from "../../src/lib/attendance/calendar";
import { schoolDateOf, instantAt } from "../../src/lib/attendance/time";
import { saveClassAttendance } from "../../src/lib/attendance/marks";
import { afterAttendanceSaved } from "../../src/lib/attendance/alerts";
import { recordStudentLeave, decideStudentLeave, cancelStudentLeave } from "../../src/lib/attendance/student-leave";
import { requestCorrection } from "../../src/lib/attendance/corrections";
import { addDevice, autoMatch, receivePunches, reprocessRejected } from "../../src/lib/attendance/devices";
import { createQrSession, saveGeoFence } from "../../src/lib/attendance/qr";
import { recordOvertime, saveShift, assignShift } from "../../src/lib/attendance/staff";
import { decide } from "../../src/lib/approvals";
import "../../src/lib/approval-handlers";
import { addDays, isoDay } from "../../src/lib/staff/dates";
import type { SeedSchool } from "./types";

const TZ = "Asia/Kolkata";

/** A small repeatable random number from a few integers (0 to 1). */
function rnd(...n: number[]) {
  let h = 2166136261;
  for (const x of n) { h ^= x; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return ((h >>> 0) % 100000) / 100000;
}

async function accessOf(s: SeedSchool, userId: string): Promise<{ ctx: SchoolContext; access: AttendanceAccess }> {
  const view = await accessIn(userId, s.schoolId);
  if (!view) throw new Error(`No access for ${userId}`);
  const ctx = { schoolId: s.schoolId, userId };
  const source = { ...view, user: { id: userId } } as unknown as AccessSource;
  const access = await withSchool(ctx, (tx) => attendanceAccess(tx, ctx, source));
  return { ctx, access };
}

/** 09:05 IST on a date, as an instant. */
const at = (date: Date, hhmm: string) => instantAt(date, hhmm, TZ);

async function chunks<T>(rows: T[], size: number, put: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await put(rows.slice(i, i + size));
}

export async function seedAttendance(s: SeedSchool) {
  const sys = { schoolId: s.schoolId, userId: null };
  const now = new Date();
  const today = schoolDateOf(now, TZ);
  const principalId = s.users.principal;
  if (!principalId) return;

  // 1. Settings and the optional parts.
  const base = await withSchool(sys, async (tx) => {
    await ensureAttendanceDefaults(tx, sys);
    await tx.attendanceSetting.update({
      where: { schoolId: s.schoolId },
      data: { staffMethods: s.full ? ["register", "device", "qr", "mobile"] : ["register"], studentMethods: ["register"], qrStaffOn: s.full },
    });
    if (s.full) for (const f of ["offline", "devices", "qr", "mobile", "leave-quotas", "overtime", "shifts"] as const) await setAttendanceFeature(tx, sys, `attendance-${f}`, true);
    const year = await tx.academicYear.findUniqueOrThrow({ where: { id: s.yearId } });
    const sections = await tx.section.findMany({ where: { academicYearId: year.id, archivedAt: null }, include: { schoolClass: { select: { name: true } } } });
    sections.sort((a, b) => a.schoolClass.name.localeCompare(b.schoolClass.name, "en", { numeric: true }) || a.name.localeCompare(b.name));
    const enrol = await tx.enrolment.findMany({ where: { academicYearId: year.id, archivedAt: null, student: { status: "ACTIVE", archivedAt: null } }, select: { studentId: true, sectionId: true, rollNo: true }, orderBy: [{ sectionId: "asc" }, { rollNo: "asc" }] });
    const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, select: { id: true, staffCode: true, userLoginId: true, fullName: true, joiningDate: true }, orderBy: { staffCode: "asc" } });
    const days = await schoolDays(tx, sys, year.startDate, addDays(today, -1), s.campusId);
    const staffLeave = await tx.leaveRequest.findMany({ where: { staffId: { not: null }, status: "APPROVED", archivedAt: null }, select: { staffId: true, fromDate: true, toDate: true, id: true } });
    const types = await tx.leaveType.findMany({ where: { forWhom: "student", archivedAt: null } });
    const teacherLogins = new Map((await tx.staff.findMany({ where: { id: { in: sections.map((x) => x.classTeacherId).filter((x): x is string => Boolean(x)) } }, select: { id: true, userLoginId: true } })).map((x) => [x.id, x.userLoginId]));
    return { year, sections, enrol, staff, past: days.working, staffLeave, types, teacherLogins };
  });
  const { sections, enrol, staff, past, year } = base;
  const c5a = sections.find((x) => x.schoolClass.name === "Class 5" && x.name === "A") ?? sections[0];
  const type = (code: string) => base.types.find((t) => t.code === code) ?? base.types[0];
  const { ctx: pctx, access: pAccess } = await accessOf(s, principalId);

  // 2. Student leave in every state, through the module (before the marks, so
  //    the register shows approved leave as Leave).
  const roster = (sectionId: string) => enrol.filter((e) => e.sectionId === sectionId);
  const c5aKids = roster(c5a.id);
  const leaveStudents = { past: c5aKids[5], today: c5aKids[8], waiting: c5aKids[11], future: roster(sections[2].id)[4], rejected: roster(sections[4].id)[2], cancelled: roster(sections[6 % sections.length].id)[7] };
  const pastFrom = past.at(-6) ?? today;
  const pastTo = past.at(-5) ?? today;
  const approvedLeaves: { studentId: string; from: Date; to: Date; id: string }[] = [];
  let rejectOn: Date | null = null;
  await withSchool(pctx, async (tx) => {
    const put = async (studentId: string | undefined, code: string, from: Date, to: Date, reason: string, approveNow: boolean, halfDay = false) => {
      if (!studentId) return null;
      const r = await recordStudentLeave(tx, pctx, pAccess, { studentId, leaveTypeId: type(code).id, from, to, halfDay, reason, documentFileId: null, approveNow });
      if (r.approved) approvedLeaves.push({ studentId, from, to, id: r.request.id });
      return r.request;
    };
    await put(leaveStudents.past?.studentId, "SICK", pastFrom, pastTo, "Viral fever. The doctor advised two days of rest.", true);
    const nextSchoolDay = async (from: Date, n: number) => {
      const ahead = (await schoolDays(tx, pctx, from, addDays(from, 30), s.campusId)).working;
      return ahead[Math.min(n, ahead.length - 1)] ?? from;
    };
    await put(leaveStudents.today?.studentId, "FAMILY", today, today, "Sister's wedding in Vijayawada.", true);
    if (s.full) {
      const f1 = await nextSchoolDay(addDays(today, 1), 0);
      const f2 = await nextSchoolDay(addDays(today, 1), 1);
      await put(leaveStudents.future?.studentId, "SICK", f1, f2, "Minor surgery planned at Rainbow Hospital.", true);
      rejectOn = f1;
      const can = await put(leaveStudents.cancelled?.studentId, "FAMILY", f2, f2, "Temple visit with grandparents.", true);
      if (can) await cancelStudentLeave(tx, pctx, pAccess, can.id, "The parent called: the trip is postponed.");
    }
  }, { timeout: 60_000 });
  // One recorded by the office and rejected by the principal.
  if (rejectOn && s.users.admin && leaveStudents.rejected) {
    const { ctx: octx, access: oAccess } = await accessOf(s, s.users.admin);
    const r = await withSchool(octx, (tx) => recordStudentLeave(tx, octx, oAccess, { studentId: leaveStudents.rejected!.studentId, leaveTypeId: type("OTHER").id, from: rejectOn!, to: rejectOn!, halfDay: false, reason: "Going to a cousin's birthday.", documentFileId: null, approveNow: false }), { timeout: 30_000 });
    await withSchool(pctx, (tx) => decideStudentLeave(tx, pctx, pAccess, r.request.id, "reject", "Unit test on that day. Please send the child to school."), { timeout: 30_000 });
  }
  // A waiting request recorded by the class teacher, for the principal (over 3 days).
  if (s.users.teacher && leaveStudents.waiting) {
    const { ctx: tctx, access: tAccess } = await accessOf(s, s.users.teacher);
    await withSchool(tctx, async (tx) => {
      const ahead = (await schoolDays(tx, tctx, addDays(today, 1), addDays(today, 40), s.campusId)).working;
      if (ahead.length >= 5) await recordStudentLeave(tx, tctx, tAccess, { studentId: leaveStudents.waiting!.studentId, leaveTypeId: type("FAMILY").id, from: ahead[0], to: ahead[4], halfDay: false, reason: "Going to our village for the grandmother's ceremony.", documentFileId: null, approveNow: false });
      if (ahead.length >= 2 && c5aKids[2]) await recordStudentLeave(tx, tctx, tAccess, { studentId: c5aKids[2].studentId, leaveTypeId: type("SICK").id, from: ahead[1], to: ahead[1], halfDay: true, reason: "Dentist appointment in the afternoon.", documentFileId: null, approveNow: false });
    }, { timeout: 30_000 });
  }

  // 3. Student marks for every school day before today, in bulk.
  const onLeave = (studentId: string, d: Date) => approvedLeaves.find((l) => l.studentId === studentId && l.from <= d && l.to >= d);
  // A few students below 75%, one absent the last 4 school days.
  const lowIdx = new Set(enrol.map((_, i) => i).filter((i) => i % 41 === 7));
  const streakStudent = roster(sections[Math.min(3, sections.length - 1)].id)[6]?.studentId;
  const streakDays = new Set(past.slice(-4).map(isoDay));
  const rows: Prisma.AttendanceMarkCreateManyInput[] = [];
  const subs: { schoolId: string; clientId: string; sectionId: string; date: Date; periodNo: number; submittedById: string | null; takenAt: Date; receivedAt: Date; outcome: string; entries: number }[] = [];
  for (const [di, d] of past.entries()) {
    for (const sec of sections) {
      const kids = roster(sec.id);
      if (!kids.length) continue;
      const by = (sec.classTeacherId && base.teacherLogins.get(sec.classTeacherId)) || principalId;
      const minute = 50 + Math.floor(rnd(di, kids.length, 3) * 25);
      const taken = at(d, `08:${String(Math.min(59, minute)).padStart(2, "0")}`);
      subs.push({ schoolId: s.schoolId, clientId: `seed-${sec.id}-${isoDay(d)}`, sectionId: sec.id, date: d, periodNo: 0, submittedById: by, takenAt: taken, receivedAt: taken, outcome: "saved", entries: kids.length });
      for (const k of kids) {
        const i = enrol.indexOf(k);
        const r = rnd(i, di, 11);
        const leave = onLeave(k.studentId, d);
        let statusKey = "present";
        let lateMinutes: number | null = null;
        if (leave) statusKey = "leave";
        else if (k.studentId === streakStudent && streakDays.has(isoDay(d))) statusKey = "absent";
        else if (r < (lowIdx.has(i) ? 0.3 : 0.035)) statusKey = "absent";
        else if (r < (lowIdx.has(i) ? 0.36 : 0.075)) { statusKey = "late"; lateMinutes = 12 + Math.floor(rnd(i, di, 5) * 30); }
        else if (r > 0.996) statusKey = "half-day";
        rows.push({ schoolId: s.schoolId, academicYearId: year.id, studentId: k.studentId, sectionId: sec.id, date: d, periodNo: 0, statusKey, lateMinutes, leaveRequestId: leave?.id ?? null, method: "register", markedById: by, markedAt: taken, takenAt: taken, locked: true });
      }
    }
  }
  // Staff: most punch at the main gate, a few are late or away.
  const deviceStaff = s.full ? new Set(staff.filter((_, i) => i % 6 !== 5).map((x) => x.id)) : new Set<string>();
  for (const [di, d] of past.entries()) {
    for (const [i, p] of staff.entries()) {
      const leave = base.staffLeave.find((l) => l.staffId === p.id && l.fromDate <= d && l.toDate >= d);
      const r = rnd(i, di, 29);
      let statusKey = "present";
      let mins = 15 + Math.floor(rnd(i, di, 2) * 25); // 08:15 to 08:39
      if (leave) statusKey = "leave";
      else if (r < 0.02) statusKey = "absent";
      else if (r < 0.07) { statusKey = "late"; mins = 41 + Math.floor(rnd(i, di, 4) * 30); }
      const inTime = statusKey === "present" || statusKey === "late" ? new Date(at(d, "08:00").getTime() + mins * 60000) : null;
      const outTime = inTime ? new Date(at(d, "16:00").getTime() + Math.floor(rnd(i, di, 8) * 50) * 60000) : null;
      rows.push({ schoolId: s.schoolId, academicYearId: year.id, staffId: p.id, date: d, periodNo: 0, statusKey, inTime, outTime, lateMinutes: statusKey === "late" ? mins - 30 : inTime ? 0 : null, method: inTime && deviceStaff.has(p.id) ? "fingerprint" : "register", markedById: inTime && deviceStaff.has(p.id) ? null : principalId, markedAt: inTime ?? at(d, "09:30"), locked: true });
    }
  }
  await chunks(rows, 4000, (part) => withSchool(sys, (tx) => tx.attendanceMark.createMany({ data: part }), { timeout: 60_000 }));
  await chunks(subs, 4000, (part) => withSchool(sys, (tx) => tx.attendanceSubmission.createMany({ data: part }), { timeout: 60_000 }));

  // 3b. Last year (from the reopening in June to March), so earlier months and
  //     years show real marks when a calendar pages back.
  await withSchool(sys, async (tx) => {
    const pastYear = await tx.academicYear.findUnique({ where: { id: s.pastYearId } });
    if (!pastYear) return;
    const from = new Date(Math.max(pastYear.startDate.getTime(), Date.UTC(pastYear.startDate.getUTCFullYear(), 5, 10)));
    const days = (await schoolDays(tx, sys, from, pastYear.endDate, s.campusId)).working;
    const pastEnrol = await tx.enrolment.findMany({ where: { academicYearId: pastYear.id, archivedAt: null }, select: { studentId: true, sectionId: true } });
    const old: Prisma.AttendanceMarkCreateManyInput[] = [];
    for (const [di, d] of days.entries()) {
      for (const [i, e] of pastEnrol.entries()) {
        const r = rnd(i, di, 77);
        const statusKey = r < 0.04 ? "absent" : r < 0.08 ? "late" : r > 0.997 ? "half-day" : "present";
        old.push({ schoolId: s.schoolId, academicYearId: pastYear.id, studentId: e.studentId, sectionId: e.sectionId, date: d, periodNo: 0, statusKey, lateMinutes: statusKey === "late" ? 15 : null, method: "register", markedById: principalId, markedAt: at(d, "08:55"), takenAt: at(d, "08:55"), locked: true });
      }
      // Staff who had joined by then: their punches, so a staff month pages back too.
      for (const [i, p] of staff.entries()) {
        if (p.joiningDate > d) continue;
        const r = rnd(i, di, 91);
        const statusKey = r < 0.02 ? "absent" : r < 0.06 ? "late" : "present";
        const mins = statusKey === "late" ? 45 + Math.floor(rnd(i, di, 6) * 20) : 15 + Math.floor(rnd(i, di, 3) * 20);
        const inTime = statusKey === "absent" ? null : new Date(at(d, "08:00").getTime() + mins * 60000);
        old.push({ schoolId: s.schoolId, academicYearId: pastYear.id, staffId: p.id, date: d, periodNo: 0, statusKey, inTime, outTime: inTime ? at(d, "16:10") : null, lateMinutes: statusKey === "late" ? mins - 30 : inTime ? 0 : null, method: inTime && deviceStaff.has(p.id) ? "fingerprint" : "register", markedById: inTime && deviceStaff.has(p.id) ? null : principalId, markedAt: inTime ?? at(d, "09:30"), locked: true });
      }
    }
    return old;
  }, { timeout: 60_000 }).then((old) => old && chunks(old, 4000, (part) => withSchool(sys, (tx) => tx.attendanceMark.createMany({ data: part }), { timeout: 60_000 })));

  // 4. Alerts and flags for the last few days (threshold, absent streak).
  for (const d of past.slice(-3)) {
    for (const sec of sections) await withSchool(sys, (tx) => afterAttendanceSaved(tx, sys, { sectionId: sec.id, date: isoDay(d) }), { timeout: 60_000 });
  }

  // 5. Today: most classes taken at 8:50 through the module; Class 5 A and two
  //    others are left for their class teachers.
  const dayOn = await withSchool(sys, async (tx) => (await schoolDays(tx, sys, today, today, s.campusId)).working.length > 0);
  if (dayOn) {
    const skip = new Set([c5a.id, sections.at(-1)?.id, sections.at(-3)?.id]);
    for (const [si, sec] of sections.entries()) {
      if (skip.has(sec.id)) continue;
      const kids = roster(sec.id);
      if (!kids.length) continue;
      await withSchool(pctx, async (tx) => {
        const entries = kids.map((k) => {
          const i = enrol.indexOf(k);
          const r = rnd(i, 999, si);
          const leave = onLeave(k.studentId, today);
          return { studentId: k.studentId, statusKey: leave ? "leave" : k.studentId === streakStudent || r < (lowIdx.has(i) ? 0.3 : 0.04) ? "absent" : r < 0.08 ? "late" : "present" };
        });
        await saveClassAttendance(tx, pctx, pAccess, { sectionId: sec.id, date: today, periodNo: 0, entries, now: at(today, "08:52"), timeZone: TZ, clientId: `seed-today-${sec.id}` });
        await afterAttendanceSaved(tx, pctx, { sectionId: sec.id, date: isoDay(today) });
      }, { timeout: 60_000 });
    }
  }

  if (!s.full) return;
  const { ctx: actx, access: aAccess } = s.users.admin ? await accessOf(s, s.users.admin) : { ctx: pctx, access: pAccess };

  // 6. Corrections: one approved, one waiting (asked by the class teacher).
  if (s.users.teacher && past.length > 8) {
    const { ctx: tctx, access: tAccess } = await accessOf(s, s.users.teacher);
    const d1 = past.at(-8)!;
    const d2 = past.at(-2)!;
    const marks = await withSchool(sys, (tx) => tx.attendanceMark.findMany({ where: { sectionId: c5a.id, date: { in: [d1, d2] }, statusKey: "absent" }, select: { studentId: true, date: true } }));
    const pick = (d: Date, n: number) => marks.find((m) => m.date.getTime() === d.getTime())?.studentId ?? c5aKids[n]?.studentId;
    const first = await withSchool(tctx, (tx) => requestCorrection(tx, tctx, tAccess, { forWhom: "student", sectionId: c5a.id, date: d1, periodNo: 0, changes: [{ id: pick(d1, 3)!, to: "late", note: "Came at 9:20 with a note from the parent" }], reason: "She came late after the bus broke down; I marked her absent by mistake." }), { timeout: 30_000 });
    if (first.approvalId) await withSchool(pctx, (tx) => decide(tx, pctx, first.approvalId!, "approve", null), { timeout: 30_000 });
    await withSchool(tctx, (tx) => requestCorrection(tx, tctx, tAccess, { forWhom: "student", sectionId: c5a.id, date: d2, periodNo: 0, changes: [{ id: pick(d2, 9)!, to: "medical", note: "Medical certificate received" }], reason: "The parent sent a doctor's certificate for this day." }), { timeout: 30_000 });
  }

  // 7. A shift for the support staff, and overtime.
  await withSchool(actx, async (tx) => {
    await saveShift(tx, actx, aAccess, { name: "General", startTime: "08:30", endTime: "16:30", lateAfterMin: 10 });
    const early = await saveShift(tx, actx, aAccess, { name: "Early (transport and security)", startTime: "06:30", endTime: "14:30", lateAfterMin: 10 });
    const support = staff.slice(-3).map((x) => x.id);
    if (support.length) await assignShift(tx, actx, aAccess, { staffIds: support, shiftId: early.id, fromDate: year.startDate });
    for (const [i, p] of staff.slice(1, 4).entries()) {
      const d = past.at(-1 - i * 2);
      if (d) await recordOvertime(tx, actx, aAccess, { staffId: p.id, date: d, minutes: 60 + i * 30, note: ["Parent-teacher meeting", "Annual day practice", "Exam paper evaluation"][i], today });
    }
  }, { timeout: 30_000 });

  // 8. Devices: the main gate reader (staff), and a student gate reader that
  //    stopped sending two days ago. Today's punches go through the device path.
  const devices = await withSchool(actx, async (tx) => {
    const gate = await addDevice(tx, actx, aAccess, { name: "Main gate", serialNo: "ZK-K40-7781", location: "Main gate, ground floor", campusId: s.campusId, deviceType: "fingerprint", allowedUsers: "staff", ipAddress: "192.168.1.40", connectionNote: null });
    const face = await addDevice(tx, actx, aAccess, { name: "Junior block", serialNo: "ESSL-FR-2093", location: "Junior block entrance", campusId: s.campusId, deviceType: "face", allowedUsers: "both", ipAddress: "192.168.1.41", connectionNote: "Wi-Fi" });
    return { gate: gate.device.id, face: face.device.id };
  }, { timeout: 30_000 });
  await withSchool(actx, async (tx) => {
    const device = await tx.attendanceDevice.findUniqueOrThrow({ where: { id: devices.gate } });
    // First sync: everyone's staff number plus two people the device knows but the school does not.
    const firstDay = past.at(-1) ?? today;
    const first = [...deviceStaff].map((id, i) => ({ punchNo: `P${isoDay(firstDay)}-${i}`, userNo: staff.find((x) => x.id === id)!.staffCode, time: new Date(at(firstDay, "08:20").getTime() + i * 47000).toISOString() }));
    first.push({ punchNo: `P${isoDay(firstDay)}-u1`, userNo: "1043", time: at(firstDay, "08:25").toISOString() }, { punchNo: `P${isoDay(firstDay)}-u2`, userNo: "1077", time: at(firstDay, "08:31").toISOString() });
    await receivePunches(tx, actx, device, first, at(firstDay, "18:00"), TZ);
    await autoMatch(tx, actx, aAccess, device.id);
    await reprocessRejected(tx, actx, aAccess, device.id, at(firstDay, "18:05"), TZ);
    if (dayOn) {
      // Received after the morning punches, even when the seed runs before school.
      const t = now < at(today, "09:30") ? at(today, "09:30") : now;
      const list = [...deviceStaff].filter((_, i) => i % 9 !== 4).map((id, i) => ({ punchNo: `P${isoDay(today)}-${i}`, userNo: staff.find((x) => x.id === id)!.staffCode, time: new Date(at(today, "08:12").getTime() + i * 53000 + (i % 7 === 3 ? 40 * 60000 : 0)).toISOString() }));
      list.push({ punchNo: `P${isoDay(today)}-u1`, userNo: "1043", time: at(today, "08:24").toISOString() }, { punchNo: `P${isoDay(today)}-r1`, userNo: list[0]?.userNo ?? "1", time: new Date(new Date(list[0]?.time ?? t).getTime() + 60000).toISOString() });
      await receivePunches(tx, actx, device, list, t, TZ);
    }
    const face = await tx.attendanceDevice.findUniqueOrThrow({ where: { id: devices.face } });
    const old = past.at(-2) ?? today;
    await receivePunches(tx, actx, face, [{ punchNo: `F${isoDay(old)}-1`, userNo: "2201", time: at(old, "08:40").toISOString() }], at(old, "17:00"), TZ);
  }, { timeout: 60_000 });

  // 9. QR check-in for staff, and the school's location for phone check-in.
  await withSchool(actx, async (tx) => {
    await createQrSession(tx, actx, aAccess, { name: "Staff room", forWhom: "staff", scope: "school", campusId: s.campusId, rotation: "daily", expiresAt: null, now });
    await saveGeoFence(tx, actx, aAccess, { campusId: s.campusId, latitude: 17.4474, longitude: 78.3762, radiusM: 120, studentsOn: false, staffOn: true });
  }, { timeout: 30_000 });
}
