import { LifeBuoy, School, Send, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/shell/logo";

/**
 * The console's own sign-in pages (design/ui-prototype superadmin.jsx SuperAdminSignIn):
 * a brand panel on computers, the form on the right, one column on phones.
 */
export function ConsoleFrame({ children, foot = "Every console action is written in the Activity Log" }: { children: React.ReactNode; foot?: string }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.05fr_1fr] bg-surface">
      <div className="hidden lg:flex relative overflow-hidden bg-brand text-brandink p-10 flex-col">
        <div className="absolute inset-0 dotgrid opacity-60" aria-hidden="true" />
        <div className="absolute -left-24 -bottom-40 w-[520px] h-[520px] rounded-full border-[56px] border-white/[.07]" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M5 14a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><path d="M12 3.5v2M4.6 6.6l1.4 1.4M19.4 6.6 18 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M3 17.5h18M6 21h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          </span>
          <span className="leading-tight"><span className="block font-display font-semibold text-lg">School OS Console</span><span className="block text-[13px] opacity-75">DREAM TEAM SERVICES</span></span>
        </div>
        <div className="relative mt-auto max-w-md">
          <p className="font-display text-[44px] font-semibold leading-[1.05] tracking-tight">Every school, from one calm console.</p>
          <p className="mt-4 text-[16px] opacity-80 leading-relaxed">Add a school, hand over its first login, and help when a school asks. Student, fee and staff details stay inside each school.</p>
        </div>
        <ul className="relative mt-10 flex flex-col gap-3 max-w-sm" aria-label="What the console does">
          <li className="self-start rounded-2xl bg-white/12 backdrop-blur px-4 py-3 flex items-center gap-3 animate-rise [animation-delay:.1s]">
            <School size={20} aria-hidden="true" /><span className="text-[14px]"><b>Every school</b> and its status at a glance</span>
          </li>
          <li className="self-end rounded-2xl bg-white/12 backdrop-blur px-4 py-3 flex items-center gap-3 animate-rise [animation-delay:.25s]">
            <Send size={20} aria-hidden="true" /><span className="text-[14px]">Invite sent to <b>the first School Admin</b></span>
          </li>
          <li className="self-start rounded-2xl bg-white/12 backdrop-blur px-4 py-3 flex items-center gap-3 animate-rise [animation-delay:.4s]">
            <LifeBuoy size={20} aria-hidden="true" /><span className="text-[14px]">Counts only: <b>never a student’s details</b></span>
          </li>
        </ul>
      </div>

      <main className="flex flex-col px-5 py-8 md:px-12 min-h-dvh">
        <div className="flex items-center gap-3 lg:hidden">
          <Logo size={40} />
          <span className="leading-tight"><span className="block font-display font-semibold text-lg">School OS Console</span><span className="block text-[12.5px] text-ink3">DREAM TEAM SERVICES</span></span>
        </div>
        <div className="my-auto w-full max-w-[400px] mx-auto py-10">{children}</div>
        <p className="text-[12.5px] text-ink3 text-center flex items-center justify-center gap-1.5"><ShieldCheck size={14} aria-hidden="true" />{foot}</p>
      </main>
    </div>
  );
}

/** Password, then One-time code. */
export function StepDots({ step, labels = ["Password", "One-time code"] }: { step: number; labels?: string[] }) {
  return (
    <ol className="mt-6 flex items-center gap-2 text-[12.5px] font-semibold" aria-label={`Step ${step} of ${labels.length}`}>
      {labels.map((l, i) => (
        <li key={l} className="contents">
          {i > 0 && <span className="flex-1 h-px bg-line" aria-hidden="true" />}
          <span className={`inline-flex items-center gap-1.5 ${step === i + 1 ? "text-brand" : step > i + 1 ? "text-ok" : "text-ink3"}`} aria-current={step === i + 1 ? "step" : undefined}>
            <span className={`w-6 h-6 rounded-full grid place-items-center text-[11.5px] font-bold tnum ${step === i + 1 ? "bg-brand text-brandink" : step > i + 1 ? "bg-ok/15 text-ok" : "bg-sunken text-ink3"}`}>
              {step > i + 1 ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg> : i + 1}
            </span>
            {l}
          </span>
        </li>
      ))}
    </ol>
  );
}
