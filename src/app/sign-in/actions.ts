"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth/sign-in";
import { deviceInfo, setSessionCookie } from "@/lib/current";

export type SignInState = { message: string; username: string } | null;

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) {
    return { message: "Type your username and your password.", username };
  }
  const result = await signIn(username, password, await deviceInfo());
  if (!result.ok) return { message: result.message, username };
  await setSessionCookie(result.token);
  redirect("/dashboard");
}
