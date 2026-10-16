// "Ask the class teacher to follow up" (owner's prototype changes of 13 Oct
// 2026, fees-classwise.jsx): the Principal, School Admin, Vice Principal or
// Accountant sends a section's class teacher the names of the families who
// still owe, to remind them at pickup or the PTM. Teachers never see fee
// amounts (05-roles.md), so the message carries names only. It goes through
// Communication (a real app message, in the Message log) and is audited.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { sendMessage, MAX_TEXT } from "../messaging/send";
import { remindedSince } from "../reminders";
import type { FeeViewer } from "./access";
import { sectionFees } from "./by-class";
import { MoneyProblem } from "./problem";

export const FOLLOW_UP_ACTION = "fee-follow-up-asked";

/** The words sent to the teacher: names only, never amounts, kept under the message limit. */
export function followUpText(sectionName: string, names: string[]) {
  const head = `Please remind the families of these ${names.length === 1 ? "student" : `${names.length} students`} in ${sectionName} about their fees, at pickup or the PTM: `;
  const tail = " The accounts office has the amounts.";
  const shown: string[] = [];
  for (const n of names) {
    const left = names.length - shown.length - 1;
    const next = [...shown, n].join(", ") + (left > 0 ? ` and ${left} more.` : ".");
    if ((head + next + tail).length > MAX_TEXT) break;
    shown.push(n);
  }
  const more = names.length - shown.length;
  return `${head}${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}.${tail}`;
}

/**
 * Sends the class teacher of a section the names of its students who still
 * owe. Only people who see the whole school's fees may ask (Full or View);
 * a class teacher with Own fee access cannot. Nobody asks themselves.
 */
export async function askTeacherFollowUp(tx: Tx, ctx: SchoolContext, viewer: FeeViewer, input: { sectionId: string; today: Date }) {
  if (viewer.see !== "all") throw new MoneyProblem("Only people who look after the whole school's fees can ask a class teacher to follow up.");
  const s = await sectionFees(tx, viewer, input.sectionId, input.today);
  if (!s) throw new MoneyProblem("This class was not found. Reload the page and try again.");
  if (!s.teacher) throw new MoneyProblem(`${s.name} has no class teacher. Set one in Academic Management.`);
  if (!s.teacher.userLoginId) throw new MoneyProblem(`${s.teacher.name} cannot sign in to School OS yet, so the message cannot reach them.`);
  if (s.teacher.userLoginId === ctx.userId) throw new MoneyProblem("You are this class's teacher. Nobody asks themselves.");
  const owe = s.students.filter((x) => x.pending > BigInt(0)).sort((a, b) => b.daysLate - a.daysLate || a.name.localeCompare(b.name));
  if (owe.length === 0) throw new MoneyProblem(`Everyone in ${s.name} has paid. There is nothing to follow up.`);
  const text = followUpText(s.name, owe.map((x) => x.name));
  const sent = await sendMessage(tx, ctx, {
    to: { staffIds: [s.teacher.staffId] },
    channels: ["app"],
    title: `Fee follow-up for ${s.name}`,
    text,
    trigger: "Fees by class, Ask class teacher",
    source: { type: "Section", id: s.sectionId },
    audienceLabel: `${s.teacher.name} (class teacher, ${s.name})`,
    single: true,
  });
  await writeAudit(tx, ctx, {
    action: FOLLOW_UP_ACTION, recordType: "Section", recordId: s.sectionId,
    after: { section: s.name, teacher: s.teacher.name, to: s.teacher.userLoginId, students: owe.length, message: sent.messageId },
  });
  return { teacher: s.teacher.name, students: owe.length, messageId: sent.messageId };
}

/** When each section's class teacher was last asked, since a moment (for "Asked at 10:44 AM"). */
export const followUpAskedSince = (tx: Tx, ctx: SchoolContext, sectionIds: string[], since: Date) => remindedSince(tx, ctx, FOLLOW_UP_ACTION, sectionIds, since);
