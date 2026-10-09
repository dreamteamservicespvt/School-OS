import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrent } from "@/lib/current";
import { CHALLENGE_COOKIE, findChallenge, TRUST_DAYS } from "@/lib/auth/two-step";
import { CodeForm } from "./form";

export const metadata: Metadata = { title: "One-time code" };

export default async function SignInCodePage() {
  if (await getCurrent()) redirect("/dashboard");
  const challenge = await findChallenge((await cookies()).get(CHALLENGE_COOKIE)?.value);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/icon.svg" alt="" width={40} height={40} />
          <div>
            <h1 className="text-xl font-semibold">Two-step login</h1>
            <p className="text-sm text-ink-2">One more step to keep your school safe</p>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          {challenge ? (
            <CodeForm sentTo={challenge.sentTo} trustDays={TRUST_DAYS} />
          ) : (
            <div className="space-y-4">
              <p role="alert">Your sign-in has timed out, or the code was used up. Sign in again to get a new code.</p>
              <Link href="/sign-in" className="flex h-11 w-full items-center justify-center rounded-lg bg-brand font-medium text-brand-ink">Sign in again</Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
