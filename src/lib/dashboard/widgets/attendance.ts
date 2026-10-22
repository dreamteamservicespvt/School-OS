// Attendance Management on the Dashboard (01-dashboard.md §2, 05 "Gives"):
// students and staff present today, attendance taken, the class teacher's
// section, student leave waiting, absence streaks and low attendance, and
// "Attendance this week" by class. Reach follows Attendance Management
// (src/lib/attendance/access.ts): full roles see the whole school, a class
// teacher only their own section, HR only staff attendance. The flag cards
// count the Attendance Flag, the one record of a student's attendance concern:
// its review is done in Early Warnings, and the Early Warnings card leaves
// these children out, so each is counted once.
import "server-only";

import { attendanceAccess, BASE, type AttendanceAccess } from "../../attendance/access";
import { attendanceSettings } from "../../attendance/settings";
import { attendanceToday } from "../../attendance/integrations";
import { lockState, takeChoices, type TakeChoice } from "../../attendance/marks";
import { staffDay } from "../../attendance/staff";
import { schoolDays } from "../../attendance/calendar";
import { classWise } from "../../attendance/classwise";
import { ON_REGISTER_STATUSES } from "../../attendance/on-register";
import { OPEN_ATTENDANCE_FLAG } from "../../attendance/flags";
import { reportAccess } from "../../reports/access";
import { addDays, iso, moduleOpen, n, plural, reach } from "../common";
import type { AttentionItem, BarRow, DashContext, Viewer, Widget } from "../types";

const MODULE = "attendance-management" as const;
const PRESENT = ["present", "late", "half-day"];
const fullReach = (v: Viewer) => reach(v, MODULE) === "all";

/**
 * Where "Take attendance" goes for a class, period and date (registry slot
 * "attendance.take-for-period"). Period 0 is the once-a-day mark.
 */
export function attendanceTakeHref(period: { sectionId: string; periodNo: number; date: Date }): string {
  return `${BASE}?section=${period.sectionId}&date=${iso(period.date)}${period.periodNo ? `&period=${period.periodNo}` : ""}`;
}

function access(c: DashContext): Promise<AttendanceAccess> {
  return c.memo("attendance-access", async () => {
    const settings = await attendanceSettings(c.tx, c.viewer.ctx);
    return attendanceAccess(c.tx, c.viewer.ctx, c.viewer, settings.lockOverrideRoles);
  });
}
const settings = (c: DashContext) => c.memo("attendance-settings", () => attendanceSettings(c.tx, c.viewer.ctx));
/** Today's whole-school numbers, read once per page (from the class-wise rows). */
const today = (c: DashContext) => c.memo("attendance-today", () => attendanceToday(c.tx, c.viewer.ctx, c.today, { campusId: c.viewer.campusId ?? null }));
/** The classes and periods this person may take today, with "done". */
export function choices(c: DashContext): Promise<TakeChoice[]> {
  return c.memo("attendance-choices", async () => takeChoices(c.tx, c.viewer.ctx, await access(c), c.today));
}
/** Today by the school's one rule for a school day (src/lib/calendar/school-days.ts), for a campus. */
function schoolDayOff(c: DashContext, campusId: string | null) {
  return c.memo(`attendance-off:${campusId ?? ""}`, async () => (await schoolDays(c.tx, c.viewer.ctx, c.today, c.today, campusId)).info(c.today));
}
/** A day without school on a tile: "Holiday" with its name, or "No school" and why; never counts that read as "nobody came". */
function offTile(off: { reason: string | null; title: string | null }) {
  return off.reason === "holiday"
    ? { big: "Holiday", foot: off.title ?? "Holiday on the School Calendar" }
    : { big: "No school", foot: off.title ? `${off.title}, not a working day` : undefined };
}
/** Students in the class teacher's own sections this year (for "own" reach). */
function ownStudents(c: DashContext, a: AttendanceAccess) {
  return c.memo("attendance-own-students", async () => {
    if (!a.yearId || a.classSections.length === 0) return [];
    const rows = await c.tx.enrolment.findMany({ where: { academicYearId: a.yearId, sectionId: { in: a.classSections }, archivedAt: null }, select: { studentId: true } });
    return rows.map((r) => r.studentId);
  });
}

/** "Students present today": present / expected, with absent and late. */
const studentsPresent: Widget<"band"> = {
  id: "attendance.students-present",
  module: MODULE,
  kind: "band",
  homes: ["leader"],
  allowed: fullReach,
  async load(c) {
    const a = await access(c);
    if (a.students !== "all") return null;
    // The same class-wise rows as Attendance (the whole-school register) and the daily report.
    const t = await today(c);
    const href = `${BASE}/register`;
    if (t.off) return { id: "attendance.students-present", label: "Students present", ...offTile({ reason: t.offReason, title: t.off }), href };
    const expected = t.students.total;
    if (t.students.marked === 0) return { id: "attendance.students-present", label: "Students present", big: "Not taken", foot: `${plural(t.classes.notMarked, "class", "classes")} not marked yet`, href };
    // The same % as Attendance Reports and the register: present ÷ days counted (leave not counted).
    const pct = t.students.percent;
    const pctText = pct === null ? "Nobody counted" : `${pct}%`;
    // Students in a taken class who have no mark (new admissions, for example) are named, not counted as present.
    const unmarked = t.students.notMarked - t.classes.notMarkedStudents;
    return {
      id: "attendance.students-present", label: "Students present", big: n(t.students.present), of: `/ ${n(expected)}`,
      ring: pct ?? undefined,
      foot: t.classes.notMarked
        ? `${pctText} of marked · ${n(t.students.absent)} absent · ${plural(t.classes.notMarked, "class", "classes")} not marked`
        : `${pctText} · ${n(t.students.absent)} absent, ${n(t.students.late)} late${unmarked > 0 ? ` · ${n(unmarked)} not marked` : ""}`,
      href,
    };
  },
};

/** "Staff present": present / expected (not on leave), with on leave and not in yet. */
const staffPresent: Widget<"band"> = {
  id: "attendance.staff-present",
  module: MODULE,
  kind: "band",
  homes: ["leader", "hr"],
  async load(c) {
    const a = await access(c);
    if (a.staff !== "all") return null;
    // The same rule as Staff Attendance: a holiday or day off says so, it is not "0 present, everyone not in yet".
    const off = await schoolDayOff(c, a.campusId ?? c.viewer.campusId ?? null);
    const href = `${BASE}/staff`;
    if (!off.on) return { id: "attendance.staff-present", label: "Staff present", ...offTile(off), href };
    const rows = await staffDay(c.tx, c.viewer.ctx, a, c.today);
    const leave = rows.filter((r) => r.onLeave).length;
    const present = rows.filter((r) => r.mark && PRESENT.includes(r.mark.statusKey)).length;
    const notIn = rows.filter((r) => !r.mark && !r.onLeave).length;
    const expected = rows.length - leave;
    return {
      id: "attendance.staff-present", label: "Staff present", big: n(present), of: `/ ${n(expected)}`,
      ring: expected ? Math.round((present / expected) * 100) : undefined,
      foot: `${n(leave)} on leave · ${n(notIn)} not in yet`, href,
    };
  },
};

/** A subject teacher's periods with attendance taken today. */
const takenToday: Widget<"band"> = {
  id: "attendance.taken-today",
  module: MODULE,
  kind: "band",
  homes: ["teacher"],
  allowed: (v) => reach(v, MODULE, "edit") !== "none",
  async load(c) {
    const list = await choices(c);
    if (list.length === 0) return null;
    const done = list.filter((x) => x.done).length;
    const next = list.find((x) => !x.done);
    return {
      id: "attendance.taken-today", label: "Attendance taken", big: n(done), of: `/ ${n(list.length)}`,
      foot: next ? `${next.name}${next.periodNo ? `, period ${next.periodNo}` : ""} is waiting` : "All taken today",
      href: next ? attendanceTakeHref({ sectionId: next.sectionId, periodNo: next.periodNo, date: c.today }) : BASE,
    };
  },
};

/** The class teacher's own section today. */
const mySection: Widget<"band"> = {
  id: "attendance.my-section-today",
  module: MODULE,
  kind: "band",
  homes: ["class-teacher"],
  async load(c) {
    const a = await access(c);
    const sectionId = a.classSections[0];
    if (!sectionId || a.students === "none") return null;
    const section = await c.tx.section.findFirst({ where: { id: sectionId }, include: { schoolClass: { select: { name: true, campusId: true } } } });
    if (!section) return null;
    const name = `${section.schoolClass.name} ${section.name}`;
    const href = attendanceTakeHref({ sectionId, periodNo: 0, date: c.today });
    const off = await schoolDayOff(c, section.schoolClass.campusId);
    if (!off.on) return { id: "attendance.my-section-today", label: name, ...offTile(off), href: `${BASE}/register?section=${sectionId}` };
    const [count, t, s] = await Promise.all([
      // The students Take Attendance lists (on the register today).
      c.tx.enrolment.count({ where: { sectionId, archivedAt: null, status: "STUDYING", student: { archivedAt: null, status: { in: ON_REGISTER_STATUSES } } } }),
      attendanceToday(c.tx, c.viewer.ctx, c.today, { sectionIds: [sectionId] }),
      settings(c),
    ]);
    const lock = lockState(s, c.today, c.now, c.tz);
    const foot = `${plural(count, "student")} · ${lock.locked ? "locked" : "locks"} ${lock.atText}`;
    if (t.students.marked === 0) return { id: "attendance.my-section-today", label: name, big: "Not taken", foot, href };
    return { id: "attendance.my-section-today", label: name, big: n(t.students.present), of: `/ ${n(count)}`, ring: count ? Math.round((t.students.present / count) * 100) : undefined, foot, href };
  },
};

/** Student leave waiting for this person. */
const leaveWaiting: Widget<"band"> = {
  id: "attendance.student-leave",
  module: MODULE,
  kind: "band",
  homes: ["class-teacher", "office"],
  async load(c) {
    const a = await access(c);
    if (a.studentLeave === "none") return null;
    const own = a.studentLeave === "own" ? await ownStudents(c, a) : null;
    if (own && own.length === 0) return null;
    const count = await c.tx.leaveRequest.count({ where: { status: "WAITING", archivedAt: null, studentId: own ? { in: own } : { not: null } } });
    return { id: "attendance.student-leave", label: "Student leave", big: n(count), foot: count ? "Waiting for a decision" : "Nothing waiting", href: `${BASE}/student-leave?status=WAITING` };
  },
};

async function flagCard(c: DashContext, kind: "absent-streak" | "below-threshold"): Promise<AttentionItem | null> {
  const a = await access(c);
  if (a.students === "none") return null;
  const own = a.students === "all" ? null : await ownStudents(c, a);
  if (own && own.length === 0) return null;
  // Reviewed in Early Warnings, for the people who see it; the Chronic absence report otherwise.
  const warnings = moduleOpen(c.viewer, "reports-analytics") && reportAccess(c.viewer).warnings.on;
  // People who see Early Warnings count these children on its card (students who need a closer look), once.
  if (kind === "below-threshold" && warnings) return null;
  const flags = await c.tx.attendanceFlag.findMany({ where: { kind, ...OPEN_ATTENDANCE_FLAG, ...(own ? { studentId: { in: own } } : {}) }, select: { studentId: true, status: true } });
  const count = new Set(flags.map((f) => f.studentId)).size;
  if (count === 0) return null;
  const s = await settings(c);
  const notReviewed = new Set(flags.filter((f) => f.status === "NEW").map((f) => f.studentId)).size;
  const review = warnings && notReviewed ? ` ${notReviewed} not reviewed yet.` : "";
  const href = warnings ? "/reports-analytics/early-warnings?area=attendance" : `${BASE}/reports?report=chronic`;
  return kind === "absent-streak"
    ? {
        id: "attendance.absent-streak", tone: "warn", icon: "UserX",
        title: `${plural(count, "student")} absent ${s.chronicDays} days in a row`,
        detail: `Call the parents. The card goes when they are marked present.${review}`, action: "See students",
        href, value: String(count),
      }
    : {
        id: "attendance.below-threshold", tone: "bad", icon: "TrendingDown",
        title: `${plural(count, "student")} below ${s.thresholdPercent}% attendance`,
        detail: `This academic year, from the Attendance Register.${review}`, action: "Review",
        href, value: String(count),
      };
}

const absentStreak: Widget<"attention"> = { id: "attendance.absent-streak", module: MODULE, kind: "attention", homes: ["leader", "class-teacher"], load: (c) => flagCard(c, "absent-streak") };
// For people without Early Warnings (it is off, or not open to their role); the Early Warnings card counts these children for the others.
const belowThreshold: Widget<"attention"> = { id: "attendance.below-threshold", module: MODULE, kind: "attention", homes: ["leader", "academic-head", "class-teacher"], load: (c) => flagCard(c, "below-threshold") };

/** "Take attendance for 7 B · locks at 11:00 AM" for the class teacher's sections not yet marked. */
const notTaken: Widget<"attention"> = {
  id: "attendance.not-taken",
  module: MODULE,
  kind: "attention",
  homes: ["class-teacher"],
  allowed: (v) => reach(v, MODULE, "edit") !== "none",
  async load(c) {
    const a = await access(c);
    const off = await schoolDayOff(c, a.campusId);
    if (!off.on || a.classSections.length === 0) return [];
    const s = await settings(c);
    const lock = lockState(s, c.today, c.now, c.tz);
    const all = await choices(c);
    // The day's first mark for the section decides (once a day, or the first period).
    const first = (sectionId: string) => Math.min(...all.filter((y) => y.sectionId === sectionId).map((y) => y.periodNo));
    const mine = all.filter((x) => a.classSections.includes(x.sectionId) && !x.done && x.periodNo === first(x.sectionId));
    return mine.map((x): AttentionItem => ({
      id: `attendance.not-taken:${x.sectionId}`, tone: lock.locked ? "bad" : "warn", icon: "ClipboardCheck",
      title: lock.locked ? `Attendance for ${x.name} was not taken` : `Take attendance for ${x.name}`,
      detail: lock.locked ? `It locked at ${lock.atText}. Ask for a correction.` : `Locks at ${lock.atText}`,
      action: "Take attendance", href: attendanceTakeHref({ sectionId: x.sectionId, periodNo: x.periodNo, date: c.today }), value: iso(c.today),
    }));
  },
};

/** "Attendance this week": % present by class, Monday to today. */
const weekByClass: Widget<"panel"> = {
  id: "attendance.week-by-class",
  module: MODULE,
  kind: "panel",
  homes: ["leader", "academic-head"],
  allowed: fullReach,
  async load(c) {
    if (!c.year) return null;
    const monday = addDays(c.today, -((c.today.getUTCDay() + 6) % 7));
    // The class-wise rows of the week (the same source as Attendance and Reports), added up per class.
    const cw = await classWise(c.tx, c.viewer.ctx, { yearId: c.year.id, from: monday, to: c.today, today: c.today, campusId: c.viewer.campusId ?? null });
    const byClass = new Map<string, { label: string; sort: number; weight: number; counted: number }>();
    for (const sec of cw.sections) {
      if (sec.counted === 0) continue;
      const row = byClass.get(sec.classId) ?? { label: sec.className, sort: sec.sort, weight: 0, counted: 0 };
      row.weight += sec.weight;
      row.counted += sec.counted;
      byClass.set(sec.classId, row);
    }
    const s = await settings(c);
    const rows: BarRow[] = [...byClass.entries()].sort((a, b) => a[1].sort - b[1].sort)
      .map(([id, r]) => ({ key: id, label: r.label, value: Math.round((r.weight / r.counted) * 100), href: `${BASE}/register?period=thisweek` }));
    return {
      slot: "main",
      panel: {
        kind: "bars", title: "Attendance this week", sub: "Students present by class, Monday to today", icon: "UserCheck",
        rows, goal: 90, lowBelow: s.thresholdPercent, href: `${BASE}/reports?report=trends`, linkLabel: "Attendance Reports",
        empty: "No attendance marked this week yet.",
      },
    };
  },
};

export const ATTENDANCE_WIDGETS: readonly Widget[] = [studentsPresent, staffPresent, takenToday, mySection, leaveWaiting, notTaken, absentStreak, belowThreshold, weekByClass];
