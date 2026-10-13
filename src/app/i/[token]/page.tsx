import type { Metadata } from "next";
import { findSchoolInvite } from "@/lib/console/school-invite";
import { maskMobile } from "@/lib/console/activity";
import { ROLE_WORDS } from "@/lib/console/schools";
import { supportPhone } from "@/lib/console/outbox";
import { AuthFrame } from "@/components/auth/auth-frame";
import { ButtonLink } from "@/components/ui/button";
import { SchoolInviteForm } from "./form";

export const metadata: Metadata = { title: "Set your password", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const GONE: Record<string, [string, string]> = {
  missing: ["This link does not work", "Check that you opened the whole link from the message."],
  used: ["This link was already used", "Sign in with your mobile number and the password you chose."],
  cancelled: ["This link was cancelled", "DREAM TEAM cancelled it. Ask them for a new one if you still need it."],
  replaced: ["A newer link was sent", "Open the latest message from School OS. This older link no longer works."],
  expired: ["This link has expired", "Links work for 3 days. Ask DREAM TEAM to send a new one."],
};

export default async function SchoolInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const look = await findSchoolInvite(token);
  if (look.state !== "ok") {
    const [title, sub] = GONE[look.state];
    const help = supportPhone();
    return (
      <AuthFrame eyebrow="School OS" title={title} sub={<>{sub}{help ? <> DREAM TEAM support: <a href={`tel:${help.replace(/\s/g, "")}`} className="font-semibold text-brand">{help}</a>.</> : null}</>}>
        <ButtonLink href="/sign-in" variant="primary" size="lg" className="w-full">Go to sign in</ButtonLink>
      </AuthFrame>
    );
  }
  const inv = look.invite;
  const reset = inv.kind === "RESET";
  return (
    <AuthFrame eyebrow={look.schoolName} title={reset ? `Set a new password, ${inv.name.split(" ")[0]}` : `Welcome, ${inv.name.split(" ")[0]}`}
      sub={<>{reset ? "Your old password no longer works." : `Your ${ROLE_WORDS[inv.roleKey] ?? "School Admin"} login is ready.`} Your username is your mobile number, <b className="font-semibold text-ink tnum">{maskMobile(inv.phone)}</b>. Nobody else, including DREAM TEAM, can see your password.</>}>
      <SchoolInviteForm token={token} phoneMasked={maskMobile(inv.phone)} reset={reset} />
    </AuthFrame>
  );
}
