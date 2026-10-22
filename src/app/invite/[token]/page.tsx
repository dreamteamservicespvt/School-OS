import type { Metadata } from "next";
import { findInvite } from "@/lib/auth/invites";
import { passwordRulesForLogin, passwordRuleWords } from "@/lib/auth/password-rules";
import { AuthFrame } from "@/components/auth/auth-frame";
import { ButtonLink } from "@/components/ui/button";
import { InviteForm } from "./form";
import { Words } from "@/lib/i18n/client";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Set your password" };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ first?: string }> }) {
  const { token } = await params;
  // After signing in with a temporary password from the school (09 Add Staff).
  const first = (await searchParams).first === "1";
  const user = await findInvite(token);
  const t = await getT();
  if (!user) {
    return (
      <AuthFrame eyebrow="Invite link" title="This link has expired" sub="Invite links work once, for 7 days. Ask your School Admin to send you a new one.">
        <ButtonLink href="/sign-in" variant="primary" size="lg" className="w-full"><Words k="Go to sign in" /></ButtonLink>
      </AuthFrame>
    );
  }
  const rules = await passwordRulesForLogin(user.id);
  // Sent here at sign-in because the password is older than the school allows (Password Policy expiry).
  const expired = first && !user.mustChangePassword && Boolean(user.passwordHash);
  return (
    <AuthFrame eyebrow="Welcome to School OS" title={t("Hello, {name}", { name: user.displayName.split(" ")[0] })}
      sub={<>{first && user.mustChangePassword ? `${t("You signed in with a temporary password from your school.")} ` : ""}{expired ? `${t("Your password is older than your school allows ({n} days).", { n: rules.expiryDays ?? 0 })} ` : ""}<Words k="Choose your own password. Your username is" /> <b className="font-semibold text-ink">{user.username}</b><Words k=". Nobody else, including DREAM TEAM, can see your password." /></>}>
      <InviteForm token={token} minLength={rules.minLength} rulesWords={passwordRuleWords(rules)} />
    </AuthFrame>
  );
}
