import type { Metadata } from "next";
import { findInvite } from "@/lib/auth/invites";
import { AuthFrame } from "@/components/auth/auth-frame";
import { ButtonLink } from "@/components/ui/button";
import { InviteForm } from "./form";

export const metadata: Metadata = { title: "Set your password" };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ first?: string }> }) {
  const { token } = await params;
  // After signing in with a temporary password from the school (09 Add Staff).
  const first = (await searchParams).first === "1";
  const user = await findInvite(token);
  if (!user) {
    return (
      <AuthFrame eyebrow="Invite link" title="This link has expired" sub="Invite links work once, for 7 days. Ask your School Admin to send you a new one.">
        <ButtonLink href="/sign-in" variant="primary" size="lg" className="w-full">Go to sign in</ButtonLink>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame eyebrow="Welcome to School OS" title={`Hello, ${user.displayName.split(" ")[0]}`}
      sub={<>{first && user.mustChangePassword ? "You signed in with a temporary password from your school. " : ""}Choose your own password. Your username is <b className="font-semibold text-ink">{user.username}</b>. Nobody else, including DREAM TEAM, can see your password.</>}>
      <InviteForm token={token} />
    </AuthFrame>
  );
}
