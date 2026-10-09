"use server";

import { redirect } from "next/navigation";
import { acceptInvite } from "@/lib/auth/invites";

export type InviteState = { message: string } | null;

export async function acceptInviteAction(token: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm") ?? "")) {
    return { message: "The two passwords are not the same. Type them again." };
  }
  const result = await acceptInvite(token, password);
  if (!result.ok) return { message: result.message };
  redirect("/sign-in?welcome=1");
}
