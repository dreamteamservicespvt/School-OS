// Absence reasons in Early Warnings and Looking ahead (gap list P1.8; 05
// Attendance, "Absence reasons"). Kept here so warnings.ts and forecasts.ts
// only call in:
// - attendance flags show the reason mix in their basis; many "Not known yet"
//   absences turn a Watch into Act now; absences that were mostly sick days or
//   approved leave turn an Act now above the threshold into a Watch;
// - "Fees dispute" absences are fee signals (only fee roles see fee flags), and
//   attendance flags, which teachers see, count them as Other;
// - "may be at risk of leaving" and "may be thinking of leaving" say the reason
//   mix and weigh unexplained absences more than sick days.
// Schools without absence reasons have no reasons recorded, so nothing changes.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { BUILT_MODULES } from "../modules";
import { explained, FEE_REASON, mixText, mostlyExplained, mostlyUnexplained, reasonMix, unexplained, type ReasonMix } from "../attendance/absence-reasons";

type Area = "attendance" | "marks" | "fees";
export type SignalLike = { studentId: string; sectionId: string | null; area: Area; strength: "WATCH" | "ACT_NOW"; reason: string; basis: string; value: number | null };

/** "Not known yet" absences that make one attendance flag a leaving signal on its own. */
export const UNEXPLAINED_ALONE = 5;

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
  const out: SignalLike[] = signals.map((s) => {
    const m = mixes.get(s.studentId);
    const text = s.area === "attendance" ? mixText(m, false) : "";
    if (!m || !text) return s;
    const reasons = s.reason.split("\n");
    const basis = s.basis.split("\n");
    basis[0] = `${basis[0]} · absence reasons: ${text}`;
    let strength = s.strength;
    if (strength === "WATCH" && mostlyUnexplained(m, Math.max(3, o.streakDays))) {
      strength = "ACT_NOW";
      reasons.push(`${unexplained(m)} of ${m.absent} absent days have no reason known yet`);
      basis.push("Absence reasons in the register · many not known yet is a stronger signal");
    } else if (strength === "ACT_NOW" && (s.value === null || s.value >= o.threshold) && mostlyExplained(m)) {
      strength = "WATCH";
      reasons.push(`Most absent days were sick days or approved leave (${explained(m)} of ${m.absent})`);
      basis.push("Absence reasons in the register and approved Student Leave");
    }
    return { ...s, strength, reason: reasons.join("\n"), basis: basis.join("\n") };
  });
  if (!BUILT_MODULES.has("fee-management")) return out;
  for (const [id, m] of mixes) {
    const n = m.by[FEE_REASON] ?? 0;
    if (!n || !o.enrol.has(id)) continue;
    const line = `Absent ${n} school ${n === 1 ? "day" : "days"} this year with the reason Fees dispute`;
    const lineBasis = "Absence reasons in the attendance register";
    const i = out.findIndex((x) => x.studentId === id && x.area === "fees");
    if (i >= 0) out[i] = { ...out[i], reason: `${out[i].reason}\n${line}`, basis: `${out[i].basis}\n${lineBasis}`, strength: "ACT_NOW" };
    else out.push({ studentId: id, sectionId: o.enrol.get(id) ?? null, area: "fees", strength: n >= 3 ? "ACT_NOW" : "WATCH", reason: line, basis: lineBasis, value: null });
  }
  return out;
}

/** "May be at risk of leaving" (AI insights): a sentence on the reasons, and whether they make it stronger. */
export async function dropoutReasons(tx: Tx, ctx: SchoolContext, ids: string[], from: Date, to: Date, seesFees: boolean) {
  const mixes = await reasonMix(tx, ctx, ids, from, to);
  const out = new Map<string, { why: string; strong: boolean }>();
  for (const [id, m] of mixes) {
    const text = mixText(m, seesFees);
    if (!text) continue;
    const unknown = mostlyUnexplained(m, 3);
    const why = unknown ? ` Most absences have no reason known yet (${text}), a stronger sign than sick days.`
      : mostlyExplained(m) ? ` Most absences were sick days or approved leave (${text}), a weaker sign.` : ` Absence reasons: ${text}.`;
    out.set(id, { why, strong: unknown || (seesFees && (m.by[FEE_REASON] ?? 0) > 0) });
  }
  return out;
}

export type LeavingWeight = { counted: Set<string>; unknown: boolean; score: number; mix: ReasonMix | undefined };

/**
 * "May be thinking of leaving" (Looking ahead): the areas with open flags,
 * weighed by the absence reasons. "Fees dispute" counts as fees; attendance
 * that was mostly sick days or approved leave does not count; many "Not known
 * yet" absences add one more. A score of 2 or more is a signal.
 */
export async function leavingWeights(tx: Tx, ctx: SchoolContext, areas: Map<string, Set<string>>, from: Date, to: Date): Promise<Map<string, LeavingWeight>> {
  const mixes = to >= from ? await reasonMix(tx, ctx, [...areas.keys()], from, to) : new Map<string, ReasonMix>();
  const out = new Map<string, LeavingWeight>();
  for (const [id, a] of areas) {
    const m = mixes.get(id);
    const counted = new Set(a);
    if (m && (m.by[FEE_REASON] ?? 0) > 0) counted.add("fees");
    if (counted.has("attendance") && mostlyExplained(m)) counted.delete("attendance");
    const unknown = counted.has("attendance") && mostlyUnexplained(m, UNEXPLAINED_ALONE);
    out.set(id, { counted, unknown, score: counted.size + (unknown ? 1 : 0), mix: m });
  }
  return out;
}

/** The leaving signal's sentence on the reasons. "Fees dispute" is named only when the signal is kept for fee roles. */
export function leavingWhy(w: LeavingWeight) {
  const text = mixText(w.mix, w.counted.has("fees"));
  if (!text) return "";
  return w.unknown
    ? ` ${unexplained(w.mix)} of ${w.mix!.absent} absent days have no reason known yet (${text}), a stronger sign than sick days.`
    : ` Absence reasons this year: ${text}.`;
}
