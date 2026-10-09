"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth/sign-in";
import { deviceInfo, setAppearanceCookies, setSessionCookie } from "@/lib/current";
import { prisma } from "@/lib/db";
import { hitLimit, limitMessage } from "@/lib/rate-limit";

export type SignInState = { message: string; username: string } | null;

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) {
    return { message: "Type your username and your password.", username };
  }
  const device = await deviceInfo();
  const limit = await hitLimit(`sign-in:ip:${device.ipAddress ?? "unknown"}`, 30, 600);
  if (!limit.ok) return { message: limitMessage(limit), username };
  const result = await signIn(username, password, device);
  if (!result.ok) return { message: result.message, username };
  await setSessionCookie(result.token);
  const user = await prisma.userLogin.findUnique({ where: { id: result.userLoginId }, select: { theme: true, accent: true } });
  if (user) await setAppearanceCookies(user.theme, user.accent);
  redirect("/dashboard");
}
