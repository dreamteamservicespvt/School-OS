"use server";

import { redirect } from "next/navigation";
import { acceptInvite } from "@/lib/auth/invites";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";

export type InviteState = { message: string } | null;

export async function acceptInviteAction(token: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm") ?? "")) {
    return { message: "The two passwords are not the same. Type them again." };
  }
  const device = await deviceInfo();
  const limit = await hitLimit(`invite:ip:${device.ipAddress ?? "unknown"}`, 20, 600);
  if (!limit.ok) return { message: limitMessage(limit) };
  const result = await acceptInvite(token, password, new Date(), device);
  if (!result.ok) return { message: result.message };
  redirect("/sign-in?welcome=1");
}
