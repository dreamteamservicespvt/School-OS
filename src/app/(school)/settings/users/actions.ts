"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AccessScope } from "@prisma/client";
import { flash } from "@/lib/flash";
import { formValues, optionalEmail, optionalIndianMobile, parseForm, text, type FormState } from "@/lib/forms";
import { schoolsFor } from "@/lib/auth/access";
import { changeAccess, disableUser, enableUser, inviteUser, linkRecord, resendInvite, resetTwoStep, setExceptions, updateDetails } from "@/lib/settings/users";
import { archiveRole, createRole, restoreRole, restoreRoleVersion, setTemplateOn, updateRole } from "@/lib/settings/roles";
import { asFormState, runSettings } from "../run";
import { inviteSentWords } from "@/lib/settings/invite-message";

const USERS = "/settings/users";

export type InviteState = FormState<{ userId: string; link: string; name: string; sentBy: string[]; sentNote: string | null }>;

const inviteSchema = z.object({
  displayName: z.string().trim().min(1, "Full name is needed").max(100, "Full name can be at most 100 characters."),
  phone: optionalIndianMobile("Phone"),
  email: optionalEmail(),
  username: text("Username", 40).transform((v) => v.toLowerCase()),
  scope: z.enum(["WHOLE_SCHOOL", "CAMPUS", "OWN"], { errorMap: () => ({ message: "Choose the scope." }) }),
  campusId: z.string().optional(),
  staffId: z.string().optional(),
});

function typed(fd: FormData) {
  return { ...formValues(fd), roleIds: fd.getAll("roleIds").map(String).join(",") };
}

export async function inviteAction(_: InviteState, fd: FormData): Promise<InviteState> {
  const values = typed(fd);
  const parsed = parseForm(inviteSchema, fd);
  if (!parsed.ok) return { ok: false, message: parsed.state.message, errors: parsed.state.errors, values };
  if (!parsed.data.phone) return { ok: false, message: "Phone is needed, so the person can get their invite link and one-time codes.", errors: { phone: "Phone is needed." }, values };
  const roleIds = fd.getAll("roleIds").map(String);
  const r = await runSettings("create", (tx, current) =>
    inviteUser(tx, current.ctx, {
      displayName: parsed.data.displayName,
      phone: parsed.data.phone,
      email: parsed.data.email,
      username: parsed.data.username,
      roleIds,
      scope: parsed.data.scope as AccessScope,
      campusId: parsed.data.campusId || null,
      staffId: parsed.data.staffId || null,
    }),
  );
  if (!r.ok) return asFormState(r, values, "");
  revalidatePath(USERS);
  return {
    ok: true,
    message: `${r.data.login.displayName} is invited.${inviteSentWords(r.data.sent)}`,
    data: { userId: r.data.login.id, link: `/invite/${r.data.token}`, name: r.data.login.displayName, sentBy: r.data.sent.sentBy, sentNote: r.data.sent.note },
  };
}

export type LinkState = { ok: boolean; message: string; link?: string } | null;

export async function resendInviteAction(userId: string): Promise<LinkState> {
  const r = await runSettings("edit", (tx, current) => resendInvite(tx, current.ctx, userId));
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`${USERS}/${userId}`);
  return { ok: true, message: `A new invite link is ready. The old link no longer works. It works once, for 7 days.${inviteSentWords(r.data.sent)}`, link: `/invite/${r.data.token}` };
}

export async function accessAction(_: FormState, fd: FormData): Promise<FormState> {
  const userId = String(fd.get("userId") ?? "");
  const roleIds = fd.getAll("roleIds").map(String);
  const scope = String(fd.get("scope") ?? "") as AccessScope;
  const campusId = String(fd.get("campusId") ?? "") || null;
  const r = await runSettings("edit", (tx, current) => changeAccess(tx, current.ctx, userId, { roleIds, scope, campusId }));
  const values = typed(fd);
  if (!r.ok) return asFormState(r, values, "");
  revalidatePath(`${USERS}/${userId}`);
  if (!r.data.changed) return { ok: true, message: "Nothing changed." };
  return { ok: true, message: r.data.signedOut > 0 ? `Saved. They were signed out on ${r.data.signedOut} device${r.data.signedOut === 1 ? "" : "s"} and get the new roles when they sign in again. Every School Admin was told.` : "Saved. Every School Admin was told." };
}

export async function exceptionsAction(_: FormState, fd: FormData): Promise<FormState> {
  const userId = String(fd.get("userId") ?? "");
  const input: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("ex_") && typeof v === "string" && v) input[k.slice(3)] = v;
  const r = await runSettings("edit", (tx, current) => setExceptions(tx, current.ctx, userId, input));
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`${USERS}/${userId}`);
  return { ok: true, message: r.data ? "Exceptions saved. Every School Admin was told." : "Nothing changed." };
}

export async function disableAction(userId: string): Promise<string | void> {
  const others = (await schoolsFor(userId)).map((s) => s.id);
  const r = await runSettings("edit", (tx, current) => disableUser(tx, current.ctx, userId, others));
  if (!r.ok) return r.message;
  await flash({ message: `${r.data.name} is disabled and signed out on ${r.data.signedOut} device${r.data.signedOut === 1 ? "" : "s"}.` });
  revalidatePath(USERS, "layout");
}

export async function enableAction(userId: string): Promise<string | void> {
  const r = await runSettings("edit", (tx, current) => enableUser(tx, current.ctx, userId));
  if (!r.ok) return r.message;
  await flash({ message: `${r.data.name} can sign in again${r.data.status === "INVITED" ? " once they set their password from the invite link" : ""}.` });
  revalidatePath(USERS, "layout");
}

export async function twoStepAction(_: FormState, fd: FormData): Promise<FormState> {
  const userId = String(fd.get("userId") ?? "");
  const reason = String(fd.get("reason") ?? "");
  const checkDone = String(fd.get("checkDone") ?? "");
  const r = await runSettings("edit", (tx, current) => resetTwoStep(tx, current.ctx, current.roles.map((x) => x.key), userId, { reason, checkDone }));
  if (!r.ok) return asFormState(r, formValues(fd), "");
  await flash({ message: `Two-step login reset for ${r.data}. They will set it up at their next sign-in.` });
  revalidatePath(`${USERS}/${userId}`);
  return { ok: true, message: "Done." };
}

export async function linkAction(_: FormState, fd: FormData): Promise<FormState> {
  const userId = String(fd.get("userId") ?? "");
  const choice = String(fd.get("record") ?? "");
  const [kind, id] = choice.includes(":") ? (choice.split(":") as ["staff" | "student", string]) : (["none", null] as const);
  const r = await runSettings("edit", (tx, current) => linkRecord(tx, current.ctx, userId, { kind, id }));
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`${USERS}/${userId}`);
  return { ok: true, message: r.data ? "Saved." : "Nothing changed." };
}

const detailsSchema = z.object({
  userId: z.string(),
  displayName: z.string().trim().min(1, "Full name is needed").max(100, "Full name can be at most 100 characters."),
  phone: optionalIndianMobile("Phone"),
  email: optionalEmail(),
});

export async function detailsAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(detailsSchema, fd);
  if (!parsed.ok) return parsed.state;
  const others = (await schoolsFor(parsed.data.userId)).map((s) => s.id);
  const r = await runSettings("edit", (tx, current) => updateDetails(tx, current.ctx, parsed.data.userId, others, parsed.data));
  if (r.ok) revalidatePath(`${USERS}/${parsed.data.userId}`);
  return asFormState(r, formValues(fd), r.ok && r.data ? "Details saved." : "Nothing changed.");
}

// -------------------------------------------------------------------- Roles

function grid(fd: FormData) {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("p_") && typeof v === "string") out[k.slice(2)] = v;
  return out;
}

export async function saveRoleAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const input = { name: String(fd.get("name") ?? ""), permissions: grid(fd), requiresTwoStep: fd.get("requiresTwoStep") === "on", copyFromId: String(fd.get("copyFromId") ?? "") || null };
  const values = formValues(fd);
  if (id) {
    const r = await runSettings("edit", (tx, current) => updateRole(tx, current.ctx, id, input));
    if (!r.ok) return asFormState(r, values, "");
    if (!r.data) return { ok: true, message: "Nothing changed." };
    await flash({ message: "Role saved. Every School Admin was told.", undo: { kind: "role-permissions", id: r.data.id } });
    revalidatePath(USERS, "layout");
    redirect(`${USERS}/roles/${id}`);
  }
  const r = await runSettings("create", (tx, current) => createRole(tx, current.ctx, input));
  if (!r.ok) return asFormState(r, values, "");
  await flash({ message: `${r.data.name} role created. Give it to people from their page in Users.`, link: { href: USERS, label: "Open Users" } });
  revalidatePath(USERS, "layout");
  redirect(`${USERS}/roles/${r.data.id}`);
}

export async function roleAction(id: string, what: "archive" | "restore" | "on" | "off"): Promise<string | void> {
  const r = await runSettings(what === "archive" ? "archive" : "edit", async (tx, current) => {
    if (what === "archive") return archiveRole(tx, current.ctx, id);
    if (what === "restore") return restoreRole(tx, current.ctx, id);
    return setTemplateOn(tx, current.ctx, id, what === "on");
  });
  if (!r.ok) return r.message;
  const words = { archive: `${r.data.name} archived. It can be restored from the archived roles.`, restore: `${r.data.name} restored.`, on: `${r.data.name} is switched on and can be given to people.`, off: `${r.data.name} is switched off.` };
  await flash({ message: words[what] });
  revalidatePath(USERS, "layout");
}

export async function putBackRoleAction(auditId: string, roleId: string): Promise<string | void> {
  const r = await runSettings("edit", (tx, current) => restoreRoleVersion(tx, current.ctx, auditId));
  if (!r.ok) return r.message;
  await flash({ message: r.data ? "Put back as it was before that change. Every School Admin was told." : "The role is already like that." });
  revalidatePath(`${USERS}/roles/${roleId}`);
}
