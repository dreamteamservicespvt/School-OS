"use server";

import { redirect } from "next/navigation";
import type { ExitType } from "@prisma/client";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import type { FormState } from "@/lib/forms";
import { DOCUMENT_TYPES, saveFile } from "@/lib/files";
import { flash } from "@/lib/flash";
import { act, dateOf, file, FieldProblem, id, optionalId, problemState, str } from "@/lib/staff/act";
import { HrOnlyError } from "@/lib/staff/access";
import { addHandoverItem, cancelExit, completeExit, EXIT_TYPES, finishLastDay, handOver, sendSettlement, setClearance, startExit } from "@/lib/staff/exit";
import { todayIn } from "@/lib/staff/dates";

async function hr() {
  const { current, reach } = await requireAction("staff-hr-management", "edit");
  if (reach !== "all") throw new HrOnlyError("staff exits");
  return current;
}

export async function startExitAction(_: FormState<unknown>, fd: FormData): Promise<FormState<unknown>> {
  let to: string;
  try {
    const current = await hr();
    const type = str(fd, "type") as ExitType;
    if (!EXIT_TYPES.some((t) => t.value === type)) throw new FieldProblem("Choose resignation, retirement or termination.", "type");
    const input = { staffId: id(fd, "staffId", "staff member"), type, receivedOn: dateOf(fd, "receivedOn", "Date received"), lastWorkingDay: dateOf(fd, "lastWorkingDay", "Last working day"), reason: str(fd, "reason").slice(0, 1000) };
    const letter = file(fd, "letter");
    const exit = await withSchool(current.ctx, async (tx) => {
      const letterFileId = letter ? (await saveFile(tx, current.ctx, { file: letter, purpose: "exit-letter", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 })).id : null;
      const e = await startExit(tx, current.ctx, { ...input, letterFileId });
      // A last working day already past closes the login straight away.
      if (e.status === "IN_PROGRESS" && e.lastWorkingDay <= todayIn(current.school.timeZone)) await finishLastDay(tx, current.ctx, e.id);
      return e;
    }, { timeout: 30_000 });
    await flash({ message: exit.status === "WAITING_APPROVAL" ? "Exit recorded. It is waiting for the Principal's approval." : "Resignation recorded. Hand over the classes and clear the checks below." });
    to = `/staff-hr-management/exit/${exit.id}`;
  } catch (e) {
    return problemState(e, fd);
  }
  redirect(to);
}

export async function handOverAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await hr();
    const itemId = id(fd, "itemId", "item");
    const toStaffId = optionalId(fd, "toStaffId");
    await withSchool(current.ctx, (tx) => handOver(tx, current.ctx, itemId, toStaffId), { timeout: 30_000 });
  }, () => "Handed over.");
}

export async function addHandoverAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await hr();
    const exitId = id(fd, "exitId", "exit");
    await withSchool(current.ctx, (tx) => addHandoverItem(tx, current.ctx, exitId, str(fd, "kind"), str(fd, "label").slice(0, 200)));
  }, () => "Item added to the handover.");
}

export async function clearanceAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await hr();
    const status = str(fd, "status");
    if (!["PENDING", "CLEARED", "NOT_NEEDED"].includes(status)) throw new FieldProblem("Choose a status.", "status");
    await withSchool(current.ctx, (tx) => setClearance(tx, current.ctx, id(fd, "checkId", "check"), status as "CLEARED", str(fd, "note").slice(0, 300) || null));
    return status;
  }, (s) => (s === "CLEARED" ? "Marked cleared." : s === "NOT_NEEDED" ? "Marked not needed." : "Marked pending."));
}

export async function settlementAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await hr();
    const done = str(fd, "done") === "yes";
    await withSchool(current.ctx, (tx) => sendSettlement(tx, current.ctx, id(fd, "exitId", "exit"), str(fd, "note").slice(0, 500) || null, done));
    return done;
  }, (done) => (done ? "Final settlement marked done." : "Sent to Salary Management for the final settlement."));
}

export async function cancelExitAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await hr();
    await withSchool(current.ctx, (tx) => cancelExit(tx, current.ctx, id(fd, "exitId", "exit"), str(fd, "reason")));
  }, () => "Exit cancelled. The staff member stays active.");
}

export async function completeExitAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await hr();
    await withSchool(current.ctx, (tx) => completeExit(tx, current.ctx, id(fd, "exitId", "exit")));
  }, () => "Exit completed.");
}
