import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConsoleFrame } from "@/components/console/console-frame";
import { ButtonLink } from "@/components/ui/button";
import { findWelcome } from "@/lib/console/auth";
import { consoleHostAllowed } from "@/lib/console/current";
import { maskMobile } from "@/lib/console/activity";
import { CONSOLE_ROLES } from "@/lib/console/roles";
import { WelcomeForm } from "./form";

export const metadata: Metadata = { title: "Join the console", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function WelcomePage({ params }: { params: Promise<{ token: string }> }) {
  if (!(await consoleHostAllowed())) notFound();
  const { token } = await params;
  const w = await findWelcome(token);
  if (w.state !== "ok") {
    const [title, sub] = w.state === "used" ? ["You have already set your password", "Sign in with your mobile number and password."] : w.state === "expired" ? ["This welcome link has expired", "Links work for 3 days. Ask the Owner to send a new one."] : ["This link does not work", "Ask the Owner to send you a new welcome link."];
    return (
      <ConsoleFrame>
        <p className="text-[13px] font-semibold text-brand">DREAM TEAM SERVICES only</p>
        <h1 className="font-display text-[28px] font-semibold tracking-tight leading-tight mt-1">{title}</h1>
        <p className="text-ink3 mt-1.5 text-[15px]">{sub}</p>
        <ButtonLink href="/console/sign-in" variant="primary" size="lg" className="w-full mt-6">Go to console sign in</ButtonLink>
      </ConsoleFrame>
    );
  }
  return (
    <ConsoleFrame>
      <p className="text-[13px] font-semibold text-brand">DREAM TEAM SERVICES only</p>
      <h1 className="font-display text-[30px] font-semibold tracking-tight leading-tight mt-1">Welcome, {w.user.name.split(" ")[0]}</h1>
      <p className="text-ink3 mt-1.5 text-[15px]">You are joining the School OS console as <b className="font-semibold text-ink2">{CONSOLE_ROLES[w.user.role].label}</b>. Your username is your mobile number.</p>
      <WelcomeForm token={token} phoneMasked={maskMobile(w.user.phone)} />
    </ConsoleFrame>
  );
}
