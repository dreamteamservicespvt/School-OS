import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreditCard, Download, LogOut, PhoneCall } from "lucide-react";
import { getCurrent, isPaused, pausedAdmin } from "@/lib/current";
import { schoolPlanState } from "@/lib/console/school-billing";
import { AuthFrame } from "@/components/auth/auth-frame";
import { Button, ButtonLink } from "@/components/ui/button";
import { signOut } from "../(school)/actions";

export const metadata: Metadata = { title: "School OS is paused" };
export const dynamic = "force-dynamic";

export default async function PausedPage() {
  const current = await getCurrent();
  if (!current) redirect("/sign-in");
  if (!isPaused(current)) redirect("/dashboard");
  const closed = current.schoolStatus === "CLOSED";
  const admin = pausedAdmin(current);
  const plan = admin ? await schoolPlanState(current.school.id) : null;
  const support = plan?.support ?? null;

  if (!admin) {
    return (
      <AuthFrame eyebrow={current.school.name} title={closed ? "School OS is closed for this school" : "School OS is paused for this school"}
        sub="Nobody at the school can work in School OS just now. Your School Admin knows why and what to do. Nothing you entered is lost.">
        <form action={signOut}><Button type="submit" variant="primary" size="lg" className="w-full" icon={LogOut}>Sign out</Button></form>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame eyebrow={current.school.name} title={closed ? "School OS is closed for this school" : "School OS is paused for this school"}
      sub={closed
        ? <>Staff cannot sign in. The school&apos;s data is kept{plan?.keepUntil ? <> until <b className="font-semibold text-ink">{plan.keepUntil}</b></> : null}, and you can download it until then.</>
        : <>Staff cannot sign in until it is paid. Nothing is lost{plan?.keepUntil ? <>: the school&apos;s data is kept until <b className="font-semibold text-ink">{plan.keepUntil}</b></> : null}.</>}>
      <div className="flex flex-col gap-3">
        {!closed && plan?.invoices.map((i) => (
          <div key={i.number} className="rounded-xl bg-sunken p-3.5 flex flex-wrap items-center gap-3">
            <CreditCard size={20} className="text-brand shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14.5px]">Invoice {i.number}</p>
              <p className="text-[13px] text-ink3 tnum">{i.total} · due {i.dueOn}</p>
            </div>
            {i.payUrl && <a href={i.payUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center h-10 px-4 rounded-xl bg-brand text-brandink font-semibold text-[14px]">Pay now</a>}
          </div>
        ))}
        {!closed && plan && plan.invoices.length === 0 && <p className="text-[14px] text-ink2">There is no invoice to pay online. Call DREAM TEAM to start School OS again.</p>}
        <ButtonLink href="/settings/data-security" variant="secondary" size="lg" className="w-full" icon={Download}>Download the school&apos;s data</ButtonLink>
        {support && <ButtonLink href={`tel:${support.replace(/\s/g, "")}`} variant="secondary" size="lg" className="w-full" icon={PhoneCall}>Call DREAM TEAM, {support}</ButtonLink>}
        <form action={signOut}><Button type="submit" variant="ghost" size="lg" className="w-full" icon={LogOut}>Sign out</Button></form>
        <p className="text-[12.5px] text-ink3">After a payment, School OS starts again within a few minutes and everyone can sign in as before.</p>
      </div>
    </AuthFrame>
  );
}
