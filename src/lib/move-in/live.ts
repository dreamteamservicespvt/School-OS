// Moving in (02-workflows.md, workflow 15, step 10): "On go-live ... automations
// start (absence messages, fee reminders)". Until the Principal presses Go live,
// nothing the software does by itself reaches a parent or adds a charge:
//
// - automatic messages to parents (absence, late, fee reminders, fee received,
//   exam reminders, results, PTM, homework, birthdays, admission welcome, bus)
//   wait (messaging/automatic.ts);
// - timed work that exists to message parents or add charges (late fees, fee
//   reminders, library reminders and fines, event and exam reminders, birthday
//   wishes) does not run (defineSchedule's heldWhileMovingIn, jobs.ts);
// - attendance alerts to parents are kept with the reason
//   (attendance/notify-parents.ts).
//
// Messages a person sends by hand, after the preview, still go. Messages to
// staff, approvals, imports and the school's own records carry on.
//
// A school is moving in while it has a Move-in Plan that has not gone live.
// Add School in the Super Admin console starts every new school with one. A
// school with no plan (every school before 22 October 2026, and the demo
// school) is live, so nothing changes for it.
import type { SchoolContext, Tx } from "../db";

export const HELD_UNTIL_LIVE = "Held until the school goes live on School OS";

/** Plain words for screens that promise an automatic message or charge. */
export const HELD_WORDS = "Your school is still moving in. Automatic messages to parents, fee reminders and late fees start when the Principal presses Go live.";

/** Is the school still moving in (a Move-in Plan that has not gone live)? */
export async function movingIn(tx: Tx, ctx: Pick<SchoolContext, "schoolId">): Promise<boolean> {
  const plan = await tx.moveInPlan.findUnique({ where: { schoolId: ctx.schoolId }, select: { wentLiveAt: true } });
  return Boolean(plan && !plan.wentLiveAt);
}

/**
 * The day School OS became (or becomes) the school's record, for a school that
 * moved in through Switching to School OS: the go-live date typed on the
 * go-live check, else the day it went live. Null while no date is known, and
 * for a school with no Move-in Plan: nothing is "before go-live" for it.
 */
export async function moveInGoLive(tx: Tx, ctx: Pick<SchoolContext, "schoolId">): Promise<Date | null> {
  const plan = await tx.moveInPlan.findUnique({ where: { schoolId: ctx.schoolId }, select: { goLiveDate: true, wentLiveAt: true } });
  if (!plan) return null;
  return plan.goLiveDate ?? (plan.wentLiveAt ? dayOf(plan.wentLiveAt) : null);
}

const dayOf = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`);
