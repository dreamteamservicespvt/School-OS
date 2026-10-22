// The frame around the public admission pages: the school's name on top, no
// menus, readable on a phone.
import { Avatar } from "@/components/ui/avatar";
import { LanguagePicker } from "@/components/language-picker";
import { I18nProvider } from "@/lib/i18n/client";
import { catalogueFor } from "@/lib/i18n/server";
import type { Lang } from "@/lib/i18n/languages";
import type { T } from "@/lib/i18n/t";

/** In the parent's chosen language among the school's languages (src/lib/i18n/server.ts, schoolPageLanguage). */
export function ApplyShell({ schoolName, sub, page, children }: { schoolName: string; sub?: string; page: { lang: Lang; choices: Lang[]; t: T }; children: React.ReactNode }) {
  return (
    <I18nProvider lang={page.lang} dict={catalogueFor(page.lang)}>
    <div className="min-h-dvh bg-bg" lang={page.lang}>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
          <Avatar name={schoolName} size={38} />
          <div className="min-w-0">
            <p className="font-semibold text-[15px] leading-tight truncate">{schoolName}</p>
            <p className="text-[12.5px] text-ink3">{sub ?? page.t("Admissions")}</p>
          </div>
          <LanguagePicker value={page.lang} choices={page.choices} className="ml-auto shrink-0" />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 pt-5 pb-12">{children}</main>
    </div>
    </I18nProvider>
  );
}

export function ApplyNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h1 className="font-display text-[20px] font-semibold">{title}</h1>
      <div className="mt-2 text-[14.5px] text-ink2">{children}</div>
    </div>
  );
}
