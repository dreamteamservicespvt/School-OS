"use server";

import { redirect } from "next/navigation";
import type { ExitType } from "@prisma/client";
import { requireAction } from "@/lib/current";
import { withSchool, type Tx } from "@/lib/db";
import type { FormState } from "@/lib/forms";
import { DOCUMENT_TYPES, saveFile } from "@/lib/files";
import { flash } from "@/lib/flash";
import { act, dateOf, file, FieldProblem, id, optionalId, problemState, str } from "@/lib/staff/act";
import { HrOnlyError, viewerFor } from "@/lib/staff/access";
import { offCampus } from "@/lib/staff/list";
import { addHandoverItem, cancelExit, completeExit, EXIT_TYPES, ExitProblem, finishLastDay, handOver, sendSettlement, setClearance, startExit } from "@/lib/staff/exit";
import { todayIn } from "@/lib/staff/dates";

async function hr() {
  const { current, reach } = await requireAction("staff-hr-management", "edit");
  if (reach !== "all") throw new HrOnlyError("staff exits");
  return current;
}

type Current = Awaited<ReturnType<typeof hr>>;

/**
 * One campus: the exit of another campus's staff member is not found, the
 * same words as one that does not exist. Give the exit, or a handover item
 * or clearance check of it.
 */
async function onCampus(tx: Tx, current: Current, ref: { exitId?: string; itemId?: string; checkId?: string }) {
  if (!current.campusId) return null;
  const viewer = await viewerFor(tx, current.ctx, current);
  const exitCaseId = ref.exitId
    ?? (ref.itemId ? (await tx.handoverItem.findFirst({ where: { id: ref.itemId }, select: { exitCaseId: true } }))?.exitCaseId : undefined)
    ?? (ref.checkId ? (await tx.clearanceCheck.findFirst({ where: { id: ref.checkId }, select: { exitCaseId: true } }))?.exitCaseId : undefined);
  const exit = exitCaseId ? await tx.exitCase.findFirst({ where: { id: exitCaseId }, select: { staffId: true } }) : null;
  if (!exit || offCampus(viewer, exit.staffId)) throw new ExitProblem(ref.itemId ? "This handover item was not found." : ref.checkId ? "This check was not found." : "This exit was not found.");
  return viewer;
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
      // One campus: only their campus's staff can be chosen.
      if (current.campusId && offCampus(await viewerFor(tx, current.ctx, current), input.staffId)) throw new ExitProblem("Choose the staff member who is leaving.", "staffId");
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
    await withSchool(current.ctx, async (tx) => {
      const viewer = await onCampus(tx, current, { itemId });
      if (viewer && toStaffId && offCampus(viewer, toStaffId)) throw new ExitProblem("Choose who takes this over.", "toStaffId");
      return handOver(tx, current.ctx, itemId, toStaffId);
    }, { timeout: 30_000 });
  }, () => "Handed over.");
}

export async function addHandoverAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await hr();
    const exitId = id(fd, "exitId", "exit");
    await withSchool(current.ctx, async (tx) => {
      await onCampus(tx, current, { exitId });
      return addHandoverItem(tx, current.ctx, exitId, str(fd, "kind"), str(fd, "label").slice(0, 200));
    });
  }, () => "Item added to the handover.");
}

export async function clearanceAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await hr();
    const status = str(fd, "status");
    if (!["PENDING", "CLEARED", "NOT_NEEDED"].includes(status)) throw new FieldProblem("Choose a status.", "status");
    const checkId = id(fd, "checkId", "check");
    await withSchool(current.ctx, async (tx) => {
      await onCampus(tx, current, { checkId });
      return setClearance(tx, current.ctx, checkId, status as "CLEARED", str(fd, "note").slice(0, 300) || null);
    });
    return status;
  }, (s) => (s === "CLEARED" ? "Marked cleared." : s === "NOT_NEEDED" ? "Marked not needed." : "Marked pending."));
}

export async function settlementAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await hr();
    const done = str(fd, "done") === "yes";
    const exitId = id(fd, "exitId", "exit");
    await withSchool(current.ctx, async (tx) => {
      await onCampus(tx, current, { exitId });
      return sendSettlement(tx, current.ctx, exitId, str(fd, "note").slice(0, 500) || null, done);
    });
    return done;
  }, (done) => (done ? "Final settlement marked done." : "Sent to Salary Management for the final settlement."));
}

export async function cancelExitAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await hr();
    const exitId = id(fd, "exitId", "exit");
    await withSchool(current.ctx, async (tx) => {
      await onCampus(tx, current, { exitId });
      return cancelExit(tx, current.ctx, exitId, str(fd, "reason"));
    });
  }, () => "Exit cancelled. The staff member stays active.");
}

export async function completeExitAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await hr();
    const exitId = id(fd, "exitId", "exit");
    await withSchool(current.ctx, async (tx) => {
      await onCampus(tx, current, { exitId });
      return completeExit(tx, current.ctx, exitId);
    });
  }, () => "Exit completed.");
}
