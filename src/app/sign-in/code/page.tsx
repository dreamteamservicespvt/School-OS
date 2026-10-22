import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrent } from "@/lib/current";
import { CHALLENGE_COOKIE, findChallenge, KEEP_SIGNED_IN_COOKIE } from "@/lib/auth/two-step";
import { AuthFrame } from "@/components/auth/auth-frame";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { CodeForm } from "./form";

export const metadata: Metadata = { title: "One-time code" };

export default async function SignInCodePage() {
  if (await getCurrent()) redirect("/dashboard");
  const jar = await cookies();
  const challenge = await findChallenge(jar.get(CHALLENGE_COOKIE)?.value);
  // Unticking "Keep me signed in" on the password page also ticks "Shared computer" here.
  const shared = jar.get(KEEP_SIGNED_IN_COOKIE)?.value === "0";
  const second = challenge?.purpose === "code-sign-in-second";
  return (
    <AuthFrame eyebrow={second ? "Last step" : "One more step"} title={second ? "Enter the second code" : "Enter the code"} sub={second ? "The first code was right. Your role needs a second code, on your other contact." : "This keeps your school's records safe."}>
      {challenge ? (
        // A code typed instead of the password never makes a remembered device, so no choice is shown.
        <CodeForm key={challenge.id} sentTo={challenge.sentTo} remembers={challenge.purpose !== "code-sign-in"} sharedDefault={shared} />
      ) : (
        <div className="flex flex-col gap-4">
          <Alert tone="danger">Your sign-in has timed out, or the code was used up. Sign in again to get a new code.</Alert>
          <ButtonLink href="/sign-in" variant="primary" size="lg" className="w-full">Sign in again</ButtonLink>
        </div>
      )}
    </AuthFrame>
  );
}
