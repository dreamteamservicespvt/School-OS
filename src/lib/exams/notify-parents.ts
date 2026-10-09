// Messages to parents from Examination & Results: datesheet published and
// exam reminders (A10, the "Exam reminder" rule), and results published (A9,
// the "Results" rule). Communication owns templates, opt-outs, credits, the
// SMS backup and Message History; its rules can be switched off in Message
// Settings. The same event never reaches the same parent twice.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { sendAutomatic } from "../messaging";

export type ParentMessage = {
  /** What happened: the datesheet was published, an exam is near, or results were published. */
  template: "datesheet-published" | "exam-reminder" | "result-published";
  studentIds: string[];
  /** The event: the same key never sends again to the same parent. */
  idempotencyKey: string;
  /** Blanks for the template: exam_name and date. */
  vars: Record<string, string>;
  /** In school words, for the automation log. */
  text: string;
  source?: { type: string; id: string } | null;
};

const RULE: Record<ParentMessage["template"], string> = {
  "datesheet-published": "exam-reminder",
  "exam-reminder": "exam-reminder",
  "result-published": "result",
};

/** The one place this module sends to parents. Returns how many parents it went to. */
export async function messageParents(tx: Tx, ctx: SchoolContext, msg: ParentMessage): Promise<{ recipients: number; status: string }> {
  const studentIds = [...new Set(msg.studentIds)];
  if (studentIds.length === 0) return { recipients: 0, status: "nobody" };
  const r = await sendAutomatic(tx, ctx, {
    rule: RULE[msg.template],
    event: { key: msg.idempotencyKey, label: msg.text.slice(0, 120) },
    to: { guardiansOf: studentIds },
    values: msg.vars,
    source: msg.source ?? null,
  });
  return { recipients: r.status === "sent" ? r.result.people : 0, status: r.status };
}
