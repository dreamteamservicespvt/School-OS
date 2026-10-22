import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrent } from "@/lib/current";
import { AuthFrame } from "@/components/auth/auth-frame";
import { SignInForm } from "./form";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ signedOut?: string; welcome?: string; code?: string }> }) {
  if (await getCurrent()) redirect("/dashboard");
  const params = await searchParams;
  const t = await getT();
  const notice =
    params.signedOut === "everywhere" ? t("You were signed out on every device.") :
    params.welcome ? t("Your password is set. Sign in with your new password.") : undefined;
  return (
    <AuthFrame eyebrow="School OS" title={t("Sign in")} sub={t("Welcome back. Use the details the school office gave you.")} pickLanguage>
      <SignInForm notice={notice} startWithCode={params.code === "1"} />
    </AuthFrame>
  );
}
