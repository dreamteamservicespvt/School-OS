import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrent } from "@/lib/current";
import { AuthFrame } from "@/components/auth/auth-frame";
import { SignInForm } from "./form";
import { timedOutWords } from "@/lib/auth/session-rules";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ signedOut?: string; welcome?: string; code?: string; m?: string }> }) {
  if (await getCurrent()) redirect("/dashboard");
  const params = await searchParams;
  const away = timedOutWords(params.signedOut, params.m);
  const notice =
    params.signedOut === "everywhere" ? "You were signed out on every device." :
    away ?? (params.welcome ? "Your password is set. Sign in with your new password." : undefined);
  return (
    <AuthFrame eyebrow="School OS" title="Sign in" sub="Welcome back. Use the details the school office gave you.">
      <SignInForm notice={notice} noticeTone={away ? "info" : "success"} startWithCode={params.code === "1"} />
    </AuthFrame>
  );
}
