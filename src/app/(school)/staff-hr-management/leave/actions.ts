"use server";

import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import type { FormState } from "@/lib/forms";
import { DOCUMENT_TYPES, saveFile } from "@/lib/files";
import { decide, type Decision } from "@/lib/approvals";
import { act, dateOf, file, FieldProblem, id, str } from "@/lib/staff/act";
import { HrOnlyError, viewerFor } from "@/lib/staff/access";
import { adjustBalance, applyLeave, cancelLeave, carryForward, checkLeave, daysText, LeaveProblem, type ApplyInput } from "@/lib/staff/leave";
import { todayIn } from "@/lib/staff/dates";

async function asker(action: "view" | "create" | "edit") {
  const { current } = await requireAction("staff-hr-management", action);
  const viewer = await withSchool(current.ctx, (tx) => viewerFor(tx, current.ctx, current));
  return { current, viewer };
}

function applyInput(fd: FormData, viewerStaffId: string | null, hr: boolean): Omit<ApplyInput, "documentFileId"> {
  const staffId = hr && str(fd, "staffId") ? id(fd, "staffId", "staff member") : viewerStaffId;
  if (!staffId) throw new LeaveProblem("Your login is not linked to a staff record. Ask HR to apply for you.");
  if (!hr && staffId !== viewerStaffId) throw new HrOnlyError("applying leave for someone else");
  const from = dateOf(fd, "from", "From date");
  const part = str(fd, "halfDay");
  const halfDayPart = part === "first" || part === "second" ? part : null;
  const to = halfDayPart ? from : dateOf(fd, "to", "To date");
  return { staffId, leaveTypeId: id(fd, "leaveTypeId", "leave type"), from, to, halfDayPart, reason: str(fd, "reason").slice(0, 500), onBehalf: staffId !== viewerStaffId };
}

/** Apply for leave: for yourself, or by HR for someone else. */
export async function applyLeaveAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current, viewer } = await asker("create");
    const input = applyInput(fd, viewer.staffId, viewer.change === "all");
    const doc = file(fd, "document");
    return withSchool(current.ctx, async (tx) => {
      const documentFileId = doc ? (await saveFile(tx, current.ctx, { file: doc, purpose: "leave-document", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 })).id : null;
      return applyLeave(tx, current.ctx, { ...input, documentFileId });
    }, { timeout: 30_000 });
  }, (r) => `Leave applied for ${daysText(r.days)}${r.lopDays ? ` (${daysText(r.lopDays)} loss of pay)` : ""}. It is waiting for approval.`);
}

/** The check before applying: days, balance and periods affected, shown under the form. */
export async function previewLeave(_: FormState<{ text: string }>, fd: FormData): Promise<FormState<{ text: string }>> {
  try {
    const { current, viewer } = await asker("create");
    const input = applyInput(fd, viewer.staffId, viewer.change === "all");
    const c = await withSchool(current.ctx, (tx) => checkLeave(tx, current.ctx, { ...input, documentFileId: file(fd, "document") ? "pending" : null }));
    const parts = [`${daysText(c.days)} of ${c.type.name}`];
    if (c.available !== null) parts.push(`${daysText(c.available)} left before this`);
    if (c.lopDays) parts.push(`${daysText(c.lopDays)} will be loss of pay`);
    if (c.periods) parts.push(`${c.periods} period${c.periods === 1 ? "" : "s"} will need a substitute`);
    return { ok: true, data: { text: `${parts.join(" · ")}.` } };
  } catch (e) {
    const err = e as Error & { field?: string };
    if (e instanceof LeaveProblem || e instanceof FieldProblem || e instanceof HrOnlyError) return { ok: false, message: err.message, errors: err.field ? { [err.field]: err.message } : undefined };
    return { ok: false, message: "The check did not work. You can still apply." };
  }
}

/** Approve or reject a leave request (head of department, Principal, or the approver in the rule). */
export async function decideLeave(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current } = await asker("view");
    const decision = str(fd, "decision") as Decision;
    if (!["approve", "reject", "ask-change"].includes(decision)) throw new FieldProblem("Choose approve or reject.");
    const approvalId = id(fd, "approvalId", "request");
    await withSchool(current.ctx, (tx) => decide(tx, current.ctx, approvalId, decision, str(fd, "note") || null), { timeout: 30_000 });
    return decision;
  }, (d) => (d === "approve" ? "Leave approved." : "Leave not approved. The staff member was told why."));
}

/** Cancel a leave: one's own, or any by HR. */
export async function cancelLeaveAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current, viewer } = await asker("view");
    const requestId = id(fd, "requestId", "leave");
    return withSchool(current.ctx, async (tx) => {
      const r = await tx.leaveRequest.findFirst({ where: { id: requestId, archivedAt: null } });
      if (!r) throw new LeaveProblem("This leave was not found.");
      if (viewer.change !== "all" && r.staffId !== viewer.staffId) throw new HrOnlyError("cancelling someone else's leave");
      return cancelLeave(tx, current.ctx, requestId, str(fd, "reason"), todayIn(current.school.timeZone));
    }, { timeout: 30_000 });
  }, () => "Leave cancelled. The days are back in the balance.");
}

export async function adjustBalanceAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current, viewer } = await asker("edit");
    if (viewer.change !== "all") throw new HrOnlyError("adjusting leave balances");
    const days = Number(str(fd, "days"));
    const input = { staffId: id(fd, "staffId", "staff member"), leaveTypeId: id(fd, "leaveTypeId", "leave type"), academicYearId: id(fd, "academicYearId", "academic year"), days, reason: str(fd, "reason") };
    await withSchool(current.ctx, (tx) => adjustBalance(tx, current.ctx, input));
    return days;
  }, (d) => `Balance ${d > 0 ? "increased" : "reduced"} by ${daysText(Math.abs(d))}.`);
}

export async function carryForwardAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current, viewer } = await asker("edit");
    if (viewer.change !== "all") throw new HrOnlyError("carrying leave forward");
    const yearId = id(fd, "academicYearId", "academic year");
    return withSchool(current.ctx, (tx) => carryForward(tx, current.ctx, yearId), { timeout: 60_000 });
  }, (r) => `${daysText(r.moved)} carried forward to ${r.nextYear} for ${r.people} staff.`);
}
