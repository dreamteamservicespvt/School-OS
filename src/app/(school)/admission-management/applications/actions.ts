"use server";

import { revalidatePath } from "next/cache";
import type { ApplicationStage } from "@prisma/client";
import { flash } from "@/lib/flash";
import { formValues, type FormState } from "@/lib/forms";
import { AdmissionProblem, checkMobile, file, id, maybe, need, optionalId, problemState, rupeesOf, str } from "@/lib/admission/act";
import { admissionAct, customFrom, inSchool } from "@/lib/admission/server";
import { readApplicationForm } from "@/lib/admission/application-form";
import { createApplication, editApplication, moveStage, review, sendBack, STAGES, withdraw } from "@/lib/admission/applications";
import { DuplicateProblem, type Match } from "@/lib/admission/enquiries";
import { markOriginalSeen, recordPapersException, rejectDocument, remindMissing, uploadDocument, verifyDocument } from "@/lib/admission/documents";
import { admissionConsentTexts, confirmConsentAtCounter, counterFormPurpose, DATA_CONSENT, PHOTO_CONSENT, otpSentWords, recordConsents, sendConsentCode, startOtp, tryOtp, verifyOtp } from "@/lib/admission/consent";
import { applicationScope, requireFull } from "@/lib/admission/access";
import { cancelPayment, recordCounterPayment } from "@/lib/admission/fee";
import { sendFeeLink } from "@/lib/admission/public";

const BASE = "/admission-management/applications";

type DupState = FormState<{ id?: string; matches?: Match[] }>;

export async function saveApplicationAction(_: DupState, fd: FormData): Promise<DupState> {
  try {
    const existingId = optionalId(fd, "id");
    if (!existingId && str(fd, `consent_${DATA_CONSENT}`) === "on") {
      const phone = str(fd, "phone").replace(/\D/g, "").slice(-10);
      const pre = await inSchool("create", (w) => tryOtp(w.tx, { purpose: counterFormPurpose(w.ctx.userId), phone, code: str(fd, "code") }, new Date(), false));
      if (!pre.ok) return { ok: false, message: pre.message, errors: { code: pre.message }, values: formValues(fd) };
    }
    const app = await inSchool(existingId ? "edit" : "create", async (w) => {
      const input = readApplicationForm(fd, { restricted: w.v.restricted });
      if (existingId) {
        const before = await w.tx.application.findFirst({ where: { id: existingId, ...applicationScope(w.v) }, select: { customFields: true } });
        return editApplication(w.tx, w.ctx, w.v, w.s, existingId, { ...input, customFields: await customFrom(w, "application", fd, before?.customFields ?? {}) });
      }
      // Consent is given on the form, confirmed by a one-time code to the parent's phone (D8a).
      const types = [DATA_CONSENT, PHOTO_CONSENT].filter((t) => str(fd, `consent_${t}`) === "on");
      if (!types.includes(DATA_CONSENT)) throw new AdmissionProblem("The guardian must agree to the data consent, confirmed with the one-time code, before the form is saved.", "code");
      await verifyOtp(w.tx, { purpose: counterFormPurpose(w.ctx.userId), phone: input.phone, code: str(fd, "code") });
      // The application is for the campus of the class applied for (only the person's own campus when limited to one).
      const app = await createApplication(w.tx, w.ctx, w.v, w.s, { ...input, customFields: await customFrom(w, "application", fd, {}) }, { channel: "counter", enquiryId: optionalId(fd, "enquiryId"), force: str(fd, "force") === "1" });
      const texts = await admissionConsentTexts(w.tx, w.current.school.name);
      await recordConsents(w.tx, w.ctx, app, { types, givenByName: input.fatherName ?? input.motherName ?? input.guardianName ?? "Guardian", howGiven: "admission-form-counter", texts, verifiedAt: new Date() });
      return app;
    });
    await flash({ message: existingId ? `Application ${app.applicationNo} saved.` : `Application ${app.applicationNo} made for ${app.fullName}.`, link: { href: `${BASE}/${app.id}`, label: "Open application" } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved.", data: { id: app.id } };
  } catch (err) {
    if (err instanceof DuplicateProblem) return { ok: false, message: err.message, values: formValues(fd), data: { matches: err.matches } };
    return problemState(err, fd) as DupState;
  }
}

/** New application at the counter: send the consent code to the parent's phone. */
export async function sendFormCodeAction(phone: string): Promise<{ ok: boolean; message: string; testMode?: boolean }> {
  try {
    const to = checkMobile(phone.replace(/\s/g, ""), "phone", "Parent's phone");
    const r = await inSchool("create", async (w) => {
      requireFull(w.v, "new applications");
      return startOtp(w.tx, w.ctx, { phone: to, purpose: counterFormPurpose(w.ctx.userId), schoolName: w.current.school.name, about: null });
    });
    return { ok: true, message: otpSentWords(r, `+91 ${to.slice(0, 5)} ${to.slice(5)}`), testMode: r.testMode };
  } catch (err) {
    return { ok: false, message: problemState(err)?.message ?? "The code could not be sent." };
  }
}

/** Checks the code the guardian reads out, without using it up; saving the form uses it. */
export async function checkFormCodeAction(phone: string, code: string): Promise<{ ok: boolean; message: string }> {
  try {
    const to = checkMobile(phone.replace(/\s/g, ""), "phone", "Parent's phone");
    const r = await inSchool("create", async (w) => {
      requireFull(w.v, "new applications");
      return tryOtp(w.tx, { purpose: counterFormPurpose(w.ctx.userId), phone: to, code }, new Date(), false);
    });
    return r.ok ? { ok: true, message: "Code is right." } : { ok: false, message: r.message };
  } catch (err) {
    return { ok: false, message: problemState(err)?.message ?? "The code could not be checked." };
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
  return admissionAct("edit", fd, (w) => rejectDocument(w.tx, w.ctx, w.v, w.current.school.name, id(fd, "docId", "document"), str(fd, "reason"), str(fd, "tellParent") === "on"), (r) => `Document rejected.${r.told ? " A message with the reason is on its way to the parent." : r.notSent ? ` The parent was not messaged (${r.notSent}). Please tell them by phone.` : ""}`);
}

export async function originalSeenAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => markOriginalSeen(w.tx, w.ctx, w.v, id(fd, "docId", "document")), () => "Marked: original seen at the counter.");
}

export async function remindAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => remindMissing(w.tx, w.ctx, w.v, w.current.school.name, id(fd, "id", "application")), (n) => `Reminder on its way to the parent, listing ${n} ${n === 1 ? "paper" : "papers"}.`);
}

export async function exceptionAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("approve", fd, (w) => recordPapersException(w.tx, w.ctx, w.v, id(fd, "id", "application"), str(fd, "reason")), () => "Exception recorded. The admission can be confirmed with papers pending.");
}

export async function sendCodeAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => sendConsentCode(w.tx, w.ctx, w.v, w.current.school.name, id(fd, "id", "application")), (r) => otpSentWords(r, "the parent's mobile"));
}

export async function confirmConsentAction(_: FormState<unknown>, fd: FormData) {
  // The code is checked first in its own transaction, so a wrong try is counted.
  try {
    const appId = id(fd, "id", "application");
    const pre = await inSchool("edit", async (w) => {
      requireFull(w.v, "consent");
      const app = await w.tx.application.findFirst({ where: { id: appId, archivedAt: null, ...applicationScope(w.v) }, select: { phone: true } });
      return app ? tryOtp(w.tx, { purpose: `consent:${appId}`, phone: app.phone, code: str(fd, "code") }, new Date(), false) : ({ ok: false, message: "This application was not found." } as const);
    });
    if (!pre.ok) return { ok: false, message: pre.message, errors: { code: pre.message }, values: formValues(fd) };
  } catch (e) {
    return problemState(e, fd);
  }
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
  return admissionAct("approve", fd, (w) => cancelPayment(w.tx, w.ctx, w.v, id(fd, "paymentId", "payment"), { reason: str(fd, "reason"), note: maybe(fd, "note", "Note", 300) }),
    (r) => `Receipt ${r.receiptNo ?? ""} cancelled. The record and its receipt number are kept${r.reversed ? `, and the Day Book has a reversal of ${r.amount} today` : ""}.`);
}

export async function sendFeeLinkAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => sendFeeLink(w.tx, w.ctx, w.v, id(fd, "id", "application")),
    (r) => `Payment link sent to +91 ${r.phone} by ${r.channel === "sms" ? "SMS" : r.channel === "email" ? "email" : "WhatsApp"}. The receipt is made only after Razorpay confirms the payment.`);
}
