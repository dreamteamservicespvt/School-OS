import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrent } from "@/lib/current";
import { CHALLENGE_COOKIE, findChallenge, TRUST_DAYS } from "@/lib/auth/two-step";
import { AuthFrame } from "@/components/auth/auth-frame";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { CodeForm } from "./form";

export const metadata: Metadata = { title: "One-time code" };

export default async function SignInCodePage() {
  if (await getCurrent()) redirect("/dashboard");
  const challenge = await findChallenge((await cookies()).get(CHALLENGE_COOKIE)?.value);
  return (
    <AuthFrame eyebrow="One more step" title="Enter the code" sub="This keeps your school's records safe.">
      {challenge ? (
        <CodeForm sentTo={challenge.sentTo} trustDays={TRUST_DAYS} />
      ) : (
        <div className="flex flex-col gap-4">
          <Alert tone="danger">Your sign-in has timed out, or the code was used up. Sign in again to get a new code.</Alert>
          <ButtonLink href="/sign-in" variant="primary" size="lg" className="w-full">Sign in again</ButtonLink>
        </div>
      )}
    </AuthFrame>
  );
}
