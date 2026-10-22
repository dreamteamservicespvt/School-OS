"use server";

// Leaving & Alumni (03 §2, automation A14): start leaving with clearance,
// ask for a waiver through Approvals, mark as left on the last date, cancel,
// and the optional alumni records, donations, mentors and job board.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { dateField, formValues, optionalDate, optionalEmail, optionalIndianMobile, optionalText, parseForm, rupees, text, checkbox, type FormState } from "@/lib/forms";
import { DOCUMENT_TYPES, saveFile } from "@/lib/files";
import { formatRupees } from "@/lib/format";
import { writeAudit } from "@/lib/audit";
import { loadVisibleStudent, type Who } from "@/lib/students/access";
import { addDonation, askWaiver, cancelLeaving, completeLeaving, linkMentor, markAlumni, postJob, refreshClearance, saveAlumni, startLeaving } from "@/lib/students/leaving";
import { StudentProblem } from "@/lib/students/students";
import { BASE, attempt, attemptForm, studentAction, todayIso } from "../_lib/page";

const L = `${BASE}/leaving`;
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

const startSchema = z.object({
  studentId: z.string().refine(isId, "Choose the student."),
  type: z.enum(["TRANSFER", "WITHDRAWAL"], { message: "Choose transfer or withdrawal." }),
  reason: text("Reason", 200),
  reasonOther: optionalText("Other reason", 300),
  lastDate: dateField("Last date"),
  destinationSchool: optionalText("Destination school", 200),
});

export async function startLeavingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await studentAction("edit", { manage: true });
  const parsed = parseForm(startSchema, fd);
  if (!parsed.ok) return parsed.state;
  const values = formValues(fd);
  const d = parsed.data;
  const reason = d.reason === "Other" ? d.reasonOther ?? "" : d.reason;
  if (d.reason === "Other" && reason.trim().length < 3) return { ok: false, message: "Write the other reason.", errors: { reasonOther: "Write the other reason." }, values };
  if (d.type === "TRANSFER" && !d.destinationSchool) return { ok: false, message: "For a transfer, write the school the student is going to.", errors: { destinationSchool: "For a transfer, write the school the student is going to." }, values };
  const files = fd.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 5) return { ok: false, message: "Add at most 5 documents.", errors: { documents: "Add at most 5 documents." }, values };
  let id = "";
  let blocked = false;
  const r = await attemptForm(values, async () => {
    await withSchool(current.ctx, async (tx) => {
      await loadVisibleStudent(tx, current, d.studentId);
      const documentFileIds: string[] = [];
      for (const f of files) documentFileIds.push((await saveFile(tx, current.ctx, { file: f, purpose: "leaving-document", allowed: DOCUMENT_TYPES })).id);
      const req = await startLeaving(tx, current.ctx, { studentId: d.studentId, type: d.type, reason, lastDate: d.lastDate, destinationSchool: d.destinationSchool, documentFileIds });
      id = req.id;
      blocked = (await tx.studentClearanceCheck.count({ where: { leavingRequestId: req.id, status: { not: "CLEAR" } } })) > 0;
    }, { timeout: 60_000 });
  });
  if (!r?.ok) return r;
  await flash({ message: blocked ? "Leaving started. Some clearance checks are pending; settle them before the TC." : "Leaving started. Clearance passed, so the TC can be issued." });
  revalidatePath(L);
  redirect(`${L}/${id}`);
}

export async function refreshClearanceAction(fd: FormData) {
  const { current } = await studentAction("edit", { manage: true });
  const id = String(fd.get("id") ?? "");
  if (!isId(id)) return "This leaving request was not found.";
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const req = await tx.leavingRequest.findUnique({ where: { id } });
    if (!req) throw new StudentProblem("This leaving request was not found.");
    await loadVisibleStudent(tx, current, req.studentId);
    await refreshClearance(tx, current.ctx, id);
  }));
  if (r) return r;
  await flash({ message: "Clearance checked again." });
  revalidatePath(`${L}/${id}`);
}

export async function askWaiverAction(fd: FormData) {
  const { current } = await studentAction("edit", { manage: true });
  const checkId = String(fd.get("checkId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 500);
  if (!isId(checkId)) return "This check was not found.";
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const check = await tx.studentClearanceCheck.findFirst({ where: { id: checkId }, select: { request: { select: { studentId: true } } } });
    if (!check) throw new StudentProblem("This check was not found.");
    await loadVisibleStudent(tx, current, check.request.studentId);
    await askWaiver(tx, current.ctx, checkId, reason);
  }));
  if (r) return r;
  await flash({ message: "Waiver asked. It is waiting in Approvals for someone allowed to approve it." });
  revalidatePath(L);
}

export async function completeLeavingAction(fd: FormData) {
  const { current } = await studentAction("edit", { manage: true });
  const id = String(fd.get("id") ?? "");
  if (!isId(id)) return "This leaving request was not found.";
  const today = new Date(`${todayIso(current.school.timeZone)}T00:00:00Z`);
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const req = await tx.leavingRequest.findUnique({ where: { id } });
    if (!req) throw new StudentProblem("This leaving request was not found.");
    await loadVisibleStudent(tx, current, req.studentId);
    await completeLeaving(tx, current.ctx, id, today);
  }));
  if (r) return r;
  await flash({ message: "Marked as left. The record stays in the Left list." });
  revalidatePath(L);
}

export async function cancelLeavingAction(fd: FormData) {
  const { current } = await studentAction("edit", { manage: true });
  const id = String(fd.get("id") ?? "");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 500);
  if (!isId(id)) return "This leaving request was not found.";
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const req = await tx.leavingRequest.findUnique({ where: { id } });
    if (!req) throw new StudentProblem("This leaving request was not found.");
    await loadVisibleStudent(tx, current, req.studentId);
    await cancelLeaving(tx, current.ctx, id, reason);
  }));
  if (r) return r;
  await flash({ message: "Leaving cancelled. The student stays in the class." });
  revalidatePath(L);
}

// ---------- Alumni ----------

/** An alumni record of a student this person may see (one campus: that campus's alumni only). */
async function alumniInReach(tx: Parameters<Parameters<typeof withSchool>[1]>[0], who: Who, alumniId: string) {
  const a = await tx.alumniRecord.findFirst({ where: { id: alumniId, archivedAt: null }, select: { studentId: true } });
  if (!a) throw new StudentProblem("This alumni record was not found.");
  await loadVisibleStudent(tx, who, a.studentId);
}

export async function markAlumniAction(fd: FormData) {
  const { current, settings } = await studentAction("edit", { manage: true });
  if (!settings.alumniOn) return "Alumni records are switched off in Student Settings.";
  const ids = String(fd.get("ids") ?? "").split(",").filter(isId).slice(0, 500);
  if (ids.length === 0) return "Choose at least one graduated student.";
  let done = 0;
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    for (const s of ids) await loadVisibleStudent(tx, current, s);
    done = await markAlumni(tx, current.ctx, ids);
  }, { timeout: 60_000 }));
  if (r) return r;
  await flash({ message: done ? `${done} ${done === 1 ? "student is" : "students are"} now alumni.` : "Nobody was changed: only graduated students can be marked as alumni." });
  revalidatePath(L);
}

const alumniSchema = z.object({
  phone: optionalIndianMobile("Phone"),
  email: optionalEmail(),
  career: optionalText("Career", 300),
  higherEducation: optionalText("Higher education", 300),
  achievements: optionalText("Achievements", 1000),
  isMentor: checkbox(),
});

export async function saveAlumniAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current, settings } = await studentAction("edit", { manage: true });
  if (!settings.alumniOn) return { ok: false, message: "Alumni records are switched off in Student Settings." };
  const parsed = parseForm(alumniSchema, fd);
  if (!parsed.ok) return parsed.state;
  const r = await attemptForm(formValues(fd), () => withSchool(current.ctx, async (tx) => {
    await alumniInReach(tx, current, id);
    return saveAlumni(tx, current.ctx, id, parsed.data);
  }));
  if (r?.ok) { revalidatePath(`${L}/alumni/${id}`); return { ok: true, message: "Saved." }; }
  return r;
}

const donationSchema = z.object({
  alumniId: z.string().refine(isId, "Choose the alumnus."),
  amount: rupees("Amount", { min: 1 }),
  date: dateField("Date"),
  purpose: text("Purpose", 200),
  receiptRef: optionalText("Receipt number", 60),
});

export async function addDonationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current, settings } = await studentAction("edit", { manage: true });
  if (!settings.alumniOn) return { ok: false, message: "Alumni records are switched off in Student Settings." };
  const parsed = parseForm(donationSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const r = await attemptForm(formValues(fd), async () => {
    await withSchool(current.ctx, async (tx) => {
      await alumniInReach(tx, current, d.alumniId);
      await addDonation(tx, current.ctx, { alumniId: d.alumniId, amountPaise: d.amount, date: d.date, purpose: d.purpose, receiptRef: d.receiptRef });
    });
  });
  if (r?.ok) { revalidatePath(`${L}/alumni`); return { ok: true, message: `Donation of ${formatRupees(d.amount)} recorded. Record the receipt in Finance, Income.` }; }
  return r;
}

export async function linkMentorAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current, settings } = await studentAction("edit", { manage: true });
  if (!settings.alumniOn) return { ok: false, message: "Alumni records are switched off in Student Settings." };
  const alumniId = String(fd.get("alumniId") ?? "");
  const studentId = String(fd.get("studentId") ?? "");
  const note = String(fd.get("note") ?? "").trim().slice(0, 300) || null;
  const values = formValues(fd);
  if (!isId(alumniId)) return { ok: false, message: "Choose the alumnus.", errors: { alumniId: "Choose the alumnus." }, values };
  if (!isId(studentId)) return { ok: false, message: "Choose the student.", errors: { studentId: "Choose the student." }, values };
  const r = await attemptForm(values, () => withSchool(current.ctx, async (tx) => {
    await alumniInReach(tx, current, alumniId);
    await loadVisibleStudent(tx, current, studentId);
    await linkMentor(tx, current.ctx, alumniId, studentId, note);
  }));
  if (r?.ok) { revalidatePath(`${L}/alumni`); return { ok: true, message: "Mentor linked." }; }
  return r;
}

const jobSchema = z.object({
  title: text("Job title", 120),
  organisation: text("Organisation", 120),
  location: optionalText("Location", 120),
  description: text("Description", 2000),
  contact: text("How to apply", 300),
  applyBy: optionalDate("Apply by"),
});

export async function postJobAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current, settings } = await studentAction("edit", { manage: true });
  if (!settings.alumniOn) return { ok: false, message: "Alumni records are switched off in Student Settings." };
  const parsed = parseForm(jobSchema, fd);
  if (!parsed.ok) return parsed.state;
  const r = await attemptForm(formValues(fd), async () => { await withSchool(current.ctx, (tx) => postJob(tx, current.ctx, parsed.data)); });
  if (r?.ok) { revalidatePath(`${L}/alumni/jobs`); return { ok: true, message: "Job posted on the alumni job board." }; }
  return r;
}

export async function archiveJobAction(fd: FormData) {
  const { current } = await studentAction("archive", { manage: true });
  const id = String(fd.get("id") ?? "");
  if (!isId(id)) return "This job was not found.";
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const job = await tx.jobPost.findFirst({ where: { id, archivedAt: null } });
    if (!job) throw new StudentProblem("This job was not found.");
    await tx.jobPost.update({ where: { id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, current.ctx, { action: "archived", recordType: "Job Post", recordId: id, before: { title: job.title } });
  }));
  if (r) return r;
  await flash({ message: "Job taken off the board." });
  revalidatePath(`${L}/alumni/jobs`);
}
