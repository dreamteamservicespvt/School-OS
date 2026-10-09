import type { Metadata } from "next";
import Link from "next/link";
import { findInvite } from "@/lib/auth/invites";
import { InviteForm } from "./form";

export const metadata: Metadata = { title: "Set your password" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await findInvite(token);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">
        {user ? (
          <>
            <h1 className="text-xl font-semibold">Welcome, {user.displayName}</h1>
            <p className="mb-5 mt-1 text-sm text-ink-2">
              Choose your own password. Your username is <strong className="text-ink">{user.username}</strong>. Nobody else, including DREAM TEAM, can see your password.
            </p>
            <InviteForm token={token} />
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">This link has expired</h1>
            <p className="mt-2 text-sm text-ink-2">
              Invite links work once, for 7 days. Ask your School Admin to send you a new one.
            </p>
            <Link href="/sign-in" className="mt-4 inline-block font-medium text-brand-text underline">Go to sign in</Link>
          </>
        )}
      </div>
    </main>
  );
}
