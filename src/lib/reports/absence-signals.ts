// Absence reasons in Early Warnings and Looking ahead (gap list P1.8; 05
// Attendance, "Absence reasons"). Kept here so warnings.ts and forecasts.ts
// only call in:
// - attendance rows (Attendance Flag rows from attendance-rows.ts, and the
//   Watch-line Risk Flags of students no Attendance Flag covers) show the
//   reason mix in their basis; many "Not known yet" absences turn a Watch into
//   Act now; absences that were mostly sick days or approved leave turn an Act
//   now above the threshold into a Watch;
// - "Fees dispute" absences are fee signals (only fee roles see fee flags; Watch,
//   like every fee flag: an accounts matter, strength.ts), and
//   attendance flags, which teachers see, count them as Other;
// - "may be thinking of leaving" (forecasts.ts) counts many "Not known yet"
//   absences (UNEXPLAINED_ALONE) as one strong sign.
// Schools without absence reasons have no reasons recorded, so nothing changes.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { BUILT_MODULES } from "../modules";
import { explained, FEE_REASON, mixText, mostlyExplained, mostlyUnexplained, reasonMix, unexplained, type ReasonMix } from "../attendance/absence-reasons";

type Area = "attendance" | "marks" | "fees";
export type SignalLike = { studentId: string; sectionId: string | null; area: Area; strength: "WATCH" | "ACT_NOW"; reason: string; basis: string; value: number | null };

/** "Not known yet" absences that are a strong sign towards "may be thinking of leaving" (forecasts.ts). */
export const UNEXPLAINED_ALONE = 5;

type AttendanceRow = { strength: "WATCH" | "ACT_NOW"; reason: string; basis: string; value: number | null };

/** One attendance row (a signal or an Attendance Flag row) weighed by the student's reason mix; its value is the attendance %. */
function weigh<R extends AttendanceRow>(r: R, m: ReasonMix | undefined, o: { threshold: number; streakDays: number }): R {
  const text = mixText(m, false);
  if (!m || !text) return r;
  const reasons = r.reason.split("\n");
  const basis = r.basis.split("\n");
  basis[0] = `${basis[0]} · absence reasons: ${text}`;
  let strength = r.strength;
  if (strength === "WATCH" && mostlyUnexplained(m, Math.max(3, o.streakDays))) {
    strength = "ACT_NOW";
    reasons.push(`${unexplained(m)} of ${m.absent} absent days have no reason known yet`);
    basis.push("Absence reasons in the register · many not known yet is a stronger signal");
  } else if (strength === "ACT_NOW" && (r.value === null || r.value >= o.threshold) && mostlyExplained(m)) {
    strength = "WATCH";
    reasons.push(`Most absent days were sick days or approved leave (${explained(m)} of ${m.absent})`);
    basis.push("Absence reasons in the register and approved Student Leave");
  }
  return { ...r, strength, reason: reasons.join("\n"), basis: basis.join("\n") };
}

/**
 * Early Warnings rows from Attendance Flags (attendance-rows.ts), weighed by
 * this year's absence reasons. Open rows only: a closed row keeps the words it
 * was closed with.
 */
export async function weighAttendanceRows<R extends AttendanceRow & { studentId: string; status: string }>(tx: Tx, ctx: SchoolContext, rows: R[], o: { from: Date; today: Date; threshold: number; streakDays: number }): Promise<R[]> {
  const open = rows.filter((r) => r.status !== "CLOSED");
  if (!open.length || o.today < o.from) return rows;
  const mixes = await reasonMix(tx, ctx, [...new Set(open.map((r) => r.studentId))], o.from, o.today);
  if (!mixes.size) return rows;
  return rows.map((r) => (r.status === "CLOSED" ? r : weigh(r, mixes.get(r.studentId), o)));
}

/**
 * Early Warnings: the signals worked out from attendance, marks and fees,
 * adjusted by the absence reasons recorded this year. Attendance signals carry
 * the attendance % as their value.
 */
export async function withAbsenceReasons<S extends SignalLike>(tx: Tx, ctx: SchoolContext, signals: S[], o: {
  from: Date; today: Date; enrol: Map<string, string>; threshold: number; streakDays: number;
}): Promise<SignalLike[]> {
  if (o.today < o.from) return signals;
  const mixes = await reasonMix(tx, ctx, [...o.enrol.keys()], o.from, o.today);
  if (!mixes.size) return signals;
  const out: SignalLike[] = signals.map((s) => (s.area === "attendance" ? weigh(s, mixes.get(s.studentId), o) : s));
  if (!BUILT_MODULES.has("fee-management")) return out;
  for (const [id, m] of mixes) {
    const n = m.by[FEE_REASON] ?? 0;
    if (!n || !o.enrol.has(id)) continue;
    const line = `Absent ${n} school ${n === 1 ? "day" : "days"} this year with the reason Fees dispute`;
    const lineBasis = "Absence reasons in the attendance register";
    const i = out.findIndex((x) => x.studentId === id && x.area === "fees");
    if (i >= 0) out[i] = { ...out[i], reason: `${out[i].reason}\n${line}`, basis: `${out[i].basis}\n${lineBasis}` };
    else out.push({ studentId: id, sectionId: o.enrol.get(id) ?? null, area: "fees", strength: "WATCH", reason: line, basis: lineBasis, value: null });
  }
  return out;
}
