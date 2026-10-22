// The frame of pages a parent opens from a message, with no login (parent.jsx): the school's
// coloured header with its name, a greeting, and white cards overlapping the header below.
import { Lock } from "lucide-react";
import { englishT, type T } from "@/lib/i18n/t";

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 14a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12 3.5v2M4.6 6.6l1.4 1.4M19.4 6.6 18 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M3 17.5h18M6 21h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function PhoneShell({ schoolName, kind, hello, name, schoolPhone, children, right, framed, t = englishT }: {
  schoolName?: string; kind?: string; hello?: string; name?: React.ReactNode; schoolPhone?: string | null; children: React.ReactNode; right?: React.ReactNode;
  /** The page's language (Parent Link and the other pages a parent opens). */
  t?: T;
  /** Inside a phone frame on a staff screen (the preview), not the whole browser window. */
  framed?: boolean;
}) {
  const Body = framed ? "div" : "main";
  return (
    <div className={framed ? "bg-bg" : "min-h-dvh bg-bg"}>
      <div className="mx-auto max-w-xl pb-10">
        <header className={`bg-brand text-brandink px-5 pt-5 pb-16 relative overflow-hidden ${framed ? "" : "sm:rounded-b-[28px]"}`}>
          <div className="absolute inset-0 dotgrid opacity-50" aria-hidden="true" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-white/15 grid place-items-center shrink-0"><Mark /></span>
              <div className="min-w-0"><p className="font-display font-semibold text-[15px] leading-tight truncate">{schoolName ?? "School OS"}</p><p className="text-[11.5px] opacity-75">{kind ?? t("Parent Link")}</p></div>
            </div>
            {right}
          </div>
          {hello && <p className="relative mt-5 text-[14px] opacity-80">{hello}</p>}
          {name && <h1 className="relative font-display text-[26px] font-semibold leading-tight">{name}</h1>}
          {!hello && !name && <div className="h-8" />}
        </header>
        <Body id={framed ? undefined : "main"} className="px-4 -mt-12 relative flex flex-col gap-4">
          {children}
          <div className="text-center text-[12.5px] text-ink3 px-6 pt-2">
            {schoolPhone && <>{t("Questions? Call the school office")}<br /><a href={`tel:${schoolPhone}`} className="font-semibold text-ink2 tnum">{schoolPhone}</a></>}
            <p className="mt-3 flex items-center justify-center gap-1.5"><Lock size={12} aria-hidden="true" />{t("Only you can see this page")}</p>
          </div>
        </Body>
      </div>
    </div>
  );
}

/** A white card on the phone page. */
export function PhoneCard({ children, className = "", ...rest }: React.HTMLAttributes<HTMLElement>) {
  return <section className={`rounded-3xl bg-surface border border-line shadow-card p-5 ${className}`} {...rest}>{children}</section>;
}

/** A message in place of the page (link not working, switched off, closed). */
export function PhoneNotice({ title, icon, children }: { title: string; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <PhoneCard className="flex flex-col items-center text-center gap-2 py-8">
      {icon && <span className="w-14 h-14 rounded-2xl bg-sunken text-ink3 grid place-items-center mb-1" aria-hidden="true">{icon}</span>}
      <h2 className="font-semibold text-[17px]">{title}</h2>
      {children && <div className="text-[14px] text-ink2 max-w-sm">{children}</div>}
    </PhoneCard>
  );
}
