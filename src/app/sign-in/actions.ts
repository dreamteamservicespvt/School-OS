"use server";

import { cleanAccent } from "@/lib/theme";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { afterRightCode, signIn, startCodeSignIn, startSecondStep } from "@/lib/auth/sign-in";
import { CHALLENGE_COOKIE, CODE_TTL_MS, KEEP_SIGNED_IN_COOKIE, findChallenge, startChallenge, verifyChallenge } from "@/lib/auth/two-step";
import { forgetDevice, rememberDevice, REMEMBERED_COOKIE, REMEMBERED_COOKIE_MAX_AGE } from "@/lib/auth/remembered";
import { deviceKeyOf } from "@/lib/auth/tokens";
import { setAppearanceCookies, setSessionCookie, signInDevice } from "@/lib/current";
import { prisma } from "@/lib/db";
import { hitLimit, limitMessage } from "@/lib/rate-limit";

export type SignInState = { message: string; username: string } | null;

const secure = process.env.NODE_ENV === "production";

const REMEMBER_COOKIE = KEEP_SIGNED_IN_COOKIE;

async function keepRemembered(token: string) {
  (await cookies()).set(REMEMBERED_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: REMEMBERED_COOKIE_MAX_AGE });
}

async function finish(userLoginId: string, token: string, remember = true) {
  await setSessionCookie(token, remember);
  const user = await prisma.userLogin.findUnique({ where: { id: userLoginId }, select: { theme: true, accent: true, textSize: true } });
  if (user) await setAppearanceCookies(user.theme, cleanAccent(user.accent), user.textSize);
}

async function keepChallenge(token: string) {
  (await cookies()).set(CHALLENGE_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/sign-in", maxAge: CODE_TTL_MS / 1000 });
}

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) {
    return { message: "Type your username and your password.", username };
  }
  const device = await signInDevice();
  const limit = await hitLimit(`sign-in:ip:${device.ipAddress ?? "unknown"}`, 30, 600);
  if (!limit.ok) return { message: limitMessage(limit), username };
  const jar = await cookies();
  const result = await signIn(username, password, device, { trustedDevice: jar.get(REMEMBERED_COOKIE)?.value });
  const remember = formData.get("remember") === "on";
  if (!result.ok && result.twoStep) {
    const step = await startSecondStep(result.twoStep.userLoginId, result.twoStep.schoolId, device);
    if (step.kind === "problem") return { message: step.message, username };
    if (step.kind === "signed-in") {
      // No code can reach this person yet: signed in, and My profile shows how to fix it.
      await finish(result.twoStep.userLoginId, step.token, remember);
      redirect("/profile?twoStep=add#password");
    }
    jar.set(REMEMBER_COOKIE, remember ? "1" : "0", { httpOnly: true, secure, sameSite: "lax", path: "/sign-in", maxAge: CODE_TTL_MS / 1000 });
    await keepChallenge(step.token);
    redirect("/sign-in/code");
  }
  if (!result.ok) return { message: result.message, username };
  // A remembered device skipped the code: its 180 days start again from today.
  if (result.remembered) await keepRemembered(jar.get(REMEMBERED_COOKIE)!.value);
  await finish(result.userLoginId, result.token, remember);
  redirect("/dashboard");
}

/**
 * Sign in with a one-time code instead of the password (also the way back in
 * after a forgotten password). The code goes to the mobile or email on the
 * login. A person whose role needs two-step login gets a second code on their
 * other contact before they are signed in.
 */
export async function codeSignInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const username = String(formData.get("username") ?? "").trim();
  if (!username) return { message: "Type your mobile number, email or username.", username };
  const device = await signInDevice();
  const limit = await hitLimit(`code-sign-in:ip:${device.ipAddress ?? "unknown"}`, 10, 600);
  if (!limit.ok) return { message: limitMessage(limit), username };
  const started = await startCodeSignIn(username, device);
  if (!started.ok) return { message: started.message, username };
  await keepChallenge(started.token);
  (await cookies()).set(REMEMBER_COOKIE, formData.get("remember") === "on" ? "1" : "0", { httpOnly: true, secure, sameSite: "lax", path: "/sign-in", maxAge: CODE_TTL_MS / 1000 });
  redirect("/sign-in/code");
}

export type CodeState = { message: string; restart?: boolean; sent?: boolean } | null;

export async function verifyCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  const device = await signInDevice();
  const limit = await hitLimit(`two-step:ip:${device.ipAddress ?? "unknown"}`, 30, 600);
  if (!limit.ok) return { message: limitMessage(limit) };
  const result = await verifyChallenge(token, String(formData.get("code") ?? ""), device);
  if (!result.ok) {
    if (result.restart) jar.delete({ name: CHALLENGE_COOKIE, path: "/sign-in" });
    return { message: result.message, restart: result.restart };
  }
  jar.delete({ name: CHALLENGE_COOKIE, path: "/sign-in" });
  const next = await afterRightCode(result, device);
  if (next.kind === "problem") return { message: next.message, restart: true };
  if (next.kind === "second-code") {
    // The first code was right; the page now asks for the second one.
    await keepChallenge(next.token);
    redirect("/sign-in/code");
  }
  // After the password and a right code, this device is remembered, unless the
  // person ticked "Shared computer: ask for the code every time".
  if (next.mayRemember && formData.get("shared") !== "on") {
    await keepRemembered(await rememberDevice(next.userLoginId, device));
  } else if (next.mayRemember) {
    await forgetDevice(next.userLoginId, { token: jar.get(REMEMBERED_COOKIE)?.value, deviceKey: deviceKeyOf(device.deviceId) });
    jar.delete(REMEMBERED_COOKIE);
  }
  const remember = jar.get(REMEMBER_COOKIE)?.value !== "0";
  jar.delete({ name: REMEMBER_COOKIE, path: "/sign-in" });
  await finish(next.userLoginId, next.token, remember);
  // After a code instead of the password, My profile lets them set a new password.
  redirect(result.purpose === "sign-in" ? "/dashboard" : "/profile?newPassword=1#password");
}

export async function resendCodeAction(): Promise<CodeState> {
  const jar = await cookies();
  const challenge = await findChallenge(jar.get(CHALLENGE_COOKIE)?.value);
  if (!challenge?.schoolId) {
    jar.delete({ name: CHALLENGE_COOKIE, path: "/sign-in" });
    return { message: "Your sign-in has timed out. Sign in again.", restart: true };
  }
  // A new code goes the same way as the one it replaces, for the same step.
  const only = challenge.purpose === "sign-in" ? undefined : challenge.channel === "email" ? "email" : challenge.channel === "sms" ? "phone" : undefined;
  const started = await startChallenge(challenge.userLoginId, challenge.schoolId, await signInDevice(), { purpose: challenge.purpose, only });
  if (!started.ok) return { message: started.message };
  await keepChallenge(started.token);
  return { message: `A new code was sent to ${started.sentTo}. The earlier code no longer works.`, sent: true };
}
