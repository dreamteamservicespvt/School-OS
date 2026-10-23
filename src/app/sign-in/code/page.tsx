import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrent } from "@/lib/current";
import { CHALLENGE_COOKIE, findChallenge, KEEP_SIGNED_IN_COOKIE } from "@/lib/auth/two-step";
import { AuthFrame } from "@/components/auth/auth-frame";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { CodeForm } from "./form";
import { getT, pageTitle } from "@/lib/i18n/server";

/** The tab title in the same language as the page (the browser's choice, else English). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("One-time code") };
}

export default async function SignInCodePage() {
  if (await getCurrent()) redirect("/dashboard");
  const jar = await cookies();
  const challenge = await findChallenge(jar.get(CHALLENGE_COOKIE)?.value);
  // Unticking "Keep me signed in" on the password page also ticks "Shared computer" here.
  const shared = jar.get(KEEP_SIGNED_IN_COOKIE)?.value === "0";
  const second = challenge?.purpose === "code-sign-in-second";
  const t = await getT();
  return (
    <AuthFrame eyebrow={second ? t("Last step") : t("One more step")} title={second ? t("Enter the second code") : t("Enter the code")} sub={second ? t("The first code was right. Your role needs a second code, on your other contact.") : t("This keeps your school's records safe.")}>
      {challenge ? (
        // A code typed instead of the password never makes a remembered device, so no choice is shown.
        <CodeForm key={challenge.id} sentTo={challenge.sentTo} remembers={challenge.purpose !== "code-sign-in"} sharedDefault={shared} />
      ) : (
        <div className="flex flex-col gap-4">
          <Alert tone="danger">{t("Your sign-in has timed out, or the code was used up. Sign in again to get a new code.")}</Alert>
          <ButtonLink href="/sign-in" variant="primary" size="lg" className="w-full">{t("Sign in again")}</ButtonLink>
        </div>
      )}
    </AuthFrame>
  );
}
