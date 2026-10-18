"use server";

import { revalidatePath } from "next/cache";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { decide, plainReason, type Decision } from "@/lib/approvals";
import { bulkApprove, type BulkResult } from "@/lib/approvals-inbox";
import { finishFollowUp } from "@/lib/approvals-unfinished";
import { answerSupport, endSupportFromSchool, SupportProblem } from "@/lib/console/support";

const LOOK_ONLY = "DREAM TEAM support access is for looking only. The school decides its own requests.";

const DONE: Record<Decision, string> = {
  approve: "Approved. The person who asked has been told.",
  reject: "Not approved. The person who asked has been told why.",
  "ask-change": "Sent back for a change. The person who asked has been told what to change.",
  withdraw: "Your request is withdrawn.",
};

/** One decision on one request. Returns a plain-words problem, or nothing when done. */
export async function decideAction(id: string, decision: Decision, note: string | null): Promise<string | void> {
  if (!["approve", "reject", "ask-change", "withdraw"].includes(decision)) return "That is not a decision School OS knows.";
  const current = await requireCurrent();
  if (current.support) return LOOK_ONLY;
  const clean = note?.trim() ? note.trim().slice(0, 1000) : null;
  if ((decision === "reject" || decision === "ask-change") && (!clean || clean.length < 5)) return "Give a reason of at least 5 characters, so the person knows why.";
  try {
    await withSchool(current.ctx, (tx) => decide(tx, current.ctx, id, decision, clean));
  } catch (e) {
    // A refusal, or the module's own reason from the follow-up ("Class 5 is full"): nothing was changed.
    const plain = plainReason(e);
    if (plain) return plain;
    console.error(JSON.stringify({ level: "error", event: "approval-decide", error: e instanceof Error ? e.message : String(e) }));
    return "That did not work, and nothing was changed. Please try again.";
  }
  await flash({ message: DONE[decision] });
  revalidatePath("/", "layout");
}

const FINISHED: Record<Decision, string> = { approve: "approved", reject: "not approved", "ask-change": "sent back for a change", withdraw: "withdrawn" };

/**
 * "Finish now" (Approved, but not finished): runs the follow-up of a decided
 * request whose record never moved on. Only the person who decided it, the
 * Principal or the School Admin. If it cannot be done now, the plain reason
 * comes back and nothing changes.
 */
export async function finishFollowUpAction(id: string): Promise<string | void> {
  const current = await requireCurrent();
  if (current.support) return LOOK_ONLY;
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return "This request was not found.";
  let done: Awaited<ReturnType<typeof finishFollowUp>>;
  try {
    done = await withSchool(current.ctx, (tx) => finishFollowUp(tx, current.ctx, String(id)));
  } catch (e) {
    const plain = plainReason(e);
    if (plain) return plain;
    console.error(JSON.stringify({ level: "error", event: "approval-finish", error: e instanceof Error ? e.message : String(e) }));
    return "That did not work, and nothing was changed. Please try again.";
  }
  await flash({ message: `Finished: ${done.approval.summary}. It is now ${FINISHED[done.decision]}, as decided.` });
  revalidatePath("/", "layout");
}

/** Approves several requests; each is checked on its own (P11). */
export async function bulkApproveAction(ids: string[]): Promise<BulkResult | { error: string }> {
  const current = await requireCurrent();
  if (current.support) return { error: LOOK_ONLY };
  if (!Array.isArray(ids) || ids.length === 0) return { error: "Choose at least one request." };
  if (ids.length > 100) return { error: "Approve at most 100 at a time." };
  const result = await bulkApprove(current.ctx, ids.map(String));
  await flash({ message: `${result.approved} approved${result.skipped.length ? `, ${result.skipped.length} not approved (see the list)` : ""}. Each person who asked has been told.` });
  revalidatePath("/", "layout");
  return result;
}

/** DREAM TEAM's Support Access Request (07-super-admin.md §3.4): the School Admin or Principal allows or declines it. */
export async function answerSupportAction(id: string, decision: "allow" | "decline", note: string | null): Promise<string | void> {
  if (decision !== "allow" && decision !== "decline") return "That is not a decision School OS knows.";
  const current = await requireCurrent();
  let words: string;
  try {
    const r = await answerSupport(current, String(id), decision, note ? String(note).slice(0, 300) : null);
    words = decision === "allow"
      ? `Allowed. ${r.requestedByName} of DREAM TEAM can look inside until ${r.until}. You can end it earlier in Approvals.`
      : "Declined. DREAM TEAM has been told why.";
  } catch (e) {
    if (e instanceof SupportProblem) return e.message;
    console.error(JSON.stringify({ level: "error", event: "support-answer", error: e instanceof Error ? e.message : String(e) }));
    return "That did not work, and nothing was changed. Please try again.";
  }
  await flash({ message: words });
  revalidatePath("/", "layout");
}

/** "End now" for DREAM TEAM's open support access, from Approvals. */
export async function endSupportNowAction(id: string): Promise<string | void> {
  const current = await requireCurrent();
  let words: string;
  try {
    const r = await endSupportFromSchool(current, String(id));
    words = `${r.requestedByName} of DREAM TEAM can no longer look inside School OS.`;
  } catch (e) {
    if (e instanceof SupportProblem) return e.message;
    console.error(JSON.stringify({ level: "error", event: "support-end-school", error: e instanceof Error ? e.message : String(e) }));
    return "That did not work, and nothing was changed. Please try again.";
  }
  await flash({ message: words });
  revalidatePath("/", "layout");
}
