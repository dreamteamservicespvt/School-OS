// Leave balances at go-live (workflow 15, gap list G19). A school that starts
// on School OS part way through the year brings in, for each staff member and
// leave type, the days left at go-live (or the days already taken this year)
// from the old software. Each row becomes one adjustment on that person's
// Leave Balance for the year, marked "Brought in", so the days left on Staff
// Leave, the leave check and the loss of pay in salary are right from the
// first day. Leave taken in School OS since go-live still counts as usual.
//
// Brought in from Staff & HR Management, Import staff, or Switching to School
// OS, by people with full Staff & HR (HR, the Principal, the School Admin), as
// for adjusting a balance by hand. A person limited to one campus brings in
// that campus's staff only. Undo adds the opposite adjustment, so the history
// shows both. Imported by src/lib/import-registry.ts.
import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { defineImport, RowProblem, type ImportKind, type UpdatedRow } from "../importer";
import { writeAudit } from "../audit";
import { isYearClosed } from "../academic/years";
import { moveInGoLive } from "../move-in/live";
import { campusLimitOf } from "./campus-logins";
import { todayIn } from "./dates";
import { balancesFor, ensureBalances, leaveYearFor, type Adjustment } from "./leave";

export const LEAVE_BALANCES_IMPORT = "staff-leave-balances";

type Row = { staffId: string; staffName: string; typeId: string; typeName: string; yearId: string; left: number | null; taken: number | null };

/** Days like 8 or 2.5; null when empty; NaN when it is not a number of days. */
function daysIn(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  if (!/^\d{1,3}(\.\d)?$/.test(v)) return NaN;
  const n = Number(v);
  return Math.round(n * 2) === n * 2 ? n : NaN;
}

const dayWord = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** A "Brought in" adjustment still standing (not taken back by Undo). */
export function broughtInStanding(adjustments: Adjustment[]): Adjustment | null {
  const undone = new Set(adjustments.filter((a) => a.kind === "brought-in-undone").map((a) => a.ref));
  return adjustments.find((a) => a.kind === "brought-in" && !undone.has(a.ref)) ?? null;
}

function makeKind(): ImportKind<Row> {
  const memo = new WeakMap<Set<string>, { day: Promise<Date>; limit: Promise<string | null> }>();
  const lookups = (tx: Tx, ctx: SchoolContext, seen: Set<string>) => {
    let m = memo.get(seen);
    if (!m) {
      // The balance belongs to the leave year holding the go-live date (today, when none is set).
      const day = Promise.all([moveInGoLive(tx, ctx), tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } })])
        .then(([goLive, s]) => goLive ?? todayIn(s?.timeZone));
      m = { day, limit: campusLimitOf(tx, ctx) };
      memo.set(seen, m);
    }
    return m;
  };
  return {
    key: LEAVE_BALANCES_IMPORT,
    label: "Leave balances",
    columns: [
      { key: "staffId", label: "Staff ID", required: true, example: "SPS-ST-001", help: "The staff ID in Staff & HR.", aliases: ["staff_id", "staff code", "employee id", "emp id", "emp code", "staff no"] },
      { key: "leaveType", label: "Leave type", required: true, example: "Casual Leave", help: "The leave type's name or code in HR Settings, such as Casual Leave or CL.", aliases: ["type", "leave", "leave name", "leave code"] },
      { key: "daysLeft", label: "Days left", example: "8", help: "Days of this leave left on the go-live date. Fill this or Days taken.", aliases: ["balance", "leave balance", "closing balance", "available", "remaining", "days remaining", "left"] },
      { key: "daysTaken", label: "Days taken", example: "4", help: "Days of this leave already taken this year before School OS. Fill this or Days left.", aliases: ["taken", "used", "availed", "days used", "leave taken", "leaves taken"] },
    ],
    leaveOut: (row) => (!(row.daysLeft ?? "").trim() && !(row.daysTaken ?? "").trim() ? "No leave balance" : null),
    withOptions: () => makeKind(),
    async check(tx, ctx, row, seen) {
      const problems: string[] = [];
      const l = lookups(tx, ctx, seen);
      const [onDay, limit] = await Promise.all([l.day, l.limit]);
      const code = (row.staffId ?? "").trim();
      // One campus: a staff ID of another campus reads as "no staff with ID", like one that does not exist.
      const staff = code ? await tx.staff.findFirst({ where: { staffCode: { equals: code, mode: "insensitive" }, archivedAt: null, ...(limit ? { campusId: limit } : {}) }, select: { id: true, fullName: true, campusId: true } }) : null;
      if (code && !staff) problems.push(`No staff member has the staff ID ${code}.`);
      const t = (row.leaveType ?? "").trim();
      const type = t ? await tx.leaveType.findFirst({ where: { forWhom: "staff", archivedAt: null, OR: [{ name: { equals: t, mode: "insensitive" } }, { code: { equals: t, mode: "insensitive" } }] } }) : null;
      if (t && !type) problems.push(`Leave type "${t}" is not in HR Settings. Use a name or code from the list there.`);
      else if (type && !type.paid) problems.push(`${type.name} is unpaid and has no balance. Leave this row out.`);
      if (staff && type) {
        if (seen.has(`${staff.id}:${type.id}`)) problems.push(`${staff.fullName}, ${type.name} is twice in the file. Keep one row for each staff member and leave type.`);
        seen.add(`${staff.id}:${type.id}`);
      }
      const left = daysIn(row.daysLeft ?? "");
      const taken = daysIn(row.daysTaken ?? "");
      if (Number.isNaN(left)) problems.push("Days left must be a number of days, like 8 or 2.5.");
      if (Number.isNaN(taken)) problems.push("Days taken must be a number of days, like 4 or 1.5.");
      if (left !== null && taken !== null && !Number.isNaN(left) && !Number.isNaN(taken)) problems.push("Fill Days left or Days taken, not both.");
      if (problems.length || !staff || !type) return { ok: false, problems };
      const year = await leaveYearFor(tx, ctx, onDay, staff.campusId);
      if (!year) return { ok: false, problems: [`There is no academic year on ${staff.fullName}'s campus for the go-live date. Add it in Academic Management first.`] };
      if (await isYearClosed(tx, year.id)) return { ok: false, problems: [`${year.name} is closed. Leave balances of a closed year cannot change.`] };
      const balance = await tx.leaveBalance.findFirst({ where: { academicYearId: year.id, staffId: staff.id, leaveTypeId: type.id, archivedAt: null }, select: { adjustments: true } });
      const had = broughtInStanding((balance?.adjustments ?? []) as Adjustment[]);
      if (had) return { ok: false, problems: [`${staff.fullName}'s ${type.name} balance is already brought in (${had.reason.replace(/^Brought in from the old software: /, "")}). Undo that import first to bring it in again.`] };
      return { ok: true, value: { staffId: staff.id, staffName: staff.fullName, typeId: type.id, typeName: type.name, yearId: year.id, left, taken } };
    },
    async save(tx, ctx, v) {
      await ensureBalances(tx, ctx, [v.staffId], v.yearId);
      const now = await balancesFor(tx, ctx, [v.staffId], v.yearId);
      const row = now.get(v.staffId)?.find((r) => r.type.id === v.typeId);
      const existing = row?.balanceId ? await tx.leaveBalance.findUnique({ where: { id: row.balanceId } }) : null;
      const balance = existing ?? await tx.leaveBalance.create({ data: { schoolId: ctx.schoolId, academicYearId: v.yearId, staffId: v.staffId, leaveTypeId: v.typeId, daysGiven: 0 } });
      const adjustments = (balance.adjustments ?? []) as Adjustment[];
      if (broughtInStanding(adjustments)) throw new RowProblem(`${v.staffName}'s ${v.typeName} balance is already brought in.`);
      // Days left at go-live: the year's days given and earlier adjustments move to that number. Leave taken
      // in School OS since go-live still comes off it, as on any balance.
      const days = v.left !== null ? v.left - ((row?.given ?? 0) + (row?.adjusted ?? 0)) : -(v.taken ?? 0);
      const reason = v.left !== null ? `Brought in from the old software: ${dayWord(v.left)} left at go-live` : `Brought in from the old software: ${dayWord(v.taken ?? 0)} taken before School OS`;
      const ref = randomUUID();
      const adj: Adjustment = { days, reason, byId: ctx.userId, at: new Date().toISOString(), kind: "brought-in", ref };
      await tx.leaveBalance.update({ where: { id: balance.id }, data: { adjustments: [...adjustments, adj] as unknown as Prisma.InputJsonValue } });
      await writeAudit(tx, ctx, { action: "leave-balance-adjusted", recordType: "Leave Balance", recordId: balance.id, before: { adjustments: adjustments.length }, after: { staff: v.staffName, leaveType: v.typeName, ...adj } as unknown as Prisma.InputJsonValue });
      return { id: balance.id, created: false, before: { ref }, after: { ref, days, staff: v.staffName, leaveType: v.typeName } };
    },
    async undo() {
      // Nothing is created: each row adds an adjustment to a balance, taken back by revert below.
    },
    async revert(tx, ctx, rows: UpdatedRow[]) {
      let back = 0;
      for (const r of rows) {
        const ref = String(r.after.ref ?? "");
        const balance = ref ? await tx.leaveBalance.findUnique({ where: { id: r.id } }) : null;
        if (!balance) continue;
        const adjustments = (balance.adjustments ?? []) as Adjustment[];
        const mine = adjustments.find((a) => a.kind === "brought-in" && a.ref === ref);
        if (!mine || adjustments.some((a) => a.kind === "brought-in-undone" && a.ref === ref)) continue;
        const undo: Adjustment = { days: -mine.days, reason: "Import of leave balances undone", byId: ctx.userId, at: new Date().toISOString(), kind: "brought-in-undone", ref };
        await tx.leaveBalance.update({ where: { id: balance.id }, data: { adjustments: [...adjustments, undo] as unknown as Prisma.InputJsonValue } });
        back++;
      }
      await writeAudit(tx, ctx, { action: "leave-balance-adjusted", recordType: "Leave Balance", recordId: null, after: { reason: "Import of leave balances undone", balances: back } });
      return back;
    },
  };
}

defineImport(makeKind());
