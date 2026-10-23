import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { ConsoleFrame, StepDots } from "@/components/console/console-frame";
import { CONSOLE_STEP_COOKIE, DEVICE_DAYS, pendingCode, testCopyCode } from "@/lib/console/auth";
import { consoleHostAllowed, getConsole } from "@/lib/console/current";
import { appUrl, codesCanBeSent } from "@/lib/console/outbox";
import { withConsole } from "@/lib/db";
import { mayLogCode } from "@/lib/dev-codes";
import { CodeStep, PasswordStep } from "./form";

export const metadata: Metadata = { title: "Console sign in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ConsoleSignInPage({ searchParams }: { searchParams: Promise<{ timedOut?: string; out?: string }> }) {
  if (!(await consoleHostAllowed())) notFound();
  if (await getConsole()) redirect("/console");
  const sp = await searchParams;
  const challenge = (await cookies()).get(CONSOLE_STEP_COOKIE)?.value;
  const pending = await pendingCode(challenge);
  const user = pending ? await withConsole((tx) => tx.superAdminUser.findUnique({ where: { id: pending.userId }, select: { name: true, email: true } })) : null;
  const step = pending && pending.purpose === "sign-in" && user ? 2 : 1;
  const host = (await headers()).get("host") ?? "";
  const schoolsHost = appUrl().replace(/^https?:\/\//, "");
  const notice = sp.timedOut ? "You were signed out after 30 minutes without use. Sign in again." : sp.out ? "You are signed out of the console." : undefined;
  return (
    <ConsoleFrame>
      <p className="text-[13px] font-semibold text-brand">DREAM TEAM SERVICES only</p>
      <h1 className="font-display text-[30px] font-semibold tracking-tight leading-tight mt-1">Console sign in</h1>
      <p className="text-ink3 mt-1.5 text-[15px]">This is a separate sign-in from the schools’ sign-in page. School logins never work here.</p>
      <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-sunken px-3.5 py-2.5 text-[13.5px]">
        <Lock size={16} className="text-ok shrink-0 mt-0.5" aria-hidden="true" />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]"><b className="font-semibold">{host}/console</b>{schoolsHost && <span className="block text-ink3 text-[12.5px]">Schools use {schoolsHost}/sign-in</span>}</span>
      </div>
      <StepDots step={step} />
      {step === 1 ? (
        <PasswordStep notice={notice} />
      ) : (
        <CodeStep sentTo={pending!.sentTo} name={user!.name} trustDays={DEVICE_DAYS} test={!codesCanBeSent()} inLog={mayLogCode("none")} shownCode={testCopyCode(challenge)} />
      )}
    </ConsoleFrame>
  );
}
