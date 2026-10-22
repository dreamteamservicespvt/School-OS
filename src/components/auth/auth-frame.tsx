import { CalendarCheck2, CheckCheck, IndianRupee, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { LanguagePicker } from "@/components/language-picker";
import { I18nProvider } from "@/lib/i18n/client";
import { catalogueFor, makeT, screenLanguage } from "@/lib/i18n/server";
import { SCREEN_LANGUAGES } from "@/lib/i18n/languages";
import { tx } from "@/lib/i18n/tx";

/**
 * The sign-in pages of the approved design (design/ui-prototype/src/signin.jsx):
 * a brand panel on computers, the form on the right, one column on phones.
 * In the person's screen language; with `pickLanguage`, a choice of the eight languages (no school is known yet).
 */
export async function AuthFrame({ eyebrow, title, sub, pickLanguage, children }: { eyebrow?: string; title: string; sub?: React.ReactNode; pickLanguage?: boolean; children: React.ReactNode }) {
  const lang = await screenLanguage();
  const t = makeT(lang);
  return (
    <I18nProvider lang={lang} dict={catalogueFor(lang)}>
    <div className="min-h-dvh grid lg:grid-cols-[1.05fr_1fr] bg-surface">
      <div className="hidden lg:flex relative overflow-hidden bg-brand text-brandink p-10 flex-col">
        <div className="absolute inset-0 dotgrid opacity-60" aria-hidden="true" />
        <div className="absolute -left-24 -bottom-40 w-[520px] h-[520px] rounded-full border-[56px] border-white/[.07]" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M5 14a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><path d="M12 3.5v2M4.6 6.6l1.4 1.4M19.4 6.6 18 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M3 17.5h18M6 21h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          </span>
          <span className="font-display font-semibold text-lg">School OS</span>
        </div>
        <div className="relative mt-auto max-w-md">
          <p className="font-display text-[44px] font-semibold leading-[1.15] tracking-tight">{t("Your whole school, in one calm place.")}</p>
          <p className="mt-4 text-[16px] opacity-80 leading-relaxed">{t("Attendance, fees, students and parents. Everything you need today is on the first screen.")}</p>
        </div>
        <ul className="relative mt-10 flex flex-col gap-3 max-w-sm" aria-label={t("What School OS does")}>
          <li className="self-start rounded-2xl bg-white/12 backdrop-blur px-4 py-3 flex items-center gap-3 animate-rise [animation-delay:.1s]">
            <CalendarCheck2 size={20} aria-hidden="true" /><span className="text-[14px]">{t("Attendance for a class in under a minute")}</span>
          </li>
          <li className="self-end rounded-2xl bg-white/12 backdrop-blur px-4 py-3 flex items-center gap-3 animate-rise [animation-delay:.25s]">
            <IndianRupee size={20} aria-hidden="true" /><span className="text-[14px]">{t("Fees collected with a receipt every time")}</span>
          </li>
          <li className="self-start rounded-2xl bg-white/12 backdrop-blur px-4 py-3 flex items-center gap-3 animate-rise [animation-delay:.4s]">
            <CheckCheck size={20} aria-hidden="true" /><span className="text-[14px]">{t("Messages seen by parents on WhatsApp")}</span>
          </li>
        </ul>
      </div>

      <main className="flex flex-col px-5 py-8 md:px-12 min-h-dvh">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-3 lg:hidden"><Logo size={40} /><span className="font-display font-semibold text-lg">School OS</span></span>
          {pickLanguage && <LanguagePicker value={lang} choices={SCREEN_LANGUAGES} className="ml-auto" />}
        </div>
        <div className="my-auto w-full max-w-[400px] mx-auto py-10">
          {eyebrow && <p className="text-[13px] font-semibold text-brand">{tx(eyebrow)}</p>}
          <h1 className="font-display text-[30px] font-semibold tracking-tight leading-tight mt-1">{tx(title)}</h1>
          {sub && <p className="text-ink3 mt-1.5 text-[15px]">{sub}</p>}
          <div className="mt-7">{children}</div>
        </div>
        <p className="text-[12.5px] text-ink3 text-center flex items-center justify-center gap-1.5"><ShieldCheck size={14} aria-hidden="true" />{t("Protected sign-in · Works on phone, tablet and computer")}</p>
      </main>
    </div>
    </I18nProvider>
  );
}
