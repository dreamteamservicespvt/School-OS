"use server";

// Parents & Guardians (03 §2): add or edit a parent, link to children
// (siblings share one record), primary contact, pickup list, custody
// restriction, merge, consent requests and withdrawals, Parent Link.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withSchool, type Tx } from "@/lib/db";
import { flash } from "@/lib/flash";
import { checkbox, formValues, indianMobile, optionalDate, optionalEmail, optionalIndianMobile, optionalText, parseForm, text, type FormState } from "@/lib/forms";
import { loadVisibleStudent, type Who } from "@/lib/students/access";
import { createGuardian, linkGuardian, mergeGuardians, parentLinkProvider, PhoneOnRecord, setPickup, setPrimary, setRestriction, unlinkGuardian, updateGuardian } from "@/lib/students/guardians";
import { requestConsent, withdrawConsent } from "@/lib/students/consent";
import { CONSENT_TYPES, LANGUAGES, RELATIONS } from "@/lib/students/labels";
import { StudentProblem } from "@/lib/students/students";
import { studentScope } from "@/lib/students/access";
import { BASE, attempt, attemptForm, studentAction } from "../_lib/page";

const profile = (id: string) => `${BASE}/students/${id}`;
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** A link the person may change: its student must be one they can see. */
async function visibleLink(tx: Tx, who: Who, linkId: string) {
  const link = await tx.studentGuardian.findFirst({ where: { id: linkId, archivedAt: null } });
  if (!link) throw new StudentProblem("This link was not found.");
  await loadVisibleStudent(tx, who, link.studentId);
  return link;
}

/** A parent the person may see: linked to at least one student within their reach. */
async function visibleGuardian(tx: Tx, who: Who, guardianId: string) {
  if (!isId(guardianId)) throw new StudentProblem("This parent was not found.");
  const scope = await studentScope(tx, who);
  const g = await tx.guardian.findFirst({ where: { id: guardianId, archivedAt: null, OR: [{ students: { none: { archivedAt: null } } }, { students: { some: { archivedAt: null, student: scope } } }] } });
  if (!g) throw new StudentProblem("This parent was not found, or is not a parent of your students.");
  return g;
}

export async function setPrimaryAction(fd: FormData) {
  const { current } = await studentAction("edit", { manage: true });
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const link = await visibleLink(tx, current, String(fd.get("linkId")));
    await setPrimary(tx, current.ctx, link.id);
  }));
  if (!r) { revalidatePath(profile(String(fd.get("studentId")))); revalidatePath(`${BASE}/guardians`, "layout"); }
  return r;
}

export async function pickupAction(fd: FormData) {
  const { current } = await studentAction("edit", { manage: true });
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const link = await visibleLink(tx, current, String(fd.get("linkId")));
    await setPickup(tx, current.ctx, link.id, fd.get("on") === "1");
  }));
  if (!r) revalidatePath(profile(String(fd.get("studentId"))));
  return r;
}

export async function unlinkGuardianAction(fd: FormData) {
  const { current } = await studentAction("edit", { manage: true });
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const link = await visibleLink(tx, current, String(fd.get("linkId")));
    await unlinkGuardian(tx, current.ctx, link.id);
  }));
  if (!r) revalidatePath(profile(String(fd.get("studentId"))));
  return r;
}

const linkSettingsSchema = z.object({
  relationship: z.enum(RELATIONS, { message: "Choose the relation." }),
  restricted: checkbox(),
  restriction: optionalText("Restriction note", 500),
  reason: optionalText("Reason", 300),
});

/** The link's relation, and the custody / access restriction (School Admin or Principal only, with a reason). */
export async function linkSettingsAction(linkId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current, can } = await studentAction("edit", { manage: true });
  const parsed = parseForm(linkSettingsSchema, fd);
  if (!parsed.ok) return parsed.state;
  const values = formValues(fd);
  const d = parsed.data;
  let studentId = "";
  const r = await attemptForm(values, async () => {
    await withSchool(current.ctx, async (tx) => {
      const link = await visibleLink(tx, current, linkId);
      studentId = link.studentId;
      if (link.relationship !== d.relationship) {
        await tx.studentGuardian.update({ where: { id: link.id }, data: { relationship: d.relationship } });
      }
      // Only the School Admin or Principal see the restriction fields; for anyone else they are left as they are.
      if (can.seeRestricted && d.restricted && !d.restriction) throw new StudentProblem("Write the restriction note (what the court order or family says).", "restriction");
      const wantNote = d.restricted ? d.restriction : null;
      if (can.seeRestricted && (wantNote ?? null) !== (link.restriction ?? null)) {
        if (!d.reason || d.reason.length < 5) throw new StudentProblem("Give a reason of at least 5 characters for changing the restriction.", "reason");
        await setRestriction(tx, current.ctx, link.id, wantNote, d.reason);
      }
    });
  });
  if (!r?.ok) return r;
  await flash({ message: "Link settings saved." });
  revalidatePath(profile(studentId));
  redirect(profile(studentId));
}

// ---------- Add / edit a parent ----------

const guardianSchema = z.object({
  relationship: z.enum(RELATIONS, { message: "Choose the relation." }),
  name: text("Full name", 120),
  phone: indianMobile("Phone"),
  altPhone: optionalIndianMobile("Other phone"),
  email: optionalEmail(),
  occupation: optionalText("Occupation", 100),
  dateOfBirth: optionalDate("Date of birth"),
  address: optionalText("Address", 300),
  language: z.string().refine((v) => LANGUAGES.some((l) => l.value === v), "Choose a message language."),
  optedOut: checkbox(),
  emergency: checkbox(),
  restricted: checkbox(),
  restriction: optionalText("Restriction note", 500),
  addAnyway: checkbox(),
});

export type GuardianFormData = { matches?: { id: string; name: string; children: string[] }[] };

/** Adds a parent (and links them to the student when one is given), or saves changes to a parent. */
export async function saveGuardianAction(guardianId: string | null, studentId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current, can } = await studentAction(guardianId ? "edit" : "create", { manage: true });
  const parsed = parseForm(guardianSchema, fd);
  if (!parsed.ok) return parsed.state;
  const values = formValues(fd);
  const { emergency, restricted, restriction, addAnyway, ...input } = parsed.data;
  if (restricted && !can.seeRestricted) return { ok: false, message: "Only the School Admin or Principal can set a custody or access restriction.", errors: { restricted: "Only the School Admin or Principal can set this." }, values };
  if (restricted && !restriction) return { ok: false, message: "Write the restriction note.", errors: { restriction: "Write the restriction note." }, values };
  let savedId = guardianId;
  try {
    await withSchool(current.ctx, async (tx) => {
      if (guardianId) {
        await visibleGuardian(tx, current, guardianId);
        await updateGuardian(tx, current.ctx, guardianId, input);
        return;
      }
      if (studentId) await loadVisibleStudent(tx, current, studentId);
      const g = await createGuardian(tx, current.ctx, input, { addAnyway });
      savedId = g.id;
      if (studentId) {
        const link = await linkGuardian(tx, current.ctx, studentId, g.id, { relationship: input.relationship, emergency });
        if (restricted && restriction) await setRestriction(tx, current.ctx, link.id, restriction, "Set when the guardian was added");
      }
    });
  } catch (e) {
    if (e instanceof PhoneOnRecord) {
      return { ok: false, message: "A parent with this phone is already on record. Link that parent instead, or add anyway if this is a different person.", values, data: { matches: e.matches } satisfies GuardianFormData };
    }
    return attemptForm(values, async () => { throw e; });
  }
  await flash({ message: guardianId ? "Parent details saved." : studentId ? `${input.name} added and linked.` : `${input.name} added.` });
  revalidatePath(`${BASE}/guardians`);
  redirect(studentId ? profile(studentId) : `${BASE}/guardians/${savedId}`);
}

const linkSchema = z.object({ guardianId: z.string().regex(/^[0-9a-f-]{36}$/i, "Choose the parent."), relationship: z.enum(RELATIONS, { message: "Choose the relation." }), emergency: checkbox() });

/** Links a parent already on record (for example the brother's or sister's) to this student. */
export async function linkExistingAction(studentId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await studentAction("edit", { manage: true });
  const parsed = parseForm(linkSchema, fd);
  if (!parsed.ok) return parsed.state;
  let name = "";
  const r = await attemptForm(formValues(fd), async () => {
    await withSchool(current.ctx, async (tx) => {
      await loadVisibleStudent(tx, current, studentId);
      const g = await tx.guardian.findFirst({ where: { id: parsed.data.guardianId, archivedAt: null } });
      if (!g) throw new StudentProblem("That parent was not found.", "guardianId");
      name = g.name;
      await linkGuardian(tx, current.ctx, studentId, g.id, { relationship: parsed.data.relationship, emergency: parsed.data.emergency });
    });
  });
  if (!r?.ok) return r;
  await flash({ message: `${name} linked. Brothers and sisters now share one parent record.` });
  revalidatePath(profile(studentId));
  redirect(profile(studentId));
}

// ---------- Merge ----------

export async function mergeAction(keepId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await studentAction("edit", { manage: true });
  const mergeId = String(fd.get("mergeId") ?? "");
  if (!isId(mergeId)) return { ok: false, message: "Choose the record to merge into this one.", errors: { mergeId: "Choose the record to merge into this one." } };
  let moved = 0;
  const r = await attemptForm(formValues(fd), async () => {
    await withSchool(current.ctx, async (tx) => {
      await visibleGuardian(tx, current, keepId);
      await visibleGuardian(tx, current, mergeId);
      moved = await mergeGuardians(tx, current.ctx, keepId, mergeId);
    });
  });
  if (!r?.ok) return r;
  await flash({ message: `Merged. ${moved} ${moved === 1 ? "child" : "children"} moved to this record; the other record is archived.` });
  revalidatePath(`${BASE}/guardians`);
  redirect(`${BASE}/guardians/${keepId}`);
}

// ---------- Consent ----------

/** Sends consent requests through Parent Link to one guardian or many (03 §2, D8a). */
export async function consentRequestAction(fd: FormData) {
  const { current } = await studentAction("edit", { manage: true });
  const ids = String(fd.get("ids") ?? "").split(",").filter(isId).slice(0, 2000);
  const types = String(fd.get("types") ?? "").split(",").filter((t) => CONSENT_TYPES.some((c) => c.key === t));
  if (ids.length === 0) return "Choose at least one parent.";
  let result = { guardians: 0, requested: 0, alreadyGiven: 0 };
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    for (const id of ids) await visibleGuardian(tx, current, id);
    result = await requestConsent(tx, current.ctx, ids, types.length ? types : undefined);
  }, { timeout: 60_000 }));
  if (r) return r;
  await flash({ message: result.requested ? `Consent request sent to ${result.guardians} ${result.guardians === 1 ? "parent" : "parents"} through Parent Link.${result.alreadyGiven ? ` ${result.alreadyGiven} consents were already given and were left as they are.` : ""}` : "Every chosen parent has already given consent. Nothing was sent.", tone: result.requested ? "success" : "info" });
  revalidatePath(`${BASE}/guardians`);
}

const withdrawSchema = z.object({
  consentType: z.string().refine((v) => CONSENT_TYPES.some((c) => c.key === v), "Choose the consent."),
  studentId: z.string().optional().transform((v) => (v && isId(v) ? v : null)),
  note: z.string().trim().min(5, "Say how the guardian asked, in at least 5 characters.").max(300, "At most 300 characters."),
});

/** Records a withdrawal the guardian asked the office for. The record stays, marked Withdrawn with the date. */
export async function withdrawConsentAction(guardianId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await studentAction("edit", { manage: true });
  const parsed = parseForm(withdrawSchema, fd);
  if (!parsed.ok) return parsed.state;
  let n = 0;
  const r = await attemptForm(formValues(fd), async () => {
    await withSchool(current.ctx, async (tx) => {
      await visibleGuardian(tx, current, guardianId);
      n = await withdrawConsent(tx, current.ctx, { guardianId, ...parsed.data });
    });
  });
  if (!r?.ok) return r;
  revalidatePath(`${BASE}/guardians/${guardianId}`);
  return { ok: true, message: `Withdrawal recorded for ${n} ${n === 1 ? "child" : "children"}.${parsed.data.consentType === "photo" ? " The child's photo is hidden from the gallery and social posts." : ""}` };
}

// ---------- Parent Link (owned by Communication) ----------

export async function parentLinkAction(fd: FormData) {
  const { current } = await studentAction("edit", { manage: true });
  const provider = parentLinkProvider();
  if (!provider) return "Parent Link is set up in Communication. It is not available yet.";
  const guardianId = String(fd.get("guardianId") ?? "");
  const op = fd.get("op") === "revoke" ? "revoke" : "resend";
  let to = "";
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    await visibleGuardian(tx, current, guardianId);
    to = op === "revoke" ? await provider.revoke(tx, current.ctx, guardianId) : await provider.resend(tx, current.ctx, guardianId);
  }));
  if (r) return r;
  // Messages are queued here and delivered by the worker: say so, never "sent" (QA PEOPLE-15).
  await flash({ message: op === "revoke" ? `Parent Link revoked. A new link is on its way to ${to}.` : `Parent Link is on its way to ${to}.` });
  revalidatePath(`${BASE}/guardians/${guardianId}`);
}
