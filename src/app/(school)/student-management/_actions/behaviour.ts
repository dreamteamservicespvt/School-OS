"use server";

// Behaviour & Counselling (03 §2): incidents, warnings, suspensions, rewards,
// points, referral to counselling, counselling cases and sessions (highly
// restricted), and career guidance.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withSchool, type Tx } from "@/lib/db";
import { flash } from "@/lib/flash";
import { dateField, formValues, optionalDate, optionalText, parseForm, checkbox, type FormState } from "@/lib/forms";
import { IMAGE_TYPES, saveFile } from "@/lib/files";
import { loadVisibleStudent, type Who } from "@/lib/students/access";
import { addCareerRecord, addSession, adjustPoints, archiveIncident, closeIncident, referToCounselling, reportIncident, saveCase, updateApplicationStatus } from "@/lib/students/behaviour";
import { APPLICATION_STATUSES, CAREER_KINDS } from "@/lib/students/labels";
import { StudentProblem } from "@/lib/students/students";
import { BASE, attempt, attemptForm, studentAction } from "../_lib/page";

const B = `${BASE}/behaviour`;
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** An incident the person may change: every student on it is within their reach. */
async function visibleIncident(tx: Tx, who: Who, incidentId: string) {
  const inc = await tx.behaviourIncident.findFirst({ where: { id: incidentId, archivedAt: null }, include: { students: true } });
  if (!inc) throw new StudentProblem("This record was not found.");
  for (const s of inc.students) await loadVisibleStudent(tx, who, s.studentId);
  return inc;
}

const incidentSchema = z.object({
  typeKey: z.string().trim().min(1, "Choose the type."),
  description: z.string().trim().min(3, "Write what happened, in a few words.").max(1000, "At most 1000 characters."),
  date: dateField("Date"),
  actionTaken: optionalText("Action taken", 500),
  informParent: checkbox(),
  points: z.string().trim().refine((v) => v === "" || /^-?\d{1,3}$/.test(v), "Points must be a whole number.").transform((v) => (v === "" ? null : Number(v))),
  suspensionFrom: optionalDate("From date"),
  suspensionTo: optionalDate("To date"),
  approvedBy: optionalText("Approved by", 120),
});

export async function reportIncidentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current, can } = await studentAction("create");
  if (!can.contribute || !can.seeBehaviour) return { ok: false, message: "You can see behaviour records but not report them." };
  const parsed = parseForm(incidentSchema, fd);
  if (!parsed.ok) return parsed.state;
  const values = formValues(fd);
  const studentIds = [...new Set(fd.getAll("studentIds").map(String).filter(isId))];
  values.studentIds = studentIds.join(",");
  if (studentIds.length === 0) return { ok: false, message: "Choose at least one student.", errors: { studentIds: "Choose at least one student." }, values };
  const photo = fd.get("photo");
  let id = "";
  let told = "";
  const r = await attemptForm(values, async () => {
    await withSchool(current.ctx, async (tx) => {
      for (const s of studentIds) await loadVisibleStudent(tx, current, s);
      const photoFileId = photo instanceof File && photo.size > 0 ? (await saveFile(tx, current.ctx, { file: photo, purpose: "behaviour-photo", allowed: IMAGE_TYPES, maxImageWidth: 1600 })).id : null;
      const inc = await reportIncident(tx, current.ctx, { ...parsed.data, studentIds, photoFileId });
      id = inc.id;
      if (inc.parentMessage) {
        const m = inc.parentMessage;
        told = m.sent ? ` ${m.people === 1 ? "The parent is" : `${m.people} parents are`} being told by message.${m.note ? ` ${m.note}` : ""}` : ` ${m.note ?? "The parent was not told."}`;
      }
    });
  });
  if (!r?.ok) return r;
  await flash({ message: `Recorded for ${studentIds.length} ${studentIds.length === 1 ? "student" : "students"}.${told}`, link: { href: `${B}/new`, label: "Report another" } });
  revalidatePath(B);
  redirect(studentIds.length === 1 && fd.get("back") === "profile" ? `${BASE}/students/${studentIds[0]}?tab=behaviour` : `${B}/${id}`);
}

export async function closeIncidentAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current, can } = await studentAction("edit");
  if (!can.contribute) return { ok: false, message: "You can see this record but not change it." };
  const action = String(fd.get("actionTaken") ?? "").trim().slice(0, 500) || null;
  const r = await attemptForm(formValues(fd), async () => {
    await withSchool(current.ctx, async (tx) => {
      await visibleIncident(tx, current, id);
      await closeIncident(tx, current.ctx, id, action);
    });
  });
  if (r?.ok) { revalidatePath(`${B}/${id}`); return { ok: true, message: "Saved." }; }
  return r;
}

export async function archiveIncidentAction(fd: FormData) {
  const { current } = await studentAction("archive", { manage: true });
  const id = String(fd.get("id") ?? "");
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    await visibleIncident(tx, current, id);
    await archiveIncident(tx, current.ctx, id);
  }));
  if (r) return r;
  await flash({ message: "Record archived. Points from it were reversed." });
  redirect(B);
}

export async function adjustPointsAction(studentId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current, can } = await studentAction("edit");
  if (!can.contribute) return { ok: false, message: "You can see points but not change them." };
  const raw = String(fd.get("points") ?? "").trim();
  const reason = String(fd.get("reason") ?? "").trim();
  const values = { points: raw, reason };
  if (!/^-?\d{1,3}$/.test(raw)) return { ok: false, message: "Points must be a whole number, for example 2 or -2.", errors: { points: "Points must be a whole number, for example 2 or -2." }, values };
  const r = await attemptForm(values, async () => {
    await withSchool(current.ctx, async (tx) => {
      await loadVisibleStudent(tx, current, studentId);
      await adjustPoints(tx, current.ctx, studentId, Number(raw), reason);
    });
  });
  if (r?.ok) { revalidatePath(`${BASE}/students/${studentId}`); return { ok: true, message: "Points saved." }; }
  return r;
}

// ---------- Counselling ----------

export async function referAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current, can } = await studentAction("create");
  if (!can.contribute) return { ok: false, message: "You cannot refer students to counselling." };
  const studentId = String(fd.get("studentId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 500);
  const incidentId = String(fd.get("incidentId") ?? "");
  const counsellorId = String(fd.get("counsellorId") ?? "");
  const values = formValues(fd);
  if (!isId(studentId)) return { ok: false, message: "Choose the student.", errors: { studentId: "Choose the student." }, values };
  let caseId = "";
  const r = await attemptForm(values, async () => {
    await withSchool(current.ctx, async (tx) => {
      await loadVisibleStudent(tx, current, studentId);
      caseId = (await referToCounselling(tx, current.ctx, { studentId, reason, counsellorId: isId(counsellorId) ? counsellorId : null, incidentId: isId(incidentId) ? incidentId : null })).id;
    });
  });
  if (!r?.ok) return r;
  await flash({ message: "Referred to counselling. The counsellor has been told." });
  redirect(can.seeCounselling ? `${B}/counselling/${caseId}` : `${BASE}/students/${studentId}?tab=behaviour`);
}

/** Only allowed staff open a case: roles set in Student Settings, and the counsellor it is given to. */
async function visibleCase(tx: Tx, who: Who & { ctx: { userId: string | null } }, seeCounselling: boolean, caseId: string) {
  const c = await tx.counsellingCase.findFirst({ where: { id: caseId, archivedAt: null } });
  if (!c || (!seeCounselling && c.counsellorId !== who.ctx.userId)) throw new StudentProblem("This case was not found.");
  return c;
}

const caseSchema = z.object({
  actionPlan: optionalText("Action plan", 2000),
  outsideReferral: optionalText("Outside referral", 500),
  nextSessionOn: optionalDate("Next session"),
  counsellorId: z.string().optional().transform((v) => (v && isId(v) ? v : null)),
  status: z.enum(["OPEN", "CLOSED"], { message: "Choose the status." }),
});
export async function saveCaseAction(caseId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current, can } = await studentAction("edit");
  const parsed = parseForm(caseSchema, fd);
  if (!parsed.ok) return parsed.state;
  const r = await attemptForm(formValues(fd), async () => {
    await withSchool(current.ctx, async (tx) => {
      await visibleCase(tx, current, can.seeCounselling, caseId);
      await saveCase(tx, current.ctx, caseId, parsed.data);
    });
  });
  if (r?.ok) { revalidatePath(`${B}/counselling/${caseId}`); return { ok: true, message: "Case saved." }; }
  return r;
}

const sessionSchema = z.object({
  date: dateField("Date"),
  summary: z.string().trim().min(3, "Write what was done in the session.").max(1000, "At most 1000 characters."),
  confidential: optionalText("Confidential notes", 5000),
  followUpOn: optionalDate("Follow-up date"),
});
export async function addSessionAction(caseId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current, can } = await studentAction("edit");
  const parsed = parseForm(sessionSchema, fd);
  if (!parsed.ok) return parsed.state;
  const r = await attemptForm(formValues(fd), async () => {
    await withSchool(current.ctx, async (tx) => {
      await visibleCase(tx, current, can.seeCounselling, caseId);
      await addSession(tx, current.ctx, caseId, parsed.data, can.seeCounsellingNotes);
    });
  });
  if (r?.ok) { revalidatePath(`${B}/counselling/${caseId}`); return { ok: true, message: "Session recorded." }; }
  return r;
}

// ---------- Career guidance ----------

const careerSchema = z.object({
  studentId: z.string().regex(/^[0-9a-f-]{36}$/i, "Choose the student."),
  kind: z.string().refine((v) => CAREER_KINDS.some((k) => k.key === v), "Choose the kind."),
  title: z.string().trim().min(2, "Give a title.").max(200, "At most 200 characters."),
  details: optionalText("Details", 2000),
  college: optionalText("College", 200),
  course: optionalText("Course", 200),
  status: z.string().optional().transform((v) => (v && (APPLICATION_STATUSES as readonly string[]).includes(v) ? v : null)),
  deadline: optionalDate("Deadline"),
});
export async function careerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current, can } = await studentAction("create");
  if (!can.contribute) return { ok: false, message: "You can see career records but not add them." };
  const parsed = parseForm(careerSchema, fd);
  if (!parsed.ok) return parsed.state;
  const r = await attemptForm(formValues(fd), async () => {
    await withSchool(current.ctx, async (tx) => {
      await loadVisibleStudent(tx, current, parsed.data.studentId);
      await addCareerRecord(tx, current.ctx, { ...parsed.data, status: parsed.data.kind === "college-application" ? parsed.data.status ?? "Planned" : null });
    });
  });
  if (r?.ok) { revalidatePath(`${B}/career`); return { ok: true, message: "Career record added." }; }
  return r;
}

export async function careerStatusAction(fd: FormData) {
  const { current, can } = await studentAction("edit");
  if (!can.contribute) return "You cannot change career records.";
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!(APPLICATION_STATUSES as readonly string[]).includes(status)) return "Choose a status from the list.";
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const rec = await tx.careerRecord.findFirst({ where: { id, archivedAt: null } });
    if (!rec) throw new StudentProblem("This record was not found.");
    await loadVisibleStudent(tx, current, rec.studentId);
    await updateApplicationStatus(tx, current.ctx, id, status);
  }));
  if (!r) revalidatePath(`${B}/career`);
  return r;
}
