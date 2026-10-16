"use server";

// My profile (00-global.md §1.4): own name, a new mobile number or email
// (confirmed with a code sent to it), two-step login, notification choices,
// devices, and the school colour for School Admin.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma, withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { revokeAllSessions } from "@/lib/auth/sessions";
import { confirmContactChange, roleNeedsTwoStep, startContactChange, type ContactKind } from "@/lib/auth/two-step";
import { deviceInfo, requireAction, requireCurrent } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { NOTE_CHANNELS, NOTE_KINDS, type NoteChannel } from "@/lib/notification-kinds";
import { pushOn } from "@/lib/push";
import { FileProblem, IMAGE_TYPES, saveFile } from "@/lib/files";
import { readPreferences } from "@/lib/settings/profile-rules";
import { ACCENTS, ACCENT_COOKIE } from "@/lib/theme";

const CONTACT_COOKIE = "sos_contact";
const secure = process.env.NODE_ENV === "production";

async function audit(action: string, before?: object, after?: object) {
  const current = await requireCurrent();
  const device = await deviceInfo();
  await withSchool(current.ctx, (tx) =>
    writeAudit(tx, current.ctx, { action, recordType: "User Login", recordId: current.user.id, before, after, device: device.userAgent, ipAddress: device.ipAddress }),
  );
}

export type Result = { ok: boolean; message: string } | null;

export async function saveMyName(_prev: Result, formData: FormData): Promise<Result> {
  const current = await requireCurrent();
  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2) return { ok: false, message: "Type your full name." };
  if (name.length > 80) return { ok: false, message: "Your name can be at most 80 characters." };
  if (name === current.user.displayName) return { ok: true, message: "Nothing changed." };
  await prisma.userLogin.update({ where: { id: current.user.id }, data: { displayName: name } });
  await audit("changed-own-name", { name: current.user.displayName }, { name });
  revalidatePath("/", "layout");
  return { ok: true, message: "Your name is saved." };
}

export type CodeResult = { ok: boolean; message: string; step: "type" | "code" | "done"; kind: ContactKind; value?: string } | null;

export async function sendContactCode(_prev: CodeResult, formData: FormData): Promise<CodeResult> {
  const current = await requireCurrent();
  const kind: ContactKind = formData.get("kind") === "email" ? "email" : "phone";
  const value = String(formData.get("value") ?? "");
  const device = await deviceInfo();
  const limit = await hitLimit(`contact-change:ip:${device.ipAddress ?? "unknown"}`, 20, 600);
  if (!limit.ok) return { ok: false, message: limitMessage(limit), step: "type", kind, value };
  const started = await startContactChange(current.user.id, current.school.id, kind, value, device);
  if (!started.ok) return { ok: false, message: started.message, step: "type", kind, value };
  (await cookies()).set(CONTACT_COOKIE, started.token, { httpOnly: true, secure, sameSite: "lax", path: "/profile", maxAge: 600 });
  return { ok: true, message: `We sent a 6-digit code to ${started.sentTo}. It works for 10 minutes.`, step: "code", kind, value };
}

export async function confirmContactCode(_prev: CodeResult, formData: FormData): Promise<CodeResult> {
  const current = await requireCurrent();
  const kind: ContactKind = formData.get("kind") === "email" ? "email" : "phone";
  const value = String(formData.get("value") ?? "");
  const jar = await cookies();
  const result = await confirmContactChange(current.user.id, jar.get(CONTACT_COOKIE)?.value, String(formData.get("code") ?? ""), await deviceInfo());
  if (!result.ok) {
    if (result.restart) jar.delete({ name: CONTACT_COOKIE, path: "/profile" });
    return { ok: false, message: result.message, step: result.restart ? "type" : "code", kind, value };
  }
  jar.delete({ name: CONTACT_COOKIE, path: "/profile" });
  revalidatePath("/profile");
  return { ok: true, message: result.kind === "phone" ? `Your mobile number is now ${result.value}. You can sign in with it.` : `Your email is now ${result.value}.`, step: "done", kind: result.kind, value: result.value };
}

export async function setTwoStep(on: boolean): Promise<Result> {
  const current = await requireCurrent();
  if (!on && (await roleNeedsTwoStep(current.user.id, current.school.id))) {
    return { ok: false, message: "Your role needs two-step login, so it stays on." };
  }
  if (on && !current.user.email && !current.user.phone) {
    return { ok: false, message: "Add your mobile number or email first, so the code has somewhere to go." };
  }
  await prisma.userLogin.update({ where: { id: current.user.id }, data: { twoStepChosen: on } });
  await audit(on ? "two-step-switched-on" : "two-step-switched-off");
  revalidatePath("/profile");
  return { ok: true, message: on ? "Two-step login is on from your next sign-in." : "Two-step login is off. Only your password is asked now." };
}

export async function saveNotePrefs(prefs: Record<string, string[]>): Promise<Result> {
  const current = await requireCurrent();
  const clean: Record<string, NoteChannel[]> = {};
  for (const k of NOTE_KINDS) {
    const list = (prefs[k.key] ?? []).filter((c): c is NoteChannel => (NOTE_CHANNELS as readonly string[]).includes(c));
    clean[k.key] = k.locked && !list.includes("app") ? ["app", ...list] : [...new Set(list)];
  }
  await prisma.userLogin.update({ where: { id: current.user.id }, data: { notificationPrefs: clean as Prisma.InputJsonValue } });
  revalidatePath("/profile");
  return { ok: true, message: "Saved" };
}

/** Signs out every other device; this one stays signed in. */
export async function signOutOthers() {
  const current = await requireCurrent();
  const n = await revokeAllSessions(current.user.id, "Signed out everywhere else", current.session.id);
  await audit("signed-out-everywhere-else", undefined, { devices: n });
  revalidatePath("/profile");
}

/** School Admin: one colour for everyone in the school, or let each person choose. */
export async function setSchoolColour(accent: string | null): Promise<Result> {
  const { current } = await requireAction("settings", "edit");
  const next = accent && ACCENTS.some((a) => a.key === accent) ? accent : null;
  await withSchool(current.ctx, async (tx) => {
    const school = await tx.school.findUniqueOrThrow({ where: { id: current.school.id } });
    const prefs = readPreferences(school.preferences);
    await tx.school.update({ where: { id: school.id }, data: { preferences: { ...prefs, schoolAccent: next } as Prisma.InputJsonValue } });
    await writeAudit(tx, current.ctx, { action: "changed-school-colour", recordType: "School", recordId: school.id, before: { colour: prefs.schoolAccent ?? null }, after: { colour: next } });
  });
  if (next) (await cookies()).set(ACCENT_COOKIE, next, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
  const name = ACCENTS.find((a) => a.key === next)?.label;
  return { ok: true, message: next ? `Everyone at ${current.school.name} now sees ${name}.` : "Each person can pick their own colour again." };
}

/** FCM push addresses are long letters, digits and : _ - only. */
const PUSH_TOKEN = /^[A-Za-z0-9:_-]{20,4096}$/;

/** Push alerts on this phone or computer (00-global.md §4 rule 8): keeps the browser's push address. */
export async function savePushDevice(token: string): Promise<Result> {
  const current = await requireCurrent();
  if (!PUSH_TOKEN.test(token)) return { ok: false, message: "This browser did not give a push address. Please try again." };
  const limit = await hitLimit(`push-device:${current.user.id}`, 20, 60 * 60);
  if (!limit.ok) return { ok: false, message: limitMessage(limit) };
  const device = await deviceInfo();
  const r = await withSchool(current.ctx, async (tx) => {
    if (!(await pushOn(tx, current.ctx))) return "off";
    const existing = await tx.pushDevice.findUnique({ where: { schoolId_token: { schoolId: current.ctx.schoolId, token } } });
    // One browser belongs to whoever switched push on there last (a shared office computer).
    if (existing) {
      await tx.pushDevice.update({ where: { id: existing.id }, data: { userLoginId: current.user.id, userAgent: device.userAgent, lastSeenAt: new Date(), archivedAt: null } });
    } else {
      await tx.pushDevice.create({ data: { schoolId: current.ctx.schoolId, userLoginId: current.user.id, token, userAgent: device.userAgent } });
    }
    await writeAudit(tx, current.ctx, { action: "push-alerts-on", recordType: "User Login", recordId: current.user.id, device: device.userAgent, ipAddress: device.ipAddress });
    return "ok";
  });
  if (r === "off") return { ok: false, message: "Push alerts are not switched on by your school." };
  revalidatePath("/profile");
  return { ok: true, message: "Push alerts are on for this device" };
}

/** Stops push alerts on this phone or computer. The record is kept, archived. */
export async function removePushDevice(token: string): Promise<Result> {
  const current = await requireCurrent();
  if (!PUSH_TOKEN.test(token)) return { ok: true, message: "Push alerts are off for this device" };
  await withSchool(current.ctx, async (tx) => {
    const d = await tx.pushDevice.findUnique({ where: { schoolId_token: { schoolId: current.ctx.schoolId, token } } });
    if (!d || d.archivedAt || d.userLoginId !== current.user.id) return;
    await tx.pushDevice.update({ where: { id: d.id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, current.ctx, { action: "push-alerts-off", recordType: "User Login", recordId: current.user.id });
  });
  revalidatePath("/profile");
  return { ok: true, message: "Push alerts are off for this device" };
}

/** My profile photo: the person's own, already cropped in the browser to a square. */
export async function saveMyPhoto(fd: FormData): Promise<Result> {
  const current = await requireCurrent();
  const photo = fd.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { ok: false, message: "Choose a photo first." };
  if (photo.size > 5 * 1024 * 1024) return { ok: false, message: "This photo is too large. Choose one under 5 MB." };
  const limit = await hitLimit(`profile-photo:${current.user.id}`, 20, 60 * 60);
  if (!limit.ok) return { ok: false, message: limitMessage(limit) };
  try {
    await withSchool(current.ctx, async (tx) => {
      const saved = await saveFile(tx, current.ctx, { file: photo, purpose: "profile-photo", allowed: IMAGE_TYPES, maxImageWidth: 512 });
      const access = await tx.schoolAccess.findFirstOrThrow({ where: { schoolId: current.ctx.schoolId, userLoginId: current.user.id, archivedAt: null } });
      await tx.schoolAccess.update({ where: { id: access.id }, data: { photoFileId: saved.id } });
      // Their staff record (ID card, staff list) shows the same photo.
      const staff = await tx.staff.findFirst({ where: { userLoginId: current.user.id }, select: { id: true, photoFileId: true } });
      if (staff) await tx.staff.update({ where: { id: staff.id }, data: { photoFileId: saved.id, updatedById: current.user.id } });
      await writeAudit(tx, current.ctx, { action: "photo-changed", recordType: "User Login", recordId: current.user.id, before: { photoFileId: access.photoFileId ?? staff?.photoFileId ?? null }, after: { photoFileId: saved.id } });
    });
  } catch (e) {
    if (e instanceof FileProblem) return { ok: false, message: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Photo saved" };
}

/** Takes the person's own photo off (their staff record's photo too). The file itself is kept. */
export async function removeMyPhoto(): Promise<Result> {
  const current = await requireCurrent();
  await withSchool(current.ctx, async (tx) => {
    const access = await tx.schoolAccess.findFirstOrThrow({ where: { schoolId: current.ctx.schoolId, userLoginId: current.user.id, archivedAt: null } });
    const staff = await tx.staff.findFirst({ where: { userLoginId: current.user.id }, select: { id: true, photoFileId: true } });
    const before = access.photoFileId ?? staff?.photoFileId ?? null;
    if (!before) return;
    await tx.schoolAccess.update({ where: { id: access.id }, data: { photoFileId: null } });
    if (staff?.photoFileId) await tx.staff.update({ where: { id: staff.id }, data: { photoFileId: null, updatedById: current.user.id } });
    await writeAudit(tx, current.ctx, { action: "photo-removed", recordType: "User Login", recordId: current.user.id, before: { photoFileId: before }, after: { photoFileId: null } });
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Photo removed" };
}
