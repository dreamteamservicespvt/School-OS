"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { completeSignIn, signIn } from "@/lib/auth/sign-in";
import { CHALLENGE_COOKIE, CODE_TTL_MS, TRUST_DAYS, TRUSTED_COOKIE, findChallenge, startChallenge, trustDevice, verifyChallenge } from "@/lib/auth/two-step";
import { deviceInfo, setAppearanceCookies, setSessionCookie } from "@/lib/current";
import { prisma } from "@/lib/db";
import { hitLimit, limitMessage } from "@/lib/rate-limit";

export type SignInState = { message: string; username: string } | null;

const secure = process.env.NODE_ENV === "production";

async function finish(userLoginId: string, token: string) {
  await setSessionCookie(token);
  const user = await prisma.userLogin.findUnique({ where: { id: userLoginId }, select: { theme: true, accent: true } });
  if (user) await setAppearanceCookies(user.theme, user.accent);
}

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) {
    return { message: "Type your username and your password.", username };
  }
  const device = await deviceInfo();
  const limit = await hitLimit(`sign-in:ip:${device.ipAddress ?? "unknown"}`, 30, 600);
  if (!limit.ok) return { message: limitMessage(limit), username };
  const jar = await cookies();
  const result = await signIn(username, password, device, { trustedDevice: jar.get(TRUSTED_COOKIE)?.value });
  if (!result.ok && result.twoStep) {
    const started = await startChallenge(result.twoStep.userLoginId, result.twoStep.schoolId, device);
    if (!started.ok) return { message: started.message, username };
    jar.set(CHALLENGE_COOKIE, started.token, { httpOnly: true, secure, sameSite: "lax", path: "/sign-in", maxAge: CODE_TTL_MS / 1000 });
    redirect("/sign-in/code");
  }
  if (!result.ok) return { message: result.message, username };
  await finish(result.userLoginId, result.token);
  redirect("/dashboard");
}

export type CodeState = { message: string; restart?: boolean; sent?: boolean } | null;

export async function verifyCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  const device = await deviceInfo();
  const limit = await hitLimit(`two-step:ip:${device.ipAddress ?? "unknown"}`, 30, 600);
  if (!limit.ok) return { message: limitMessage(limit) };
  const result = await verifyChallenge(token, String(formData.get("code") ?? ""), device);
  if (!result.ok) {
    if (result.restart) jar.delete({ name: CHALLENGE_COOKIE, path: "/sign-in" });
    return { message: result.message, restart: result.restart };
  }
  jar.delete({ name: CHALLENGE_COOKIE, path: "/sign-in" });
  const { token: session } = await completeSignIn(result.userLoginId, result.schoolId, device);
  if (formData.get("trust") === "on") {
    const trusted = await trustDevice(result.userLoginId, device);
    jar.set(TRUSTED_COOKIE, trusted, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: TRUST_DAYS * 86_400 });
  }
  await finish(result.userLoginId, session);
  redirect("/dashboard");
}

export async function resendCodeAction(): Promise<CodeState> {
  const jar = await cookies();
  const challenge = await findChallenge(jar.get(CHALLENGE_COOKIE)?.value);
  if (!challenge?.schoolId) {
    jar.delete({ name: CHALLENGE_COOKIE, path: "/sign-in" });
    return { message: "Your sign-in has timed out. Sign in again.", restart: true };
  }
  const started = await startChallenge(challenge.userLoginId, challenge.schoolId, await deviceInfo());
  if (!started.ok) return { message: started.message };
  jar.set(CHALLENGE_COOKIE, started.token, { httpOnly: true, secure, sameSite: "lax", path: "/sign-in", maxAge: CODE_TTL_MS / 1000 });
  return { message: `A new code was sent to ${started.sentTo}. The earlier code no longer works.`, sent: true };
}
