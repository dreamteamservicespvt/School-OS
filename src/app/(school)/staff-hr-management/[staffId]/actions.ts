"use server";

import { requireAction } from "@/lib/current";
import { withSchool, type Tx } from "@/lib/db";
import { parseForm, type FormState } from "@/lib/forms";
import { IMAGE_TYPES, saveFile } from "@/lib/files";
import { writeAudit } from "@/lib/audit";
import { checkIndianMobile } from "@/lib/format";
import { MODULE_KEYS } from "@/lib/modules";
import type { AccessLevel } from "@/lib/roles";
import type { StaffStatus } from "@prisma/client";
import { act, dateOf, FieldProblem, file, id, str } from "@/lib/staff/act";
import { canChangeStaff, HrOnlyError, viewerFor, type Viewer } from "@/lib/staff/access";
import { contactSchema, employmentSchema, personalSchema } from "@/lib/staff/schemas";
import { changeStatus, giveLogin, issueInvite, saveEmergencyContacts, StaffProblem, updateRestricted, updateStaffSection } from "@/lib/staff/staff";
import { hrSettings, STAFF_STATUSES } from "@/lib/staff/settings";
import { reopenLogin, switchOffLogin } from "@/lib/staff/exit";

type Who = { current: Awaited<ReturnType<typeof requireAction>>["current"]; viewer: Viewer; staffId: string };

/** Loads who is asking and checks they may change this staff record (HR for everyone, staff for their own). */
async function who(fd: FormData, hrOnly: boolean): Promise<Who> {
  const { current } = await requireAction("staff-hr-management", "edit");
  const staffId = id(fd, "staffId", "staff member");
  const viewer = await withSchool(current.ctx, (tx) => viewerFor(tx, current.ctx, current));
  if (hrOnly ? viewer.change !== "all" : !canChangeStaff(viewer, staffId)) throw new HrOnlyError("this change");
  return { current, viewer, staffId };
}

async function run<T>(fd: FormData, hrOnly: boolean, work: (w: Who, tx: Tx) => Promise<T>, message: (r: T) => string) {
  return act(fd, async () => {
    const w = await who(fd, hrOnly);
    return withSchool(w.current.ctx, (tx) => work(w, tx), { timeout: 30_000 });
  }, message);
}

export async function savePersonal(_: FormState<unknown>, fd: FormData) {
  const parsed = parseForm(personalSchema, fd);
  if (!parsed.ok) return parsed.state;
  return run(fd, false, (w, tx) => updateStaffSection(tx, w.current.ctx, w.staffId, "personal", parsed.data), (r) => (r.changed ? "Personal details saved." : "Nothing changed."));
}

export async function saveContact(_: FormState<unknown>, fd: FormData) {
  const parsed = parseForm(contactSchema, fd);
  if (!parsed.ok) return parsed.state;
  return run(fd, true, (w, tx) => updateStaffSection(tx, w.current.ctx, w.staffId, "contact", parsed.data), (r) => (r.changed ? "Contact details saved." : "Nothing changed."));
}

export async function saveEmployment(_: FormState<unknown>, fd: FormData) {
  const parsed = parseForm(employmentSchema, fd);
  if (!parsed.ok) return parsed.state;
  return run(fd, true, (w, tx) => updateStaffSection(tx, w.current.ctx, w.staffId, "employment", parsed.data), (r) => (r.changed ? "Employment details saved." : "Nothing changed."));
}

export async function saveEmergency(_: FormState<unknown>, fd: FormData) {
  return run(fd, false, async (w, tx) => {
    const contacts: { name: string; relation: string; phone: string }[] = [];
    for (let i = 0; i < 3; i++) {
      const name = str(fd, `name${i}`);
      const relation = str(fd, `relation${i}`);
      const phone = str(fd, `phone${i}`);
      if (!name && !phone && !relation) continue;
      if (!name) throw new FieldProblem(`Contact ${i + 1}: name is needed.`, `name${i}`);
      if (!relation) throw new FieldProblem(`Contact ${i + 1}: relation is needed.`, `relation${i}`);
      const p = checkIndianMobile(phone);
      if (p) throw new FieldProblem(`Contact ${i + 1}: ${p}`, `phone${i}`);
      contacts.push({ name: name.slice(0, 100), relation: relation.slice(0, 40), phone: phone.replace(/\D/g, "").slice(-10) });
    }
    await saveEmergencyContacts(tx, w.current.ctx, w.staffId, contacts);
    return contacts.length;
  }, (n) => `${n} emergency contact${n === 1 ? "" : "s"} saved.`);
}

export async function saveRestricted(_: FormState<unknown>, fd: FormData) {
  return run(fd, true, async (w, tx) => {
    if (!w.viewer.restricted) throw new HrOnlyError("changes to restricted details");
    const v = (k: string) => str(fd, k) || null;
    return updateRestricted(tx, w.current.ctx, w.staffId, {
      aadhaar: v("aadhaar"), pan: v("pan"), bankAccount: v("bankAccount"), bankIfsc: fd.has("bankIfsc") ? str(fd, "bankIfsc") || null : null,
      bankName: fd.has("bankName") ? str(fd, "bankName") || null : null, uan: fd.has("uan") ? str(fd, "uan") || null : null, esiNo: fd.has("esiNo") ? str(fd, "esiNo") || null : null,
    });
  }, (n) => (n ? "Restricted details saved. Only the last 4 characters go into the history." : "Nothing changed."));
}

export async function saveExtraFields(_: FormState<unknown>, fd: FormData) {
  return run(fd, true, async (w, tx) => {
    const fields = await tx.customField.findMany({ where: { recordType: "staff", archivedAt: null } });
    const staff = await tx.staff.findUniqueOrThrow({ where: { id: w.staffId } });
    const before = (staff.customFields ?? {}) as Record<string, unknown>;
    const after: Record<string, unknown> = { ...before };
    for (const f of fields) {
      const raw = f.fieldType === "yesno" ? (str(fd, `cf:${f.key}`) === "on" ? "Yes" : "No") : str(fd, `cf:${f.key}`);
      if (f.required && !raw) throw new FieldProblem(`${f.label} is needed.`, `cf:${f.key}`);
      if (raw && f.fieldType === "number" && Number.isNaN(Number(raw))) throw new FieldProblem(`${f.label} must be a number.`, `cf:${f.key}`);
      if (raw && f.fieldType === "choice" && !f.choices.includes(raw)) throw new FieldProblem(`Choose ${f.label} from the list.`, `cf:${f.key}`);
      after[f.key] = raw || null;
    }
    await tx.staff.update({ where: { id: w.staffId }, data: { customFields: after as object, updatedById: w.current.user.id } });
    await writeAudit(tx, w.current.ctx, { action: "changed", recordType: "Staff", recordId: w.staffId, before: { customFields: before } as object, after: { customFields: after } as object });
  }, () => "Extra fields saved.");
}

export async function uploadPhoto(_: FormState<unknown>, fd: FormData) {
  return run(fd, false, async (w, tx) => {
    const photo = file(fd, "photo");
    if (!photo) throw new FieldProblem("Choose a photo.", "photo");
    if (photo.size > 2 * 1024 * 1024) throw new FieldProblem(`The photo is ${(photo.size / 1024 / 1024).toFixed(1)} MB. Photos can be at most 2 MB.`, "photo");
    const saved = await saveFile(tx, w.current.ctx, { file: photo, purpose: "staff-photo", allowed: IMAGE_TYPES, maxImageWidth: 600 });
    const before = await tx.staff.findUniqueOrThrow({ where: { id: w.staffId } });
    await tx.staff.update({ where: { id: w.staffId }, data: { photoFileId: saved.id, updatedById: w.current.user.id } });
    await writeAudit(tx, w.current.ctx, { action: "photo-changed", recordType: "Staff", recordId: w.staffId, before: { photoFileId: before.photoFileId }, after: { photoFileId: saved.id } });
  }, () => "Photo saved.");
}

export async function changeStatusAction(_: FormState<unknown>, fd: FormData) {
  return run(fd, true, async (w, tx) => {
    const status = str(fd, "status");
    if (!STAFF_STATUSES.some((s) => s.value === status)) throw new FieldProblem("Choose a status.", "status");
    await changeStatus(tx, w.current.ctx, w.staffId, status as StaffStatus, dateOf(fd, "since", "Date"), str(fd, "reason"));
    return STAFF_STATUSES.find((s) => s.value === status)!.label;
  }, (label) => `Status changed to ${label}.`);
}

export async function giveLoginAction(_: FormState<unknown>, fd: FormData) {
  return run(fd, true, async (w, tx) => {
    const exceptions: Record<string, AccessLevel> = {};
    for (const key of MODULE_KEYS) {
      const v = str(fd, `perm:${key}`);
      if (["full", "view", "own", "none"].includes(v)) exceptions[key] = v as AccessLevel;
    }
    const staff = await tx.staff.findFirstOrThrow({ where: { id: w.staffId, archivedAt: null } });
    if (["RESIGNED", "RETIRED", "TERMINATED"].includes(staff.status)) throw new StaffProblem(`${staff.fullName} has left the school.`);
    const settings = await hrSettings(tx, w.current.ctx);
    return giveLogin(tx, w.current.ctx, staff, { roleKeys: fd.getAll("roleKeys").map(String).filter(Boolean), username: str(fd, "username") || null, exceptions, campusId: null }, settings.usernameFormat);
  }, (r) => `Login ${r.username} made. Share the invite link shown on the profile.`);
}

/** A new invite link, which also works as "Reset password": the person sets a new password themselves. */
export async function newSignInLink(_: FormState<unknown>, fd: FormData) {
  return run(fd, true, async (w, tx) => {
    const staff = await tx.staff.findFirstOrThrow({ where: { id: w.staffId } });
    if (!staff.userLoginId) throw new StaffProblem(`${staff.fullName} has no login yet.`);
    const login = await tx.userLogin.findUniqueOrThrow({ where: { id: staff.userLoginId } });
    if (login.status === "DISABLED") throw new StaffProblem("This login is switched off. Switch it on first.");
    const link = await issueInvite(tx, login.id);
    await writeAudit(tx, w.current.ctx, { action: "invite-link-made", recordType: "User Login", recordId: login.id, after: { by: w.current.user.displayName } });
    return { link, username: login.username };
  }, (r) => `New sign-in link made for ${r.username}. It works for 7 days.`);
}

export async function switchLoginAction(_: FormState<unknown>, fd: FormData) {
  return run(fd, true, async (w, tx) => {
    if (!w.viewer.roleKeys.some((k) => k === "principal" || k === "school-admin")) throw new HrOnlyError("switching logins on or off");
    const turnOn = str(fd, "turn") === "on";
    if (turnOn) await reopenLogin(tx, w.current.ctx, w.staffId, str(fd, "reason"));
    else await switchOffLogin(tx, w.current.ctx, w.staffId, str(fd, "reason"));
    return turnOn;
  }, (on) => (on ? "Login switched on." : "Login switched off. They were signed out everywhere."));
}
