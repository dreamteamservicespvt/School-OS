"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CODE_TTL_MS, CONSOLE_STEP_COOKIE, finishWelcome, startWelcomeCode } from "@/lib/console/auth";
import { consoleDevice, consoleHostAllowed, setConsoleCookie } from "@/lib/console/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { mayLogCode } from "@/lib/dev-codes";

export type WelcomeSend = { ok: boolean; message: string; sentTo?: string; test?: boolean; inLog?: boolean } | null;
export type WelcomeState = { message: string; field?: string; restart?: boolean } | null;

const secure = process.env.NODE_ENV === "production";

export async function welcomeSendAction(token: string): Promise<WelcomeSend> {
  if (!(await consoleHostAllowed())) return { ok: false, message: "The console is not reachable at this address." };
  const r = await startWelcomeCode(token);
  if (!r.ok) return { ok: false, message: r.message };
  (await cookies()).set(CONSOLE_STEP_COOKIE, r.challenge, { httpOnly: true, secure, sameSite: "strict", path: "/console", maxAge: CODE_TTL_MS / 1000 });
  return { ok: true, message: `Code sent by SMS to +91 ${r.sentTo}.`, sentTo: r.sentTo, test: r.test, inLog: r.test && mayLogCode("none") };
}

export async function welcomeFinishAction(token: string, _prev: WelcomeState, fd: FormData): Promise<WelcomeState> {
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { message: "The two passwords are not the same. Type them again.", field: "password" };
  const device = await consoleDevice();
  const limit = await hitLimit(`console-welcome:ip:${device.ipAddress ?? "unknown"}`, 20, 600);
  if (!limit.ok) return { message: limitMessage(limit) };
  const jar = await cookies();
  const r = await finishWelcome(token, jar.get(CONSOLE_STEP_COOKIE)?.value, String(fd.get("code") ?? ""), password, device);
  if (!r.ok) return { message: r.message, field: "field" in r ? r.field : undefined, restart: "restart" in r ? r.restart : undefined };
  jar.set(CONSOLE_STEP_COOKIE, "", { path: "/console", maxAge: 0 });
  await setConsoleCookie(r.token);
  redirect("/console");
}
