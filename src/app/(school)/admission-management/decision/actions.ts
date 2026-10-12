"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/forms";
import { AdmissionProblem, dateOf, id, maybe, optionalId, problemState, str } from "@/lib/admission/act";
import { admissionAct, inSchool } from "@/lib/admission/server";
import { addToWaitingList, decideApplication, markOfferAccepted, markOfferSent, moveOnWaitingList, offerSeat, rerankWaitingList } from "@/lib/admission/decision";
import { confirmAdmission, undoAdmission, AlreadyAdmittedProblem } from "@/lib/admission/convert";

const BASE = "/admission-management/decision";

export async function decideAction(_: FormState<unknown>, fd: FormData) {
  const decision = str(fd, "decision") === "reject" ? "reject" : "approve";
  return admissionAct("approve", fd, (w) => decideApplication(w.tx, w.ctx, w.v, id(fd, "id", "application"), decision, maybe(fd, "remarks", "Remarks", 1000)), () => (decision === "approve" ? "Approved. The parent was told." : "Not approved. The parent was told, with your remarks."));
}

export async function waitAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => addToWaitingList(w.tx, w.ctx, w.v, id(fd, "id", "application"), maybe(fd, "note", "Note", 500)), (rank) => `Put on the waiting list at position ${rank}.`);
}

export async function moveWaitAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => {
    const to = Number.parseInt(str(fd, "toRank"), 10);
    if (!Number.isFinite(to)) throw new AdmissionProblem("Type the new position as a number.", "toRank");
    return moveOnWaitingList(w.tx, w.ctx, w.v, id(fd, "id", "application"), to, str(fd, "reason"));
  }, () => "Moved. The reason is kept in the history.");
}

export async function rerankAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => rerankWaitingList(w.tx, w.ctx, w.v, id(fd, "yearId", "year"), id(fd, "classId", "class"), str(fd, "reason")), (n) => `Waiting list re-ranked by the rules (${n} ${n === 1 ? "applicant" : "applicants"}).`);
}

export async function offerSentAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => {
    const ch = str(fd, "channel");
    if (ch !== "whatsapp" && ch !== "email" && ch !== "printed") throw new AdmissionProblem("Choose how the letter was given.", "channel");
    return markOfferSent(w.tx, w.ctx, w.v, id(fd, "id", "application"), ch, w.current.school);
  }, (no) => `Offer letter ${no} recorded as sent.`);
}

export async function offerAcceptedAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => markOfferAccepted(w.tx, w.ctx, w.v, id(fd, "id", "application")), () => "Offer marked as accepted.");
}

export async function offerSeatAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => offerSeat(w.tx, w.ctx, w.v, id(fd, "id", "application")), () => "Sent for a decision with the seat now free.");
}

export async function confirmAction(_: FormState<unknown>, fd: FormData): Promise<FormState<unknown>> {
  let appId: string;
  try {
    appId = id(fd, "id", "application");
    await inSchool("create", async (w) => {
      const admissionDate = dateOf(fd, "admissionDate", "Admission date");
      return confirmAdmission(w.tx, w.ctx, w.v, appId, { sectionId: optionalId(fd, "sectionId"), admissionDate });
    }, { timeout: 60_000 });
  } catch (e) {
    if (e instanceof AlreadyAdmittedProblem) redirect(`${BASE}/${str(fd, "id")}/admitted`);
    return problemState(e, fd);
  }
  revalidatePath("/", "layout");
  redirect(`${BASE}/${appId}/admitted`);
}

export async function undoAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("create", fd, (w) => undoAdmission(w.tx, w.ctx, w.v, id(fd, "id", "application")), (no) => ({ message: `Admission ${no} undone. The application is back to approved.`, link: { href: `/admission-management/applications/${str(fd, "id")}`, label: "Open application" } }), { timeout: 60_000 });
}
