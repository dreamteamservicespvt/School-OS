"use server";

import { revalidatePath } from "next/cache";
import type { ApplicationStage } from "@prisma/client";
import { flash } from "@/lib/flash";
import { formValues, type FormState } from "@/lib/forms";
import { AdmissionProblem, file, id, maybe, need, optionalId, problemState, rupeesOf, str, UUID_RE } from "@/lib/admission/act";
import { admissionAct, customFrom, inSchool } from "@/lib/admission/server";
import { readApplicationForm } from "@/lib/admission/application-form";
import { createApplication, editApplication, moveStage, review, sendBack, STAGES, withdraw } from "@/lib/admission/applications";
import { DuplicateProblem, type Match } from "@/lib/admission/enquiries";
import { markOriginalSeen, recordPapersException, rejectDocument, remindMissing, uploadDocument, verifyDocument } from "@/lib/admission/documents";
import { confirmConsentAtCounter, DATA_CONSENT, PHOTO_CONSENT, sendConsentCode } from "@/lib/admission/consent";
import { cancelPayment, recordCounterPayment } from "@/lib/admission/fee";

const BASE = "/admission-management/applications";

type DupState = FormState<{ id?: string; matches?: Match[] }>;

export async function saveApplicationAction(_: DupState, fd: FormData): Promise<DupState> {
  try {
    const existingId = optionalId(fd, "id");
    const app = await inSchool(existingId ? "edit" : "create", async (w) => {
      const input = readApplicationForm(fd, { restricted: w.v.restricted });
      if (existingId) {
        const before = await w.tx.application.findFirst({ where: { id: existingId }, select: { customFields: true } });
        return editApplication(w.tx, w.ctx, w.v, w.s, existingId, { ...input, customFields: await customFrom(w, "application", fd, before?.customFields ?? {}) });
      }
      const campus = await w.tx.campus.findFirst({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }], select: { id: true } });
      if (!campus) throw new AdmissionProblem("Add a campus in Settings first.");
      return createApplication(w.tx, w.ctx, w.v, w.s, { ...input, customFields: await customFrom(w, "application", fd, {}) }, { campusId: campus.id, channel: "counter", enquiryId: optionalId(fd, "enquiryId"), force: str(fd, "force") === "1" });
    });
    await flash({ message: existingId ? `Application ${app.applicationNo} saved.` : `Application ${app.applicationNo} made for ${app.fullName}.`, link: { href: `${BASE}/${app.id}`, label: "Open application" } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved.", data: { id: app.id } };
  } catch (err) {
    if (err instanceof DuplicateProblem) return { ok: false, message: err.message, values: formValues(fd), data: { matches: err.matches } };
    return problemState(err, fd) as DupState;
  }
}

export async function reviewAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => review(w.tx, w.ctx, w.v, id(fd, "id", "application"), maybe(fd, "note", "Note", 500)), () => "Marked as reviewed.");
}

export async function sendBackAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => sendBack(w.tx, w.ctx, w.v, w.current.school.name, id(fd, "id", "application"), str(fd, "note")), () => "Sent back to the parent for the missing details.");
}

export async function moveAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => {
    const to = str(fd, "to") as ApplicationStage;
    if (!STAGES.some((s) => s.value === to)) throw new AdmissionProblem("Choose where to move it.", "to");
    return moveStage(w.tx, w.ctx, w.v, w.s, id(fd, "id", "application"), to);
  }, () => "Application moved.");
}

export async function withdrawAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => withdraw(w.tx, w.ctx, w.v, id(fd, "id", "application"), str(fd, "reason")), () => "Application withdrawn.");
}

export async function uploadDocAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => {
    const f = file(fd, "file");
    if (!f) throw new AdmissionProblem("Choose the file or take a photo.", "file");
    return uploadDocument(w.tx, w.ctx, w.v, { applicationId: id(fd, "id", "application"), docType: need(fd, "docType", "Document type", 40), file: f, note: maybe(fd, "note", "Note", 300) });
  }, () => "Document uploaded. Verify it when checked.", { timeout: 60_000 });
}

export async function verifyDocAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => verifyDocument(w.tx, w.ctx, w.v, id(fd, "docId", "document")), () => "Document verified.");
}

export async function rejectDocAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => rejectDocument(w.tx, w.ctx, w.v, w.current.school.name, id(fd, "docId", "document"), str(fd, "reason"), str(fd, "tellParent") === "on"), (told) => `Document rejected.${told ? " The parent was told the reason." : ""}`);
}

export async function originalSeenAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => markOriginalSeen(w.tx, w.ctx, w.v, id(fd, "docId", "document")), () => "Marked: original seen at the counter.");
}

export async function remindAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => remindMissing(w.tx, w.ctx, w.v, w.current.school.name, id(fd, "id", "application")), (n) => `Reminder sent to the parent listing ${n} ${n === 1 ? "paper" : "papers"}.`);
}

export async function exceptionAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("approve", fd, (w) => recordPapersException(w.tx, w.ctx, w.v, id(fd, "id", "application"), str(fd, "reason")), () => "Exception recorded. The admission can be confirmed with papers pending.");
}

export async function sendCodeAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => sendConsentCode(w.tx, w.ctx, w.v, w.current.school.name, id(fd, "id", "application")), () => "A one-time code was sent to the parent's mobile. It works for 10 minutes.");
}

export async function confirmConsentAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => {
    const types = [DATA_CONSENT, PHOTO_CONSENT].filter((t) => str(fd, `consent_${t}`) === "on");
    if (!types.includes(DATA_CONSENT)) throw new AdmissionProblem("Data consent is needed for the admission. Tick it once the guardian agrees.", `consent_${DATA_CONSENT}`);
    return confirmConsentAtCounter(w.tx, w.ctx, w.v, w.current.school.name, id(fd, "id", "application"), { code: str(fd, "code"), types, givenByName: need(fd, "givenByName", "Guardian's name", 120) });
  }, () => "Consent recorded, confirmed by the one-time code.");
}

export async function counterPaymentAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => {
    const amount = rupeesOf(fd, "amount", "Amount");
    if (!amount || amount <= BigInt(0)) throw new AdmissionProblem("Type the amount received.", "amount");
    return recordCounterPayment(w.tx, w.ctx, w.v, id(fd, "id", "application"), { amountPaise: amount, mode: need(fd, "mode", "Mode", 20), reference: maybe(fd, "reference", "Reference", 80) });
  }, (p) => ({ message: `Payment recorded. Receipt ${p.receiptNo}.`, link: { href: `${BASE}/${p.applicationId}/receipt/${p.id}`, label: "Print receipt" } }));
}

export async function cancelPaymentAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("approve", fd, (w) => cancelPayment(w.tx, w.ctx, w.v, id(fd, "paymentId", "payment"), str(fd, "reason")), () => "Payment cancelled. The record and its receipt number are kept.");
}

/** Pipeline board on the dashboard: a card dragged to the next column. */
export async function moveBoardCard(cardId: string, from: string, to: string): Promise<string | null> {
  if (!UUID_RE.test(cardId)) return "This card was not found.";
  const target: Record<string, ApplicationStage> = { documents: "DOCUMENTS", tests: "TEST_INTERVIEW", approvals: "DECISION" };
  if (from === "enquiry" && to === "application") return "Open the enquiry and use Convert to application, so the form can be filled.";
  const stage = target[to];
  if (!stage) return "Cards cannot be moved to that column by dragging. Use the buttons on the application.";
  const r = await admissionAct("edit", undefined, (w) => moveStage(w.tx, w.ctx, w.v, w.s, cardId, stage), () => "Application moved.");
  return r?.ok ? null : r?.message ?? "That did not work.";
}
