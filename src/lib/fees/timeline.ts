// The timeline of one unpaid installment (adopt item 4,
// docs/research/inkwelly-2026-11-15.md): "Bill made → Due → Late fee from",
// and the reminder plan "Reminder 1 of 3 · 3 days before · sent". Every part
// comes from the school's own Fee Settings and the records (fee invoices, late
// fee rows, the reminder log); a part that does not apply is left out, never
// guessed. Read only.
import "server-only";

import type { StudentFeeDue } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { formatDate, formatRupees } from "../format";
import { addDays, todayIn } from "../staff/dates";
import { moveInGoLive } from "../move-in/live";
import { lateFeeFor } from "./late-fees";
import { pausedByPromise } from "./promises";
import { reminderOnceKey } from "./reminders";
import { feeSettings, type FeeSettings } from "./settings";

export type StepState = "done" | "today" | "ahead";
export type TimelineStep = { key: "bill" | "due" | "late"; text: string; state: StepState };
export type ReminderStep = { n: number; of: number; text: string; state: "sent" | "not-sent" | "ahead" };
export type FeeTimeline = { steps: TimelineStep[]; reminders: ReminderStep[]; paused: string | null };

export type TimelineRules = Pick<FeeSettings,
  "lateFeeOn" | "lateFeeType" | "lateFeePaise" | "lateFeePercentBp" | "graceDays" | "lateFeeMaxPaise" | "remindersOn" | "reminderDays" | "reminderMinPaise">;

export type TimelineDue = Pick<StudentFeeDue, "id" | "kind" | "dueDate" | "balancePaise" | "state" | "broughtIn" | "createdAt">;

export type TimelineFacts = {
  today: Date;
  /** This row's head attracts a late fee (the head's switch and Fee Settings' list of heads). */
  lateApplies: boolean;
  /** A school that moved in counts late days only from its go-live date (src/lib/fees/late-fees.ts). */
  goLive: Date | null;
  /** The day the first fee invoice with this row was made, or null. */
  billedOn: Date | null;
  /** The late fee row already added for this row, or null. */
  lateRow: Pick<StudentFeeDue, "amountPaise" | "dueDate"> | null;
  /** Once-keys of the automatic reminders this student got (the reminder log). */
  sentKeys: Set<string>;
  /** The student's id, for the reminder log's keys. */
  studentId: string;
  /** What the family owes now: no automatic reminder goes below Fee Settings' smallest amount. */
  owedPaise: bigint;
  /** An open promise to pay pauses the reminders. */
  paused: boolean;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (d: Date) => formatDate(d, "UTC");
const stateOf = (d: Date, today: Date): StepState => (iso(d) === iso(today) ? "today" : d < today ? "done" : "ahead");
const daysWord = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** "3 days before", "on the due date", "7 days after". */
export function reminderWhen(offset: number) {
  return offset === 0 ? "on the due date" : offset < 0 ? `${daysWord(-offset)} before` : `${daysWord(offset)} after`;
}

/** How the late fee is worked out, in a few words: "₹200", "₹10 a day", "2% of what is left". */
function lateAmountWords(r: TimelineRules) {
  if (r.lateFeeType === "per-day") return `${formatRupees(r.lateFeePaise)} a day`;
  if (r.lateFeeType === "percent") return `${(r.lateFeePercentBp / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}% of what is left`;
  return formatRupees(r.lateFeePaise);
}

/** The first day a late fee is charged: the day after the grace period (lateFeeFor: more than graceDays late). */
export function lateFeeFrom(r: Pick<TimelineRules, "graceDays">, dueDate: Date, goLive: Date | null) {
  const from = goLive && dueDate < goLive ? goLive : dueDate;
  return addDays(from, r.graceDays + 1);
}

/** One installment's timeline, or null for a row that is paid, removed, a late fee itself or old dues. */
export function installmentTimeline(d: TimelineDue, r: TimelineRules, f: TimelineFacts): FeeTimeline | null {
  if (d.state !== "OPEN" || d.balancePaise <= BigInt(0) || (d.kind !== "FEE" && d.kind !== "CHARGE")) return null;
  const steps: TimelineStep[] = [];
  if (f.billedOn) steps.push({ key: "bill", text: `Bill made ${day(f.billedOn)}`, state: "done" });
  steps.push({ key: "due", text: `Due ${day(d.dueDate)}`, state: stateOf(d.dueDate, f.today) });
  if (f.lateRow) {
    steps.push({ key: "late", text: `Late fee ${formatRupees(f.lateRow.amountPaise)} added ${day(f.lateRow.dueDate)}`, state: "done" });
  } else if (r.lateFeeOn && f.lateApplies && !d.broughtIn) {
    const from = lateFeeFrom(r, d.dueDate, f.goLive);
    // A rule that would charge nothing (a ₹0 late fee) is not shown.
    const base = f.goLive && d.dueDate < f.goLive ? { dueDate: f.goLive, balancePaise: d.balancePaise } : { dueDate: d.dueDate, balancePaise: d.balancePaise };
    if (lateFeeFor(r, base, from) > BigInt(0)) steps.push({ key: "late", text: `Late fee ${lateAmountWords(r)} from ${day(from)}`, state: stateOf(from, f.today) });
  }

  const reminders: ReminderStep[] = [];
  const offsets = [...new Set(r.reminderDays)].sort((a, b) => a - b);
  if (r.remindersOn && offsets.length && f.owedPaise >= r.reminderMinPaise) {
    const made = new Date(`${iso(d.createdAt)}T00:00:00Z`);
    offsets.forEach((o, i) => {
      const on = addDays(d.dueDate, o);
      // A reminder day before this row existed never applied to it.
      if (on < made) return;
      const sent = f.sentKeys.has(reminderOnceKey(f.studentId, on)) || f.sentKeys.has(`auto:${f.studentId}:${iso(d.dueDate)}:${o}`);
      const state = on > f.today || (iso(on) === iso(f.today) && !sent) ? "ahead" : sent ? "sent" : "not-sent";
      const tail = state === "sent" ? "sent" : state === "not-sent" ? "not sent" : day(on);
      reminders.push({ n: i + 1, of: offsets.length, text: `Reminder ${i + 1} of ${offsets.length} · ${reminderWhen(o)} · ${tail}`, state });
    });
  }
  return { steps, reminders, paused: reminders.length && f.paused ? "Reminders paused: a promise to pay is open" : null };
}

/** The timeline of each unpaid installment of one student, by row id. */
export async function feeTimelines(tx: Tx, ctx: SchoolContext, studentId: string, today: Date): Promise<Map<string, FeeTimeline>> {
  const [rules, dues, school] = await Promise.all([
    feeSettings(tx, ctx),
    tx.studentFeeDue.findMany({ where: { studentId }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] }),
    tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } }),
  ]);
  const open = dues.filter((d) => d.state === "OPEN" && d.balancePaise > BigInt(0) && (d.kind === "FEE" || d.kind === "CHARGE"));
  const out = new Map<string, FeeTimeline>();
  if (!open.length) return out;
  const [heads, invoices, reminders, paused, goLive] = await Promise.all([
    tx.feeHead.findMany({ where: { id: { in: [...new Set(open.map((d) => d.feeHeadId))] } }, select: { id: true, lateFeeApplies: true } }),
    tx.feeDocument.findMany({ where: { studentId, kind: "invoice" }, orderBy: { createdAt: "asc" }, select: { createdAt: true, details: true } }),
    tx.feeReminder.findMany({ where: { studentId, automatic: true, onceKey: { not: null } }, select: { onceKey: true } }),
    pausedByPromise(tx, ctx, [studentId], today),
    moveInGoLive(tx, ctx),
  ]);
  const billed = new Map<string, Date>();
  for (const inv of invoices) {
    const ids = (inv.details as { dueIds?: unknown } | null)?.dueIds;
    if (!Array.isArray(ids)) continue;
    for (const id of ids) if (typeof id === "string" && !billed.has(id)) billed.set(id, todayIn(school.timeZone, inv.createdAt));
  }
  const lateByParent = new Map(dues.filter((x) => x.kind === "LATE_FEE" && x.parentDueId && x.state !== "REMOVED").map((x) => [x.parentDueId!, x]));
  const sentKeys = new Set(reminders.map((x) => x.onceKey!));
  // What the family owes now (rows due within today), as the reminder run counts it.
  const owedPaise = dues.filter((x) => x.state === "OPEN" && x.balancePaise > BigInt(0) && x.dueDate <= today).reduce((a, x) => a + x.balancePaise, BigInt(0));
  for (const d of open) {
    const head = heads.find((h) => h.id === d.feeHeadId);
    const lateApplies = Boolean(head?.lateFeeApplies) && (rules.lateFeeHeadIds.length === 0 || rules.lateFeeHeadIds.includes(d.feeHeadId));
    const t = installmentTimeline(d, rules, {
      today, lateApplies, goLive, billedOn: billed.get(d.id) ?? null, lateRow: lateByParent.get(d.id) ?? null,
      sentKeys, studentId, owedPaise: owedPaise > BigInt(0) ? owedPaise : d.balancePaise, paused: paused.has(studentId),
    });
    if (t) out.set(d.id, t);
  }
  return out;
}
