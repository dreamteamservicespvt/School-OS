"use server";

// Student records: add, and each section of the Student Profile saved on its
// own (03 §2). Every action checks the role on the server, keeps the change
// in the audit log (in the lib), and works only on students the person may see.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { dateField, optionalDate, optionalEmail, optionalIndianMobile, optionalText, parseForm, text, indianMobile, checkbox, formValues, type FormState } from "@/lib/forms";
import { IMAGE_TYPES, saveFile } from "@/lib/files";
import { CATEGORIES, GENDERS, BLOOD_GROUPS, RELATIONS, STATUS_LABEL, type StudentStatusKey } from "@/lib/students/labels";
import { loadVisibleStudent } from "@/lib/students/access";
import {
  addEmergencyContact, archiveEmergencyContact, changeSection, changeStatus, createStudent, DuplicateFound, guardiansByPhone,
  moveEmergency, placeInSection, previewAdmissionNo, admissionNoTaken, saveContact, saveEnrolment, saveExtraFields, saveIdentifiers,
  savePersonal, savePreviousSchool, seatsLeft, setGuardianEmergency, setPhoto, StudentProblem,
} from "@/lib/students/students";
import { addDocument, addNote, archiveDocument, archiveNote } from "@/lib/students/records";
import { BASE, attempt, attemptForm, studentAction } from "../_lib/page";

const uuid = (label: string) => z.string().trim().regex(/^[0-9a-f-]{36}$/i, `Choose the ${label}.`);
const profile = (id: string) => `${BASE}/students/${id}`;
const choice = <T extends readonly string[]>(list: T, label: string) => z.string().trim().refine((v) => v === "" || (list as readonly string[]).includes(v), `Choose a ${label} from the list.`).transform((v) => (v === "" ? null : v));
const aadhaar = z.string().trim().transform((v) => v.replace(/\s+/g, "")).refine((v) => v === "" || /^\d{12}$/.test(v), "Aadhaar number must have 12 digits.").transform((v) => (v === "" ? null : v));

// ---------- Add student ----------

const addSchema = z.object({
  fullName: text("Full name", 120),
  sectionId: uuid("class and section"),
  dateOfBirth: dateField("Date of birth").refine((d) => d < new Date(), "Date of birth must be in the past."),
  gender: z.enum(GENDERS, { message: "Choose the gender." }),
  guardianName: text("Parent's or guardian's name", 120),
  guardianRelation: z.enum(RELATIONS, { message: "Choose the relation." }),
  guardianPhone: indianMobile("Parent's phone"),
  linkGuardianId: z.string().trim().optional().transform((v) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null)),
  admissionNo: optionalText("Admission number", 40),
  rollNo: z.string().trim().refine((v) => v === "" || /^\d{1,4}$/.test(v), "Roll number must be a whole number.").transform((v) => (v === "" ? null : Number(v))),
  admissionDate: dateField("Admission date"),
  applyFeePlan: checkbox(),
  duplicateReason: optionalText("Reason", 300),
  bloodGroup: choice(BLOOD_GROUPS, "blood group"),
  category: choice(CATEGORIES, "category"),
  religion: optionalText("Religion", 60),
  motherTongue: optionalText("Mother tongue", 60),
  address: optionalText("Address", 300),
  aadhaar,
  previousSchool: optionalText("Previous school", 200),
});

export type AddStudentData = { duplicates?: { id: string; fullName: string; admissionNo: string; why: string }[] };

export async function addStudent(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current, can } = await studentAction("create", { manage: true });
  const parsed = parseForm(addSchema, fd);
  if (!parsed.ok) return parsed.state;
  const values = formValues(fd);
  let created: { id: string; name: string; admissionNo: string; section: string } | null = null;
  try {
    created = await withSchool(current.ctx, async (tx) => {
      const r = await createStudent(tx, current.ctx, { ...parsed.data, aadhaar: can.seeRestricted ? parsed.data.aadhaar : null });
      return { id: r.student.id, name: r.student.fullName, admissionNo: r.student.admissionNo, section: `${r.section.schoolClass.name} ${r.section.name}` };
    });
  } catch (e) {
    if (e instanceof DuplicateFound) {
      return { ok: false, message: "This student may already be on record. Open the existing record, or save anyway with a reason.", values, data: { duplicates: e.matches } satisfies AddStudentData };
    }
    return attemptForm(values, async () => { throw e; });
  }
  await flash({ message: `${created.name} added to ${created.section} with admission number ${created.admissionNo}.`, link: { href: `${BASE}/new?section=${parsed.data.sectionId}`, label: "Add another" } });
  revalidatePath(BASE);
  redirect(profile(created.id));
}

/** While typing: the parents already on record with this phone, to link instead of adding again. */
export async function parentsForPhone(phone: string) {
  const { current } = await studentAction("create", { manage: true });
  const clean = phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^\d{10}$/.test(clean)) return [];
  return withSchool(current.ctx, async (tx) => {
    const found = await guardiansByPhone(tx, clean);
    return found.map((g) => ({ id: g.id, name: g.name, relationship: g.relationship, children: g.students.map((s) => s.student.fullName) }));
  });
}

/** While typing: is this admission number free, and the section's seats left. */
export async function checkAdmissionNo(admissionNo: string) {
  const { current } = await studentAction("create", { manage: true });
  const no = admissionNo.trim();
  return withSchool(current.ctx, async (tx) => {
    if (!no) return { taken: null, next: await previewAdmissionNo(tx, current.ctx) };
    const taken = await admissionNoTaken(tx, no);
    return { taken: taken ? `${taken} Use the next free number: ${await previewAdmissionNo(tx, current.ctx)}.` : null, next: null };
  });
}

export async function sectionSeats(sectionId: string) {
  const { current } = await studentAction("view");
  if (!/^[0-9a-f-]{36}$/i.test(sectionId)) return null;
  return withSchool(current.ctx, async (tx) => {
    const s = await tx.section.findFirst({ where: { id: sectionId, archivedAt: null } });
    return s ? { left: await seatsLeft(tx, s.id), seats: s.seats } : null;
  });
}

// ---------- Profile sections (each saved on its own) ----------

async function onStudent(id: string, values: Record<string, string>, fn: (tx: Parameters<Parameters<typeof withSchool>[1]>[0], ctx: { schoolId: string; userId: string | null }) => Promise<unknown>, message = "Saved.") {
  const { current } = await studentAction("edit", { manage: true });
  const result = await attemptForm(values, async () => {
    await withSchool(current.ctx, async (tx) => {
      await loadVisibleStudent(tx, current, id);
      await fn(tx, current.ctx);
    });
  });
  if (result?.ok) {
    revalidatePath(profile(id));
    return { ok: true, message };
  }
  return result;
}

const personalSchema = z.object({
  fullName: text("Full name", 120),
  dateOfBirth: dateField("Date of birth").refine((d) => d < new Date(), "Date of birth must be in the past."),
  gender: z.enum(GENDERS, { message: "Choose the gender." }),
  bloodGroup: choice(BLOOD_GROUPS, "blood group"),
  category: choice(CATEGORIES, "category"),
  religion: optionalText("Religion", 60),
  motherTongue: optionalText("Mother tongue", 60),
  aadhaar: aadhaar.optional(),
  keepAadhaar: checkbox(),
});

export async function savePersonalAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { can } = await studentAction("edit", { manage: true });
  const parsed = parseForm(personalSchema, fd);
  if (!parsed.ok) return parsed.state;
  const { keepAadhaar, aadhaar: a, ...p } = parsed.data;
  // Only people who see restricted fields can change Aadhaar; an empty box with "keep" leaves it as it is.
  const aadhaarChange = can.seeRestricted && !(keepAadhaar && !a) ? (a ?? null) : undefined;
  return onStudent(id, formValues(fd), (tx, ctx) => savePersonal(tx, ctx, id, { ...p, aadhaar: aadhaarChange }), "Personal details saved.");
}

const contactSchema = z.object({
  address: optionalText("Address", 300), city: optionalText("City", 80), state: optionalText("State", 80),
  pinCode: z.string().trim().refine((v) => v === "" || /^\d{6}$/.test(v), "PIN code must have 6 digits.").transform((v) => (v === "" ? null : v)),
  permanentAddress: optionalText("Permanent address", 300),
  studentPhone: optionalIndianMobile("Student's phone"),
  studentEmail: optionalEmail("Student's email"),
});
export async function saveContactAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(contactSchema, fd);
  if (!parsed.ok) return parsed.state;
  return onStudent(id, formValues(fd), (tx, ctx) => saveContact(tx, ctx, id, parsed.data), "Contact details saved.");
}

const enrolmentSchema = z.object({
  admissionNo: text("Admission number", 40),
  admissionDate: optionalDate("Admission date"),
  rollNo: z.string().trim().refine((v) => v === "" || /^\d{1,4}$/.test(v), "Roll number must be a whole number.").transform((v) => (v === "" ? null : Number(v))),
});
export async function saveEnrolmentAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(enrolmentSchema, fd);
  if (!parsed.ok) return parsed.state;
  return onStudent(id, formValues(fd), (tx, ctx) => saveEnrolment(tx, ctx, id, parsed.data), "Enrolment details saved. The old values are kept in the history.");
}

const previousSchema = z.object({
  schoolName: text("School name", 200), board: optionalText("Board", 60), lastClass: optionalText("Last class", 40),
  year: optionalText("Year", 20), marks: optionalText("Marks or %", 40), correctionReason: optionalText("Reason", 300),
});
export async function savePreviousSchoolAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { can } = await studentAction("edit", { manage: true });
  const parsed = parseForm(previousSchema, fd);
  if (!parsed.ok) return parsed.state;
  const { correctionReason, ...p } = parsed.data;
  return onStudent(id, formValues(fd), (tx, ctx) => savePreviousSchool(tx, ctx, id, p, { allowed: can.seeRestricted, reason: correctionReason }), "Previous school saved.");
}

export async function saveIdentifiersAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { can, settings } = await studentAction("edit", { manage: true });
  if (!can.seeRestricted) return { ok: false, message: "Only the School Admin and Principal can change identifiers." };
  const values = formValues(fd);
  const errors: Record<string, string> = {};
  const apaar = (values.apaarId ?? "").replace(/\s+/g, "");
  const pen = (values.pen ?? "").replace(/\s+/g, "");
  if (apaar && !/^\d{12}$/.test(apaar)) errors.apaarId = "APAAR ID must have 12 digits.";
  if (pen && !/^\d{11}$/.test(pen)) errors.pen = "PEN must have 11 digits.";
  const others: Record<string, string | null> = {};
  for (const t of settings.identifierTypes.filter((t) => !["apaar", "pen", "aadhaar"].includes(t.key))) {
    const v = (values[`id_${t.key}`] ?? "").trim();
    if (v.length > 60) errors[`id_${t.key}`] = `${t.label} can be at most 60 characters.`;
    // An empty box with a value on record keeps it, unless "remove" is ticked.
    if (v) others[t.key] = v;
    else if (values[`clear_${t.key}`] === "on") others[t.key] = null;
  }
  if (Object.keys(errors).length) return { ok: false, message: Object.values(errors)[0], errors, values };
  return onStudent(id, values, (tx, ctx) => saveIdentifiers(tx, ctx, id, { apaarId: apaar || null, pen: pen || null, others }), "Identifiers saved.");
}

export async function saveExtraFieldsAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current, can } = await studentAction("edit", { manage: true });
  const values = formValues(fd);
  const fields = await withSchool(current.ctx, (tx) => tx.customField.findMany({ where: { recordType: "student", archivedAt: null } }));
  const errors: Record<string, string> = {};
  const out: Record<string, string | null> = {};
  for (const f of fields) {
    if (f.visibility === "restricted" && !can.seeRestricted) continue;
    const raw = f.fieldType === "yesno" ? (values[`cf_${f.key}`] === "on" ? "Yes" : "No") : (values[`cf_${f.key}`] ?? "").trim();
    if (f.required && !raw) { errors[`cf_${f.key}`] = `${f.label} is needed.`; continue; }
    if (raw && f.fieldType === "number" && !/^-?\d+(\.\d+)?$/.test(raw)) errors[`cf_${f.key}`] = `${f.label} must be a number.`;
    if (raw && f.fieldType === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) errors[`cf_${f.key}`] = `${f.label} is not a real date.`;
    if (raw && f.fieldType === "choice" && !f.choices.includes(raw)) errors[`cf_${f.key}`] = `Choose ${f.label.toLowerCase()} from the list.`;
    if (raw.length > 500) errors[`cf_${f.key}`] = `${f.label} can be at most 500 characters.`;
    out[f.key] = raw || null;
  }
  if (Object.keys(errors).length) return { ok: false, message: Object.keys(errors).length === 1 ? Object.values(errors)[0] : `Please fix ${Object.keys(errors).length} things before saving.`, errors, values };
  return onStudent(id, values, (tx, ctx) => saveExtraFields(tx, ctx, id, out), "Extra fields saved.");
}

// ---------- Photo ----------

export async function uploadPhoto(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a photo (JPG or PNG).", errors: { photo: "Choose a photo (JPG or PNG)." } };
  return onStudent(id, {}, async (tx, ctx) => {
    const saved = await saveFile(tx, ctx, { file, purpose: "student-photo", allowed: IMAGE_TYPES, maxImageWidth: 600 });
    await setPhoto(tx, ctx, id, saved.id);
  }, "Photo saved.");
}

export async function removePhoto(id: string) {
  const { current } = await studentAction("edit", { manage: true });
  return attempt(() => withSchool(current.ctx, async (tx) => {
    await loadVisibleStudent(tx, current, id);
    await setPhoto(tx, current.ctx, id, null);
  }));
}

// ---------- Status and section ----------

const statusSchema = z.object({
  to: z.string().trim().min(1, "Choose the new status."),
  effectiveDate: dateField("Effective date"),
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(300, "Reason can be at most 300 characters."),
});
export async function changeStatusAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await studentAction("edit", { manage: true });
  const parsed = parseForm(statusSchema, fd);
  if (!parsed.ok) return parsed.state;
  const values = formValues(fd);
  let waiting = false;
  const r = await attemptForm(values, async () => {
    await withSchool(current.ctx, async (tx) => {
      await loadVisibleStudent(tx, current, id);
      waiting = (await changeStatus(tx, current.ctx, id, parsed.data.to as StudentStatusKey, parsed.data.effectiveDate, parsed.data.reason)).waiting;
    });
  });
  if (!r?.ok) return r;
  await flash({ message: waiting ? "Re-admission sent to Approvals. The status changes when it is approved." : `Status changed to ${STATUS_LABEL[parsed.data.to as StudentStatusKey]}.` });
  revalidatePath(profile(id));
  redirect(profile(id));
}

const sectionSchema = z.object({ sectionId: uuid("new section"), reason: optionalText("Reason", 300) });
export async function changeSectionAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await studentAction("edit", { manage: true });
  const parsed = parseForm(sectionSchema, fd);
  if (!parsed.ok) return parsed.state;
  let undo: { id: string; label: string } | null = null;
  const r = await attemptForm(formValues(fd), async () => {
    await withSchool(current.ctx, async (tx) => {
      await loadVisibleStudent(tx, current, id);
      const c = await changeSection(tx, current.ctx, id, parsed.data.sectionId, parsed.data.reason);
      undo = { id: c.change.id, label: c.label };
    });
  });
  if (!r?.ok || !undo) return r;
  const u = undo as { id: string; label: string };
  await flash({ message: `Moved to ${u.label}. The old section stays in the history.`, undo: { kind: "student-section-change", id: u.id } });
  revalidatePath(profile(id));
  redirect(profile(id));
}

export async function placeInSectionAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await studentAction("edit", { manage: true });
  const parsed = parseForm(z.object({ sectionId: uuid("class and section") }), fd);
  if (!parsed.ok) return parsed.state;
  return attemptForm(formValues(fd), async () => {
    await withSchool(current.ctx, async (tx) => {
      await loadVisibleStudent(tx, current, id);
      await placeInSection(tx, current.ctx, id, parsed.data.sectionId);
    });
    revalidatePath(profile(id));
    return { ok: true, message: "Placed in the section for this year." };
  });
}

// ---------- Notes ----------

export async function addNoteAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current, can } = await studentAction("create");
  if (!can.contribute) return { ok: false, message: "You can read notes but not add them." };
  const text = String(fd.get("text") ?? "").trim();
  if (text.length < 2) return { ok: false, message: "Write the note.", errors: { text: "Write the note." } };
  if (text.length > 2000) return { ok: false, message: "A note can be at most 2000 characters.", errors: { text: "A note can be at most 2000 characters." }, values: { text } };
  const roles = fd.getAll("roles").map(String).filter((r) => /^[a-z-]{2,40}$/.test(r));
  // Ticking roles makes the note private to them (and the author); none ticked = everyone who opens the profile.
  const isPrivate = roles.length > 0;
  const r = await attemptForm({ text }, async () => {
    await withSchool(current.ctx, async (tx) => {
      await loadVisibleStudent(tx, current, id);
      await addNote(tx, current.ctx, id, { text, visibleToRoles: isPrivate ? roles : [] });
    });
  });
  if (r?.ok) { revalidatePath(profile(id)); return { ok: true, message: isPrivate ? "Private note added. Only the roles you chose (and you) can see it." : "Note added." }; }
  return r;
}

export async function archiveNoteAction(fd: FormData) {
  const { current, can } = await studentAction("archive");
  const noteId = String(fd.get("noteId") ?? "");
  const studentId = String(fd.get("studentId") ?? "");
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    await loadVisibleStudent(tx, current, studentId);
    await archiveNote(tx, current.ctx, noteId, can.manage);
  }));
  if (!r) revalidatePath(profile(studentId));
  return r;
}

// ---------- Emergency contacts ----------

const contactPersonSchema = z.object({ name: text("Name", 120), relation: text("Relation", 40), phone: indianMobile("Phone") });
export async function addEmergencyAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(contactPersonSchema, fd);
  if (!parsed.ok) return parsed.state;
  return onStudent(id, formValues(fd), (tx, ctx) => addEmergencyContact(tx, ctx, id, parsed.data), "Emergency contact added at the end of the list.");
}

export async function emergencyAction(fd: FormData) {
  const { current } = await studentAction("edit", { manage: true });
  const studentId = String(fd.get("studentId") ?? "");
  const op = String(fd.get("op") ?? "");
  const itemId = String(fd.get("itemId") ?? "");
  const kind = fd.get("kind") === "guardian" ? "guardian" : "contact";
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    await loadVisibleStudent(tx, current, studentId);
    if (op === "up" || op === "down") await moveEmergency(tx, current.ctx, studentId, kind, itemId, op);
    else if (op === "remove" && kind === "contact") await archiveEmergencyContact(tx, current.ctx, itemId);
    else if (op === "remove" && kind === "guardian") await setGuardianEmergency(tx, current.ctx, itemId, false);
    else if (op === "add-guardian") await setGuardianEmergency(tx, current.ctx, itemId, true);
    else throw new StudentProblem("That did not work. Please try again.");
  }));
  if (!r) revalidatePath(profile(studentId));
  return r;
}

// ---------- Documents ----------

export async function uploadDocument(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current, can } = await studentAction("create");
  if (!can.seeDocuments || !can.contribute) return { ok: false, message: "You can see documents but not upload them." };
  const file = fd.get("file");
  const kind = String(fd.get("kind") ?? "").trim();
  const other = String(fd.get("kindOther") ?? "").trim();
  const values = { kind, kindOther: other, note: String(fd.get("note") ?? ""), guardianId: String(fd.get("guardianId") ?? "") };
  const finalKind = kind === "Other" ? other : kind;
  if (!finalKind) return { ok: false, message: "Choose what the document is.", errors: { [kind === "Other" ? "kindOther" : "kind"]: "Choose what the document is." }, values };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the file to upload.", errors: { file: "Choose the file to upload." }, values };
  const guardianId = /^[0-9a-f-]{36}$/i.test(values.guardianId) ? values.guardianId : null;
  const r = await attemptForm(values, async () => {
    await withSchool(current.ctx, async (tx) => {
      await loadVisibleStudent(tx, current, id);
      await addDocument(tx, current.ctx, id, { kind: finalKind.slice(0, 80), file, note: values.note.trim().slice(0, 300) || null, guardianId });
    });
  });
  if (r?.ok) { revalidatePath(profile(id)); return { ok: true, message: `${finalKind} uploaded.` }; }
  return r;
}

export async function archiveDocumentAction(fd: FormData) {
  const { current } = await studentAction("archive", { manage: true });
  const studentId = String(fd.get("studentId") ?? "");
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    await loadVisibleStudent(tx, current, studentId);
    const doc = await tx.studentDocument.findFirst({ where: { id: String(fd.get("documentId") ?? ""), studentId } });
    if (!doc) throw new StudentProblem("This document was not found.");
    await archiveDocument(tx, current.ctx, doc.id);
  }));
  if (!r) revalidatePath(profile(studentId));
  return r;
}
