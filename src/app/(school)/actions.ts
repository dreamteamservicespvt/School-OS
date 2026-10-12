"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { checkNewPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { revokeAllSessions, revokeSession, setSessionSchool } from "@/lib/auth/sessions";
import { schoolsFor } from "@/lib/auth/access";
import { clearSessionCookie, deviceInfo, requireCurrent } from "@/lib/current";
import { cookies } from "next/headers";
import { ACCENT_COOKIE, SIZE_COOKIE, THEME_COOKIE, cleanAccent, cleanTextSize, cleanTheme } from "@/lib/theme";

async function audit(action: string, extra: { recordId?: string; after?: object } = {}) {
  const current = await requireCurrent();
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

export async function signOut() {
  const current = await requireCurrent();
  await audit("signed-out");
  await revokeSession(current.session.id, current.user.id, "Signed out");
  await clearSessionCookie();
  redirect("/sign-in");
}

export async function signOutEverywhere() {
  const current = await requireCurrent();
  await audit("signed-out-everywhere");
  await revokeAllSessions(current.user.id, "Signed out everywhere");
  await clearSessionCookie();
  redirect("/sign-in?signedOut=everywhere");
}

export async function signOutDevice(formData: FormData) {
  const current = await requireCurrent();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (sessionId === current.session.id) return signOut();
  await revokeSession(sessionId, current.user.id, "Signed out from another device");
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

  const user = await prisma.userLogin.findUniqueOrThrow({ where: { id: current.user.id } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, oldPassword))) {
    return { ok: false, message: "Your current password is not right. Check it and try again." };
  }
  const problem = checkNewPassword(newPassword);
  if (problem) return { ok: false, message: `New password: ${problem}` };
  if (newPassword !== confirm) return { ok: false, message: "The two new passwords are not the same. Type them again." };

  await prisma.userLogin.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
  });
  // A changed password signs out every other device.
  const others = await revokeAllSessions(user.id, "Password changed", current.session.id);
  await audit("changed-password");
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
