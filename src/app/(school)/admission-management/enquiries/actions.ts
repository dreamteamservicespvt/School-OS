"use server";

import { revalidatePath } from "next/cache";
import { flash } from "@/lib/flash";
import { formValues, type FormState } from "@/lib/forms";
import { AdmissionProblem, dateTimeOf, emailOf, id, maybe, mobileOf, need, optionalDateOf, optionalId, problemState, str, todayIn, UUID_RE } from "@/lib/admission/act";
import { admissionAct, customFrom, inSchool } from "@/lib/admission/server";
import { admissionYear, openYears } from "@/lib/admission/settings";
import {
  addNote, archiveEnquiry, changeSource, changeStatus, closeLost, createEnquiry, DuplicateProblem, editEnquiry, findDuplicates, logCall,
  reassign, reopen, restoreEnquiry, runCampaign, sendEnquiryMessage, setFollowUp, type Match,
} from "@/lib/admission/enquiries";

const BASE = "/admission-management/enquiries";

type DupState = FormState<{ id?: string; matches?: Match[] }>;

function duplicateState(e: DuplicateProblem, fd: FormData): DupState {
  return { ok: false, message: e.message, errors: { phone: e.message }, values: formValues(fd), data: { matches: e.matches } };
}

/** Duplicate check on leaving the phone or email field (02 Done when 2). */
export async function checkDuplicates(phone: string, email: string, excludeEnquiryId?: string): Promise<Match[]> {
  try {
    return await inSchool("create", ({ tx }) => findDuplicates(tx, {
      phone: phone.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, ""),
      email: email.trim() || null,
      excludeEnquiryId: excludeEnquiryId && UUID_RE.test(excludeEnquiryId) ? excludeEnquiryId : null,
    }));
  } catch {
    return [];
  }
}

export async function addEnquiryAction(_: DupState, fd: FormData): Promise<DupState> {
  try {
    const e = await inSchool("create", async (w) => {
      const chosen = optionalId(fd, "yearId");
      const year = chosen ? (await openYears(w.tx)).find((y) => y.id === chosen) ?? null : await admissionYear(w.tx, w.ctx, w.s);
      if (!year) throw new AdmissionProblem(chosen ? "Choose a year that is open for admissions." : "Set up an academic year in Academic Management first.", chosen ? "yearId" : undefined);
      const campus = await w.tx.campus.findFirst({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }], select: { id: true } });
      if (!campus) throw new AdmissionProblem("Add a campus in Settings first.");
      const customFields = await customFrom(w, "enquiry", fd, {});
      return createEnquiry(w.tx, w.ctx, w.v, w.s, {
        childName: need(fd, "childName", "Child's name", 120),
        parentName: need(fd, "parentName", "Parent's name", 120),
        phone: mobileOf(fd, "phone"),
        email: emailOf(fd, "email"),
        classId: optionalId(fd, "classId"),
        source: need(fd, "source", "Source", 40),
        ownerStaffId: optionalId(fd, "ownerStaffId"),
        nextFollowUpAt: dateTimeOf(fd, "nextFollowUpAt", "Next follow-up", w.tz),
        nextAction: maybe(fd, "nextAction", "Next action", 200),
        childDob: optionalDateOf(fd, "childDob", "Child's date of birth"),
        currentSchool: maybe(fd, "currentSchool", "Current school", 150),
        referredBy: maybe(fd, "referredBy", "Referred by", 120),
        notes: maybe(fd, "notes", "Notes", 2000),
        customFields,
      }, { yearId: year.id, campusId: campus.id, today: todayIn(w.tz), force: str(fd, "force") === "1", siblingOfId: optionalId(fd, "siblingOfId") });
    });
    await flash({ message: `Enquiry added for ${e.childName}.`, link: { href: `${BASE}/${e.id}`, label: "Open enquiry" } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Enquiry added.", data: { id: e.id } };
  } catch (err) {
    if (err instanceof DuplicateProblem) return duplicateState(err, fd);
    return problemState(err, fd) as DupState;
  }
}

export async function editEnquiryAction(_: DupState, fd: FormData): Promise<DupState> {
  try {
    const e = await inSchool("edit", async (w) => {
      const enquiryId = id(fd, "id", "enquiry");
      const before = await w.tx.enquiry.findFirst({ where: { id: enquiryId }, select: { customFields: true } });
      return editEnquiry(w.tx, w.ctx, w.v, enquiryId, {
        childName: need(fd, "childName", "Child's name", 120),
        parentName: need(fd, "parentName", "Parent's name", 120),
        phone: mobileOf(fd, "phone"),
        email: emailOf(fd, "email"),
        classId: optionalId(fd, "classId"),
        childDob: optionalDateOf(fd, "childDob", "Child's date of birth"),
        currentSchool: maybe(fd, "currentSchool", "Current school", 150),
        referredBy: maybe(fd, "referredBy", "Referred by", 120),
        customFields: await customFrom(w, "enquiry", fd, before?.customFields ?? {}),
      }, { force: str(fd, "force") === "1" });
    });
    await flash({ message: `Details of ${e.childName} saved.` });
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved.", data: { id: e.id } };
  } catch (err) {
    if (err instanceof DuplicateProblem) return duplicateState(err, fd);
    return problemState(err, fd) as DupState;
  }
}

export async function changeStatusAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => changeStatus(w.tx, w.ctx, w.v, w.s, id(fd, "id", "enquiry"), need(fd, "status", "Status", 40)), () => "Status changed.");
}

/** Kanban: a card dragged to another status column. */
export async function moveEnquiryCard(enquiryId: string, _from: string, to: string): Promise<string | null> {
  if (!UUID_RE.test(enquiryId)) return "This enquiry was not found.";
  const r = await admissionAct("edit", undefined, (w) => changeStatus(w.tx, w.ctx, w.v, w.s, enquiryId, to), () => "Status changed.");
  return r?.ok ? null : r?.message ?? "That did not work.";
}

export async function changeSourceAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => changeSource(w.tx, w.ctx, w.v, w.s, id(fd, "id", "enquiry"), need(fd, "source", "Source", 40), str(fd, "reason")), () => "Source changed. The first recorded source is kept.");
}

export async function reassignAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => reassign(w.tx, w.ctx, w.v, id(fd, "id", "enquiry"), id(fd, "ownerStaffId", "owner"), maybe(fd, "reason", "Reason", 300)), () => "Enquiry reassigned. The history keeps the change.");
}

export async function followUpAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => setFollowUp(w.tx, w.ctx, w.v, id(fd, "id", "enquiry"), dateTimeOf(fd, "nextFollowUpAt", "Next follow-up", w.tz), maybe(fd, "nextAction", "Next action", 200)), () => "Next follow-up set.");
}

export async function noteAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => addNote(w.tx, w.ctx, w.v, id(fd, "id", "enquiry"), need(fd, "text", "Note", 2000)), () => "Note added.");
}

export async function callAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => logCall(w.tx, w.ctx, w.v, w.s, id(fd, "id", "enquiry"), {
    direction: str(fd, "direction") === "incoming" ? "incoming" : "outgoing",
    outcome: need(fd, "outcome", "Outcome", 40),
    note: maybe(fd, "note", "Note", 1000),
    nextFollowUpAt: str(fd, "nextFollowUpAt") ? dateTimeOf(fd, "nextFollowUpAt", "Next follow-up", w.tz) : null,
    nextAction: maybe(fd, "nextAction", "Next action", 200),
  }), () => "Call logged.");
}

export async function messageAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => {
    const channel = str(fd, "channel");
    if (channel !== "whatsapp" && channel !== "sms" && channel !== "email") throw new AdmissionProblem("Choose how to send it.", "channel");
    return sendEnquiryMessage(w.tx, w.ctx, w.v, id(fd, "id", "enquiry"), { channel, template: str(fd, "template") || "admission-enquiry-message", text: str(fd, "text") });
  }, () => "Message queued: it is on its way to the parent and saved in this enquiry's history.");
}

export async function closeLostAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => closeLost(w.tx, w.ctx, w.v, w.s, id(fd, "id", "enquiry"), str(fd, "reason"), maybe(fd, "note", "Note", 500)), () => "Enquiry closed as lost. You can reopen it later.");
}

export async function reopenAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => reopen(w.tx, w.ctx, w.v, w.s, id(fd, "id", "enquiry"), dateTimeOf(fd, "nextFollowUpAt", "Next follow-up", w.tz)), () => "Enquiry reopened.");
}

export async function archiveAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("archive", fd, (w) => archiveEnquiry(w.tx, w.ctx, w.v, id(fd, "id", "enquiry"), str(fd, "reason")), () => ({ message: "Enquiry archived. Find it under Show archived.", link: { href: `${BASE}?archived=1`, label: "Archived enquiries" } }));
}

export async function restoreAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("archive", fd, (w) => restoreEnquiry(w.tx, w.ctx, w.v, id(fd, "id", "enquiry")), () => "Enquiry restored.");
}

/** Assign owner for the selected enquiries: each history keeps the old and new owner and the reason. */
export async function bulkAssignAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, async (w) => {
    const ids = [...new Set(fd.getAll("ids").map(String).filter((x) => UUID_RE.test(x)))];
    if (ids.length === 0) throw new AdmissionProblem("Select at least one enquiry.");
    if (ids.length > 500) throw new AdmissionProblem("Select at most 500 enquiries at a time.");
    const owner = id(fd, "ownerStaffId", "new owner");
    const reason = need(fd, "reason", "Reason", 300);
    let moved = 0;
    for (const e of ids) {
      const row = await w.tx.enquiry.findFirst({ where: { id: e }, select: { ownerStaffId: true } });
      if (!row || row.ownerStaffId === owner) continue;
      await reassign(w.tx, w.ctx, w.v, e, owner, reason);
      moved++;
    }
    const name = (await w.tx.staff.findFirst({ where: { id: owner }, select: { fullName: true } }))?.fullName ?? "the new owner";
    return { moved, name };
  }, (r) => `${r.moved} ${r.moved === 1 ? "enquiry is" : "enquiries are"} now owned by ${r.name}. Each history keeps the old and new owner.`);
}

export async function campaignAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => {
    const ids = [...new Set(fd.getAll("ids").map(String).filter((x) => UUID_RE.test(x)))];
    if (ids.length === 0) throw new AdmissionProblem("Select at least one enquiry.");
    if (ids.length > 500) throw new AdmissionProblem("Select at most 500 enquiries at a time.");
    const channel = str(fd, "channel");
    if (channel !== "whatsapp" && channel !== "sms" && channel !== "email") throw new AdmissionProblem("Choose how to send it.", "channel");
    return runCampaign(w.tx, w.ctx, w.v, w.s, ids, { name: str(fd, "name"), message: str(fd, "message"), channel });
  }, (r) => ({ message: `Campaign "${r.campaign.name}" ${r.sent ? `queued for ${r.sent} ${r.sent === 1 ? "family" : "families"}` : "was not sent to anyone"}${r.skipped ? `, ${r.skipped} skipped (${r.skippedWhy.slice(0, 3).join("; ")}${r.skippedWhy.length > 3 ? "…" : ""})` : ""}.` }), { timeout: 60_000 });
}
