"use server";

// Certificates & ID Cards (03 §2): request or issue certificates, decide the
// ones waiting for approval, issue approved ones, cancel with a reason;
// ID card replacements and RFID numbers.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CertificateType } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { formValues, type FormState } from "@/lib/forms";
import { writeAudit } from "@/lib/audit";
import { decide } from "@/lib/approvals";
import { loadVisibleStudent } from "@/lib/students/access";
import { cancelCertificate, issueCertificate, requestCertificate } from "@/lib/students/certificates";
import { replaceCard } from "@/lib/students/id-cards";
import { CERTIFICATE_LABEL } from "@/lib/students/labels";
import { StudentProblem } from "@/lib/students/students";
import { BASE, attempt, attemptForm, studentAction } from "../_lib/page";

const C = `${BASE}/certificates`;
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const TYPES = Object.keys(CERTIFICATE_LABEL) as CertificateType[];

export async function requestCertificateAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current, settings } = await studentAction("create", { manage: true });
  const values = formValues(fd);
  const studentIds = [...new Set(fd.getAll("studentIds").map(String).filter(isId))].slice(0, 200);
  values.studentIds = studentIds.join(",");
  const type = String(fd.get("type") ?? "") as CertificateType;
  const purpose = String(fd.get("purpose") ?? "").trim().slice(0, 200) || null;
  const issueRaw = String(fd.get("issueDate") ?? "");
  const signatoryId = String(fd.get("signatoryId") ?? "");
  const conduct = String(fd.get("conduct") ?? "").trim().slice(0, 60) || null;
  const duplicateReason = String(fd.get("duplicateReason") ?? "").trim().slice(0, 300) || null;
  const errors: Record<string, string> = {};
  if (studentIds.length === 0) errors.studentIds = "Choose the student.";
  if (!TYPES.includes(type)) errors.type = "Choose the certificate type.";
  else if (type === "MIGRATION" && !settings.migrationOn) errors.type = "Migration certificates are switched off in Student Settings.";
  if (type === "TC" && studentIds.length > 1) errors.studentIds = "A TC is given one student at a time, after clearance.";
  if (type === "BONAFIDE" && !purpose) errors.purpose = "Write the purpose, for example \"bank account opening\".";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueRaw)) errors.issueDate = "Choose the date of issue.";
  if (Object.keys(errors).length) return { ok: false, message: Object.keys(errors).length === 1 ? Object.values(errors)[0] : `Please fix ${Object.keys(errors).length} things before saving.`, errors, values };
  const ids: string[] = [];
  const r = await attemptForm(values, async () => {
    await withSchool(current.ctx, async (tx) => {
      for (const s of studentIds) {
        await loadVisibleStudent(tx, current, s);
        const cert = await requestCertificate(tx, current.ctx, { studentId: s, type, purpose, issueDate: new Date(`${issueRaw}T00:00:00Z`), signatoryId: isId(signatoryId) ? signatoryId : null, conduct, duplicateReason });
        ids.push(cert.id);
      }
    }, { timeout: 60_000 });
  });
  if (!r?.ok) return r;
  const waiting = await withSchool(current.ctx, (tx) => tx.certificate.count({ where: { id: { in: ids }, status: "REQUESTED" } }));
  const label = CERTIFICATE_LABEL[type];
  if (ids.length === 1) {
    await flash({ message: waiting ? `${label} sent for approval. It gets its number when approved.` : `${label} issued. Print it below.` });
    redirect(`${C}/${ids[0]}`);
  }
  await flash({ message: waiting ? `${ids.length} certificates sent for approval.` : `${ids.length} certificates issued.`, link: waiting ? undefined : { href: `${C}/print?ids=${ids.join(",")}`, label: "Print all" } });
  redirect(`${C}?type=${type}`);
}

/** Approve or reject a certificate request here, as in Approvals (same rules: not your own, only the approver). */
export async function decideCertificateAction(fd: FormData) {
  const { current } = await studentAction("approve");
  const id = String(fd.get("id") ?? "");
  const decision = String(fd.get("decision") ?? "");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 500) || null;
  if (!isId(id) || (decision !== "approve" && decision !== "reject")) return "This request was not found.";
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const cert = await tx.certificate.findUnique({ where: { id } });
    if (!cert?.approvalId || cert.status !== "REQUESTED") throw new StudentProblem("This certificate is not waiting for approval.");
    await decide(tx, current.ctx, cert.approvalId, decision, reason);
  }));
  if (r) return r;
  await flash({ message: decision === "approve" ? "Approved. The certificate has its number and can be issued." : "Not approved. The person who asked has been told." });
  revalidatePath(C);
}

export async function issueCertificateAction(fd: FormData) {
  const { current } = await studentAction("edit", { manage: true });
  const id = String(fd.get("id") ?? "");
  if (!isId(id)) return "This certificate was not found.";
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const cert = await tx.certificate.findUnique({ where: { id } });
    if (!cert) throw new StudentProblem("This certificate was not found.");
    await loadVisibleStudent(tx, current, cert.studentId);
    await issueCertificate(tx, current.ctx, id);
  }));
  if (r) return r;
  await flash({ message: "Issued. Print or download the PDF." });
  revalidatePath(`${C}/${id}`);
}

export async function cancelCertificateAction(fd: FormData) {
  const { current } = await studentAction("edit", { manage: true });
  const id = String(fd.get("id") ?? "");
  const reason = String(fd.get("reason") ?? "");
  if (!isId(id)) return "This certificate was not found.";
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const cert = await tx.certificate.findUnique({ where: { id } });
    if (!cert) throw new StudentProblem("This certificate was not found.");
    await loadVisibleStudent(tx, current, cert.studentId);
    await cancelCertificate(tx, current.ctx, id, reason);
  }));
  if (r) return r;
  await flash({ message: "Certificate cancelled. Its number is not used again, and the QR check now says Cancelled." });
  revalidatePath(`${C}/${id}`);
}

// ---------- ID cards ----------

export async function replaceCardAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await studentAction("edit", { manage: true });
  const studentId = String(fd.get("studentId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 300);
  const values = formValues(fd);
  if (!isId(studentId)) return { ok: false, message: "Choose the student.", errors: { studentId: "Choose the student." }, values };
  if (reason.length < 3) return { ok: false, message: "Give the reason for the reprint.", errors: { reason: "Give the reason for the reprint." }, values };
  let cardId = "";
  const r = await attemptForm(values, async () => {
    await withSchool(current.ctx, async (tx) => {
      await loadVisibleStudent(tx, current, studentId);
      cardId = (await replaceCard(tx, current.ctx, studentId, reason)).id;
    });
  });
  if (!r?.ok) return r;
  revalidatePath(`${C}/id-cards`);
  return { ok: true, message: "Replacement recorded. The old card is kept on record as replaced.", data: { href: `${C}/id-cards/print?replacement=${cardId}` } };
}

export async function saveRfidAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current, settings } = await studentAction("edit", { manage: true });
  if (!settings.rfidOn) return { ok: false, message: "RFID cards are switched off in Student Settings." };
  const studentId = String(fd.get("studentId") ?? "");
  const rfidNo = String(fd.get("rfidNo") ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const values = formValues(fd);
  if (!isId(studentId)) return { ok: false, message: "Choose the student.", errors: { studentId: "Choose the student." }, values };
  if (rfidNo && !/^[0-9A-F]{4,32}$/.test(rfidNo)) return { ok: false, message: "The RFID number has 4 to 32 letters A to F and digits, as printed on the card.", errors: { rfidNo: "The RFID number has 4 to 32 letters A to F and digits, as printed on the card." }, values };
  const r = await attemptForm(values, async () => {
    await withSchool(current.ctx, async (tx) => {
      await loadVisibleStudent(tx, current, studentId);
      const before = await tx.studentRfid.findUnique({ where: { studentId } });
      if (rfidNo) {
        const taken = await tx.studentRfid.findFirst({ where: { rfidNo, studentId: { not: studentId } } });
        if (taken) throw new StudentProblem("This RFID card is already given to another student.", "rfidNo");
        await tx.studentRfid.upsert({ where: { studentId }, create: { schoolId: current.ctx.schoolId, studentId, rfidNo, updatedById: current.ctx.userId }, update: { rfidNo, updatedById: current.ctx.userId } });
      } else if (before) {
        throw new StudentProblem("Type the RFID number. To give the student a new card, type the new number.", "rfidNo");
      } else {
        throw new StudentProblem("Type the RFID number.", "rfidNo");
      }
      await writeAudit(tx, current.ctx, { action: "changed", recordType: "Student RFID", recordId: studentId, before: before ? { rfidNo: before.rfidNo } : null, after: { rfidNo } });
    });
  });
  if (r?.ok) { revalidatePath(`${C}/id-cards`); return { ok: true, message: "RFID number saved." }; }
  return r;
}
