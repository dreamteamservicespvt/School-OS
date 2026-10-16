import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrent } from "@/lib/current";
import { AuthFrame } from "@/components/auth/auth-frame";
import { SignInForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ signedOut?: string; welcome?: string; code?: string }> }) {
  if (await getCurrent()) redirect("/dashboard");
  const params = await searchParams;
  const notice =
    params.signedOut === "everywhere" ? "You were signed out on every device." :
    params.welcome ? "Your password is set. Sign in with your new password." : undefined;
  return (
    <AuthFrame eyebrow="School OS" title="Sign in" sub="Welcome back. Use the details the school office gave you.">
      <SignInForm notice={notice} startWithCode={params.code === "1"} />
    </AuthFrame>
  );
}
