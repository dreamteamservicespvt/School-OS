"use server";

import { redirect } from "next/navigation";
import { deviceInfo, setSessionCookie } from "@/lib/current";
import { finishSchoolInvite, sendSchoolInviteCode } from "@/lib/console/school-invite";
import { hitLimit, limitMessage } from "@/lib/rate-limit";

export type SendState = { ok: boolean; message: string; sentTo?: string; test?: boolean } | null;
export type FinishState = { message: string; field?: "code" | "password"; restart?: boolean } | null;

export async function sendInviteCodeAction(token: string): Promise<SendState> {
  const r = await sendSchoolInviteCode(token, (await deviceInfo()).ipAddress ?? null);
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, message: `Code sent by SMS to +91 ${r.sentTo}.`, sentTo: r.sentTo, test: r.test };
}

export async function finishInviteAction(token: string, _prev: FinishState, fd: FormData): Promise<FinishState> {
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { message: "The two passwords are not the same. Type them again.", field: "password" };
  const device = await deviceInfo();
  const limit = await hitLimit(`school-invite:ip:${device.ipAddress ?? "unknown"}`, 20, 600);
  if (!limit.ok) return { message: limitMessage(limit) };
  const r = await finishSchoolInvite(token, String(fd.get("code") ?? ""), password, device);
  if (!r.ok) return { message: r.message, field: r.field, restart: r.restart };
  await setSessionCookie(r.token);
  redirect("/dashboard");
}
