import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrent } from "@/lib/current";
import { SignInForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ signedOut?: string; welcome?: string }> }) {
  if (await getCurrent()) redirect("/dashboard");
  const params = await searchParams;
  const notice =
    params.signedOut === "everywhere" ? "You were signed out on every device." :
    params.welcome ? "Your password is set. Sign in with your username and new password." : undefined;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/icon.svg" alt="" width={40} height={40} />
          <div>
            <h1 className="text-xl font-semibold">School OS</h1>
            <p className="text-sm text-ink-2">Sign in to your school</p>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <SignInForm notice={notice} />
        </div>
      </div>
    </main>
  );
}
