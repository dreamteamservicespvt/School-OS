import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrent } from "@/lib/current";
import { AuthFrame } from "@/components/auth/auth-frame";
import { SignInForm } from "./form";
import { timedOutWords } from "@/lib/auth/session-rules";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ signedOut?: string; welcome?: string; code?: string; m?: string }> }) {
  if (await getCurrent()) redirect("/dashboard");
  const params = await searchParams;
  const t = await getT();
  const away = timedOutWords(params.signedOut, params.m, t);
  const notice =
    params.signedOut === "everywhere" ? t("You were signed out on every device.") :
    away ?? (params.welcome ? t("Your password is set. Sign in with your new password.") : undefined);
  return (
    <AuthFrame eyebrow="School OS" title={t("Sign in")} sub={t("Welcome back. Use the details the school office gave you.")} pickLanguage>
      <SignInForm notice={notice} noticeTone={away ? "info" : "success"} startWithCode={params.code === "1"} />
    </AuthFrame>
  );
}
