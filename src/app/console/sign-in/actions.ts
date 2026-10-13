"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CONSOLE_DEVICE_COOKIE, CONSOLE_STEP_COOKIE, CODE_TTL_MS, DEVICE_DAYS, consoleSignIn, finishConsoleSignIn, resendConsoleCode } from "@/lib/console/auth";
import { consoleDevice, consoleHostAllowed, setConsoleCookie } from "@/lib/console/current";

export type PasswordState = { message?: string; errors?: { login?: string; password?: string }; login?: string } | null;
export type CodeState = { message?: string; sent?: boolean; restart?: boolean } | null;

const secure = process.env.NODE_ENV === "production";

export async function consolePasswordAction(_prev: PasswordState, fd: FormData): Promise<PasswordState> {
  if (!(await consoleHostAllowed())) return { message: "The console is not reachable at this address." };
  const login = String(fd.get("login") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const errors: NonNullable<PasswordState>["errors"] = {};
  if (!login) errors.login = "Enter your mobile number or email";
  if (!password) errors.password = "Enter your password";
  if (errors.login || errors.password) return { errors, login };
  const jar = await cookies();
  const result = await consoleSignIn(login, password, await consoleDevice(), { trustedDevice: jar.get(CONSOLE_DEVICE_COOKIE)?.value });
  if (result.kind === "error") return { errors: { password: result.message }, login };
  if (result.kind === "session") {
    await setConsoleCookie(result.token);
    redirect("/console");
  }
  jar.set(CONSOLE_STEP_COOKIE, result.challenge, { httpOnly: true, secure, sameSite: "strict", path: "/console", maxAge: CODE_TTL_MS / 1000 });
  redirect("/console/sign-in");
}

export async function consoleCodeAction(_prev: CodeState, fd: FormData): Promise<CodeState> {
  const jar = await cookies();
  const code = String(fd.get("code") ?? "");
  if (code.replace(/\D/g, "").length < 6) return { message: "Enter all 6 digits" };
  const result = await finishConsoleSignIn(jar.get(CONSOLE_STEP_COOKIE)?.value, code, fd.get("trust") === "on", await consoleDevice());
  if (!result.ok) return { message: result.message, restart: result.restart };
  jar.set(CONSOLE_STEP_COOKIE, "", { path: "/console", maxAge: 0 });
  await setConsoleCookie(result.token);
  if (result.deviceToken) jar.set(CONSOLE_DEVICE_COOKIE, result.deviceToken, { httpOnly: true, secure, sameSite: "strict", path: "/console", maxAge: DEVICE_DAYS * 86_400 });
  redirect("/console");
}

export async function consoleResendAction(): Promise<CodeState> {
  const jar = await cookies();
  const r = await resendConsoleCode(jar.get(CONSOLE_STEP_COOKIE)?.value);
  if (!r.ok) return { message: r.message, restart: /timed out|switched off/.test(r.message) };
  jar.set(CONSOLE_STEP_COOKIE, r.challenge, { httpOnly: true, secure, sameSite: "strict", path: "/console", maxAge: CODE_TTL_MS / 1000 });
  return { message: `A new code was sent to +91 ${r.sentTo}.`, sent: true };
}

export async function consoleBackAction() {
  (await cookies()).set(CONSOLE_STEP_COOKIE, "", { path: "/console", maxAge: 0 });
  redirect("/console/sign-in");
}
