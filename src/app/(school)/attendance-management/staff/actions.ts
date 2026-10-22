"use server";

// Staff Attendance (05 §2): manual marking, overtime and shifts. Every rule
// is checked again in src/lib/attendance/staff.ts.

import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import type { FormState } from "@/lib/forms";
import { dateOf, FieldProblem, id, optionalId, str, UUID_RE } from "@/lib/staff/act";
import { todayIn } from "@/lib/staff/dates";
import { act, problemState } from "@/lib/attendance/act";
import { actionContext } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { archiveOvertime, assignShift, recordOvertime, saveShift, saveStaffAttendance, setShiftArchived, type StaffEntry } from "@/lib/attendance/staff";
import { HHMM, minutesText } from "@/lib/attendance/time";

export type StaffSaveResult = { ok: boolean; message: string; link?: { href: string; label: string } };

/** Saves a day's staff attendance from the list (mark all present, then the exceptions). */
export async function saveStaffDay(payload: { date: string; entries: StaffEntry[] }): Promise<StaffSaveResult> {
  if (!payload || !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date)) || !Array.isArray(payload.entries) || payload.entries.length > 2000) {
    return { ok: false, message: "This attendance could not be read. Reload the page and try again." };
  }
  const entries: StaffEntry[] = [];
  for (const e of payload.entries) {
    if (!e || !UUID_RE.test(String(e.staffId)) || typeof e.statusKey !== "string" || e.statusKey.length > 40) return { ok: false, message: "This attendance could not be read. Reload the page and try again." };
    const t = (v: unknown) => (typeof v === "string" && HHMM.test(v) ? v : null);
    entries.push({ staffId: e.staffId, statusKey: e.statusKey, inTime: t(e.inTime), outTime: t(e.outTime), note: typeof e.note === "string" ? e.note.slice(0, 300) : null });
  }
  try {
    const { current } = await requireAction("attendance-management", "edit");
    const { access } = await actionContext(current);
    const r = await withSchool(current.ctx, (tx) => saveStaffAttendance(tx, current.ctx, access, { date: new Date(`${payload.date}T00:00:00Z`), entries, now: new Date(), timeZone: current.school.timeZone }), { timeout: 30_000 });
    revalidatePath(BASE, "layout");
    const cover = r.periodsToCover ? ` ${r.periodsToCover} ${r.periodsToCover === 1 ? "period needs" : "periods need"} a substitute: they are listed in Substitutions.` : "";
    return { ok: true, message: r.changed ? `Staff attendance saved: ${r.changed} ${r.changed === 1 ? "change" : "changes"}.${cover}` : "Saved. Nothing had changed." };
  } catch (e) {
    const s = problemState(e);
    return { ok: false, message: s.message ?? "That did not save.", link: (s.data as { link?: { href: string; label: string } } | undefined)?.link };
  }
}

function hoursToMinutes(fd: FormData) {
  const v = str(fd, "hours").replace(",", ".");
  const n = Number(v);
  if (!v || !Number.isFinite(n) || n <= 0) throw new FieldProblem("Enter the overtime in hours, like 1.5.", "hours");
  const minutes = Math.round(n * 60);
  if (minutes < 15 || minutes > 16 * 60) throw new FieldProblem("Overtime must be between 15 minutes (0.25) and 16 hours.", "hours");
  return minutes;
}

export async function recordOvertimeAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current } = await requireAction("attendance-management", "create");
    const { access } = await actionContext(current);
    const input = { staffId: id(fd, "staffId", "staff member"), date: dateOf(fd, "date", "Date"), minutes: hoursToMinutes(fd), note: str(fd, "note").slice(0, 300) || null, today: todayIn(current.school.timeZone) };
    const r = await withSchool(current.ctx, (tx) => recordOvertime(tx, current.ctx, access, input));
    return { name: r.staff.fullName, minutes: input.minutes };
  }, (r) => `Overtime recorded: ${r.name}, ${minutesText(r.minutes)}.`);
}

export async function archiveOvertimeAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current } = await requireAction("attendance-management", "archive");
    const { access } = await actionContext(current);
    await withSchool(current.ctx, (tx) => archiveOvertime(tx, current.ctx, access, id(fd, "overtimeId", "overtime entry")));
    return {};
  }, () => "Overtime entry archived. It no longer counts towards salary.");
}

export async function saveShiftAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current } = await requireAction("attendance-management", "edit");
    const { access } = await actionContext(current);
    const late = str(fd, "lateAfterMin");
    const lateAfterMin = late === "" ? null : Number.parseInt(late, 10);
    if (lateAfterMin !== null && (!Number.isInteger(lateAfterMin) || lateAfterMin < 0 || lateAfterMin > 240)) throw new FieldProblem("Late after must be between 0 and 240 minutes, or empty.", "lateAfterMin");
    const row = await withSchool(current.ctx, (tx) => saveShift(tx, current.ctx, access, { id: optionalId(fd, "shiftId"), name: str(fd, "name").slice(0, 60), startTime: str(fd, "startTime"), endTime: str(fd, "endTime"), lateAfterMin }));
    return { name: row.name };
  }, (r) => `Shift "${r.name}" saved.`);
}

export async function archiveShiftAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current } = await requireAction("attendance-management", "archive");
    const { access } = await actionContext(current);
    const archived = str(fd, "restore") !== "1";
    const row = await withSchool(current.ctx, (tx) => setShiftArchived(tx, current.ctx, access, id(fd, "shiftId", "shift"), archived));
    return { name: row.name, archived };
  }, (r) => (r.archived ? `Shift "${r.name}" archived. Staff on it follow the school's start time from now.` : `Shift "${r.name}" restored.`));
}

export async function assignShiftAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current } = await requireAction("attendance-management", "edit");
    const { access } = await actionContext(current);
    const staffIds = fd.getAll("staffIds").map(String).filter((v) => UUID_RE.test(v));
    const r = await withSchool(current.ctx, (tx) => assignShift(tx, current.ctx, access, { staffIds, shiftId: id(fd, "shiftId", "shift"), fromDate: dateOf(fd, "fromDate", "From date") }));
    return { name: r.shift.name, count: r.count };
  }, (r) => `${r.count} staff ${r.count === 1 ? "member is" : "members are"} now on the "${r.name}" shift.`);
}
