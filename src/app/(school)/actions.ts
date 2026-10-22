"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { checkNewPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { mayResetWithoutOld, revokeAllSessions, revokeSession, setSessionSchool } from "@/lib/auth/sessions";
import { securityAlert } from "@/lib/auth/security-alert";
import { formatDateTime } from "@/lib/format";
import { schoolsFor } from "@/lib/auth/access";
import { clearSessionCookie, deviceInfo, getCurrent, requireCurrent } from "@/lib/current";
import { cookies } from "next/headers";
import { forgetDevice, REMEMBERED_COOKIE } from "@/lib/auth/remembered";
import { ACCENT_COOKIE, SIZE_COOKIE, THEME_COOKIE, cleanAccent, cleanTextSize, cleanTheme } from "@/lib/theme";

async function audit(action: string, extra: { recordId?: string; after?: object } = {}) {
  const current = await requireCurrent({ paused: "any" });
  const device = await deviceInfo();
  await withSchool(current.ctx, (tx) =>
    writeAudit(tx, current.ctx, {
      action,
      recordType: "User Login",
      recordId: extra.recordId ?? current.user.id,
      after: extra.after,
      device: device.userAgent,
      ipAddress: device.ipAddress,
    }),
  );
}

/** Signing out on a device forgets it, so the next sign-in there asks for the two-step code. */
async function forgetThisDevice(userLoginId: string, deviceKey: string | null) {
  const jar = await cookies();
  await forgetDevice(userLoginId, { token: jar.get(REMEMBERED_COOKIE)?.value, deviceKey });
  jar.delete(REMEMBERED_COOKIE);
}

export async function signOut() {
  const current = await requireCurrent({ paused: "any" });
  await audit("signed-out");
  await revokeSession(current.session.id, current.user.id, "Signed out");
  await forgetThisDevice(current.user.id, current.session.deviceKey);
  await clearSessionCookie();
  redirect("/sign-in");
}

export async function signOutEverywhere() {
  const current = await requireCurrent();
  await audit("signed-out-everywhere");
  // Every remembered device is forgotten too (sessions.ts).
  await revokeAllSessions(current.user.id, "Signed out everywhere");
  (await cookies()).delete(REMEMBERED_COOKIE);
  await clearSessionCookie();
  redirect("/sign-in?signedOut=everywhere");
}

export async function signOutDevice(formData: FormData) {
  const current = await requireCurrent();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (sessionId === current.session.id) return signOut();
  const other = await prisma.session.findFirst({ where: { id: sessionId, userLoginId: current.user.id }, select: { deviceKey: true } });
  await revokeSession(sessionId, current.user.id, "Signed out from another device");
  // That device is forgotten too, unless it is this same browser.
  if (other?.deviceKey && other.deviceKey !== current.session.deviceKey) await forgetDevice(current.user.id, { deviceKey: other.deviceKey });
  await audit("signed-out-device", { after: { session: sessionId } });
  revalidatePath("/profile");
}

export async function switchSchool(formData: FormData) {
  const current = await requireCurrent();
  const schoolId = String(formData.get("schoolId") ?? "");
  const schools = await schoolsFor(current.user.id);
  if (!schools.some((s) => s.id === schoolId)) return;
  await setSessionSchool(current.session.id, schoolId);
  // Reload the same page for the chosen school (00-global.md §1.3).
  const back = String(formData.get("back") ?? "/dashboard");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/dashboard");
}

export async function markAllNotificationsRead() {
  const current = await requireCurrent();
  await withSchool(current.ctx, (tx) =>
    tx.notification.updateMany({ where: { userLoginId: current.user.id, readAt: null }, data: { readAt: new Date() } }),
  );
  revalidatePath("/", "layout");
}

/** Opening a notification marks it read and goes to the screen it is about. */
export async function openNotification(formData: FormData) {
  const current = await requireCurrent();
  const id = String(formData.get("id") ?? "");
  const note = /^[0-9a-f-]{36}$/i.test(id)
    ? await withSchool(current.ctx, async (tx) => {
        const n = await tx.notification.findFirst({ where: { id, userLoginId: current.user.id } });
        if (n && !n.readAt) await tx.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
        return n;
      })
    : null;
  revalidatePath("/", "layout");
  // Only addresses inside School OS.
  redirect(note?.link && note.link.startsWith("/") && !note.link.startsWith("//") ? note.link : "/notifications");
}

export type PasswordState = { ok: boolean; message: string } | null;

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const current = await requireCurrent();
  const oldPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  // Like sign-in, a limited number of tries: an open session must not become a way to guess the password.
  const limit = await hitLimit(`change-password:${current.user.id}`, 10, 600);
  if (!limit.ok) return { ok: false, message: limitMessage(limit) };
  const user = await prisma.userLogin.findUniqueOrThrow({ where: { id: current.user.id } });
  // Just signed in with a one-time code (a forgotten password): the old password is not needed.
  const withoutOld = !oldPassword && mayResetWithoutOld(current.session);
  if (!withoutOld && (!user.passwordHash || !(await verifyPassword(user.passwordHash, oldPassword)))) {
    return { ok: false, message: "Your current password is not right. Check it and try again." };
  }
  const problem = checkNewPassword(newPassword);
  if (problem) return { ok: false, message: `New password: ${problem}` };
  if (newPassword !== confirm) return { ok: false, message: "The two new passwords are not the same. Type them again." };

  const now = new Date();
  await prisma.userLogin.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: now, mustChangePassword: false },
  });
  // Used once: the next change needs the new password.
  if (withoutOld) await prisma.session.update({ where: { id: current.session.id }, data: { signedInWithCode: false } });
  // A changed password signs out every other device, and forgets every remembered device but this one.
  const others = await revokeAllSessions(user.id, "Password changed", current.session.id, { keepRememberedToken: (await cookies()).get(REMEMBERED_COOKIE)?.value });
  const device = await deviceInfo();
  // The person is told even though they did it themselves: it matters most when it was not them.
  const afterSave = await withSchool(current.ctx, async (tx) => {
    await writeAudit(tx, current.ctx, {
      action: "changed-password", recordType: "User Login", recordId: user.id,
      after: withoutOld ? { with: "one-time code sign-in" } : undefined, device: device.userAgent, ipAddress: device.ipAddress,
    });
    const school = await tx.school.findUnique({ where: { id: current.ctx.schoolId }, select: { timeZone: true } });
    return securityAlert(tx, current.ctx.schoolId, user.id, {
      subject: "Your School OS password was changed",
      text: `Your School OS password was changed on ${formatDateTime(now, school?.timeZone)}${others > 0 ? ` and ${others} other device${others === 1 ? " was" : "s were"} signed out` : ""}. Not you? Tell your School Admin at once.`,
      link: "/profile#password",
    });
  });
  await afterSave();
  return {
    ok: true,
    message: others > 0 ? `Password changed. You were signed out on ${others} other device${others === 1 ? "" : "s"}.` : "Password changed.",
  };
}

/** Appearance: light, dark or the device's choice, a school colour and the text size. */
export async function setAppearance(formData: FormData) {
  const current = await requireCurrent();
  const theme = cleanTheme(String(formData.get("theme") ?? current.user.theme));
  const accent = cleanAccent(String(formData.get("accent") ?? current.user.accent));
  const textSize = cleanTextSize(String(formData.get("textSize") ?? current.user.textSize));
  await prisma.userLogin.update({ where: { id: current.user.id }, data: { theme, accent, textSize } });
  const jar = await cookies();
  const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
  jar.set(THEME_COOKIE, theme, opts);
  jar.set(ACCENT_COOKIE, current.school.accent ? cleanAccent(current.school.accent) : accent, opts);
  jar.set(SIZE_COOKIE, textSize, opts);
  revalidatePath("/", "layout");
}

/**
 * Keeps this sign-in going while the person is busy on a page without
 * opening another (a long form): the browser asks now and then after they
 * typed or tapped (components/shell/away-watch.tsx). Reading the session on
 * the server counts as use. False when the sign-in has already ended.
 */
export async function keepSignedIn(): Promise<boolean> {
  return Boolean(await getCurrent());
}
