// Roll Call (15 §2 Roll Call & Incidents): morning and night roll call of a
// hostel, the same way as Take Attendance: everyone present to start with,
// students out on an approved pass already marked On outing or On leave, the
// warden changes the exceptions and saves. A student absent at night roll
// call and not out on a pass alerts the hostel's wardens and the Principal at
// once (inferred).
import "server-only";

import type { RollCallMarkKind, RollCallSession } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { instantOf } from "../front-office/time";
import { studentsInfo, type StudentInfo } from "./allocation";
import { alertStaff, rollCallLink } from "./messages";
import { HostelProblem } from "./problem";
import { hostelSettings, wardenLogins } from "./settings";
import { notify } from "../notifications";
import { BASE, SESSION, isoOf, plural } from "./words";

export type SheetRow = { student: StudentInfo; roomNo: string; floor: string; bedNo: number; away: { mark: "OUTING" | "LEAVE"; passId: string; passNo: string; toAt: Date | null; withName: string | null } | null; mark: RollCallMarkKind };

/** The default session by the time of day: morning until 2 PM, then night. */
export const defaultSession = (minuteOfDay: number): RollCallSession => (minuteOfDay < 14 * 60 ? "MORNING" : "NIGHT");

/** The moment a roll call is about: its set time on that day (or now, for today's roll call taken early). */
async function rollMoment(tx: Tx, ctx: SchoolContext, date: Date, session: RollCallSession, tz: string, now: Date) {
  const s = await hostelSettings(tx, ctx);
  const at = instantOf(isoOf(date), session === "MORNING" ? s.morningRollMinute : s.nightRollMinute, tz);
  return at.getTime() > now.getTime() ? now : at;
}

/**
 * The roll call sheet of one hostel on one day and session: the students
 * living there then (checked in), each with the saved mark, or the start
 * mark (Present, or On outing / On leave when out on a pass).
 */
export async function rollSheet(tx: Tx, ctx: SchoolContext, hostelId: string, date: Date, session: RollCallSession, tz: string, now: Date) {
  const at = await rollMoment(tx, ctx, date, session, tz, now);
  const saved = await tx.rollCall.findUnique({ where: { hostelId_date_session: { hostelId, date, session } }, include: { marks: true } });
  const allocs = await tx.bedAllocation.findMany({
    where: { hostelId, checkedInAt: { not: null, lte: at }, startDate: { lte: date }, OR: [{ status: "ACTIVE" }, { endedAt: { gt: at } }] },
  });
  // A student moved between beds of the same hostel appears once.
  const byStudent = new Map<string, (typeof allocs)[number]>();
  for (const a of allocs) {
    const had = byStudent.get(a.studentId);
    if (!had || a.startDate > had.startDate) byStudent.set(a.studentId, a);
  }
  const ids = [...byStudent.keys(), ...(saved?.marks.map((m) => m.studentId) ?? [])];
  const [info, rooms, beds, passes] = await Promise.all([
    studentsInfo(tx, ctx, ids),
    tx.hostelRoom.findMany({ where: { id: { in: [...byStudent.values()].map((a) => a.roomId) } }, select: { id: true, roomNo: true, floor: true } }),
    tx.hostelBed.findMany({ where: { id: { in: [...byStudent.values()].map((a) => a.bedId) } }, select: { id: true, bedNo: true } }),
    tx.gatePass.findMany({ where: { kind: "HOSTEL_OUTING", archivedAt: null, studentId: { in: ids }, leftAt: { not: null, lte: at }, OR: [{ returnedAt: null, status: "OUT" }, { returnedAt: { gt: at } }] } }),
  ]);
  const natural = new Intl.Collator("en", { numeric: true });
  const rows: SheetRow[] = [];
  for (const id of new Set(ids)) {
    const student = info.get(id);
    if (!student) continue;
    const a = byStudent.get(id);
    const room = a ? rooms.find((r) => r.id === a.roomId) : undefined;
    const p = passes.find((x) => x.studentId === id);
    const away = p ? { mark: (p.outingType === "LEAVE" ? "LEAVE" : "OUTING") as "OUTING" | "LEAVE", passId: p.id, passNo: p.passNo, toAt: p.toAt, withName: p.collectorName } : null;
    const savedMark = saved?.marks.find((m) => m.studentId === id)?.mark;
    rows.push({ student, roomNo: room?.roomNo ?? "", floor: room?.floor ?? "", bedNo: a ? beds.find((b) => b.id === a.bedId)?.bedNo ?? 0 : 0, away, mark: savedMark ?? away?.mark ?? "PRESENT" });
  }
  rows.sort((x, y) => natural.compare(x.roomNo, y.roomNo) || x.bedNo - y.bedNo || x.student.name.localeCompare(y.student.name));
  return { rows, saved, at };
}

export type SaveRollInput = { hostelId: string; date: Date; session: RollCallSession; absentIds: string[] };

/** Saves a roll call (or changes a saved one). Absent at night and not on a pass alerts the warden and the Principal at once. */
export async function saveRollCall(tx: Tx, ctx: SchoolContext, input: SaveRollInput, opts: { now: Date; tz: string; today: Date }) {
  if (input.date.getTime() > opts.today.getTime()) throw new HostelProblem("Roll call cannot be taken for a day that has not come yet.", "date");
  if (input.date.getTime() < opts.today.getTime() - 7 * 86_400_000) throw new HostelProblem("Roll calls older than 7 days cannot be changed.", "date");
  const hostel = await tx.hostel.findFirst({ where: { id: input.hostelId, archivedAt: null } });
  if (!hostel) throw new HostelProblem("Choose a hostel.", "hostelId");
  const sheet = await rollSheet(tx, ctx, hostel.id, input.date, input.session, opts.tz, opts.now);
  if (!sheet.rows.length) throw new HostelProblem(`Nobody lived in ${hostel.name} at that time, so there is no roll call to take.`);
  const absent = new Set(input.absentIds);
  const unknown = [...absent].filter((id) => !sheet.rows.some((r) => r.student.id === id));
  if (unknown.length) throw new HostelProblem("The list changed while you were marking. Refresh the page and mark again.");
  const before = new Set(sheet.saved?.marks.filter((m) => m.mark === "ABSENT").map((m) => m.studentId) ?? []);

  const marks = sheet.rows.map((r) => ({ studentId: r.student.id, mark: (r.away ? r.away.mark : absent.has(r.student.id) ? "ABSENT" : "PRESENT") as RollCallMarkKind, gatePassId: r.away?.passId ?? null }));
  const count = (k: RollCallMarkKind) => marks.filter((m) => m.mark === k).length;
  const data = { takenById: ctx.userId, takenAt: opts.now, presentCount: count("PRESENT"), absentCount: count("ABSENT"), awayCount: count("OUTING") + count("LEAVE") };
  const rc = sheet.saved
    ? await tx.rollCall.update({ where: { id: sheet.saved.id }, data })
    : await tx.rollCall.create({ data: { schoolId: ctx.schoolId, hostelId: hostel.id, date: input.date, session: input.session, ...data } });
  for (const m of marks) {
    await tx.rollCallMark.upsert({
      where: { rollCallId_studentId: { rollCallId: rc.id, studentId: m.studentId } },
      create: { schoolId: ctx.schoolId, rollCallId: rc.id, studentId: m.studentId, mark: m.mark, gatePassId: m.gatePassId },
      update: { mark: m.mark, gatePassId: m.gatePassId },
    });
  }
  const absentees = sheet.rows.filter((r) => marks.find((m) => m.studentId === r.student.id)?.mark === "ABSENT");
  await writeAudit(tx, ctx, {
    action: sheet.saved ? "changed" : "taken", recordType: "Roll Call", recordId: rc.id,
    before: sheet.saved ? { absent: sheet.saved.absentCount } : undefined,
    after: { hostel: hostel.name, date: isoOf(input.date), session: SESSION[input.session], present: data.presentCount, absent: data.absentCount, away: data.awayCount, absentees: absentees.map((r) => r.student.name) },
  });

  // Night roll call: an unexplained absence alerts the warden and the Principal at once.
  const fresh = absentees.filter((r) => !before.has(r.student.id));
  let alerted = 0;
  const s = await hostelSettings(tx, ctx);
  if (input.session === "NIGHT" && fresh.length && s.alertNightAbsent) {
    const names = fresh.slice(0, 4).map((r) => `${r.student.name} (Room ${r.roomNo})`).join(", ");
    alerted = await alertStaff(tx, ctx, hostel.id, {
      text: `${plural(fresh.length, "student")} absent at night roll call, ${hostel.name}: ${names}${fresh.length > 4 ? ` and ${fresh.length - 4} more` : ""}.`,
      link: rollCallLink(hostel.id, isoOf(input.date), "night"), groupKey: `hostel-night-${rc.id}`, principal: true,
    });
    await tx.rollCall.update({ where: { id: rc.id }, data: { alertedAt: opts.now } });
  }
  return { rollCall: rc, hostel, present: data.presentCount, absent: data.absentCount, away: data.awayCount, alerted, absentees: absentees.map((r) => r.student.name) };
}

/** A leader's reminder to the hostel's wardens that a roll call is not taken yet. */
export async function remindRollCall(tx: Tx, ctx: SchoolContext, hostelId: string, date: Date, session: RollCallSession) {
  const hostel = await tx.hostel.findFirst({ where: { id: hostelId, archivedAt: null } });
  if (!hostel) throw new HostelProblem("This hostel was not found.");
  const done = await tx.rollCall.findUnique({ where: { hostelId_date_session: { hostelId, date, session } } });
  if (done) throw new HostelProblem(`${SESSION[session]} roll call is already taken.`);
  const people = await wardenLogins(tx, hostelId);
  if (!people.length) throw new HostelProblem(`${hostel.name} has no warden with a School OS login. Set its wardens in Hostel Settings.`);
  for (const to of people) {
    await notify(tx, ctx, { to, type: "hostel", text: `Reminder: ${SESSION[session].toLowerCase()} roll call for ${hostel.name} on ${formatDate(date, "UTC")} is not taken yet.`, link: rollCallLink(hostelId, isoOf(date), session), groupKey: `hostel-remind-${hostelId}-${isoOf(date)}-${session}` });
  }
  await writeAudit(tx, ctx, { action: "reminded", recordType: "Roll Call", recordId: hostelId, after: { hostel: hostel.name, date: isoOf(date), session: SESSION[session], to: people.length } });
  return { hostel: hostel.name, people: people.length };
}

/** Each day's roll calls of a hostel in a range (for the month calendar and the history). */
export async function rollHistory(tx: Tx, hostelIds: string[], from: Date, to: Date) {
  return tx.rollCall.findMany({ where: { hostelId: { in: hostelIds }, date: { gte: from, lte: to } }, orderBy: [{ date: "desc" }, { session: "desc" }] });
}

export const rollHref = (hostelId: string, date: string, session: RollCallSession) => `${BASE}?hostel=${hostelId}&date=${date}&session=${session.toLowerCase()}`;
