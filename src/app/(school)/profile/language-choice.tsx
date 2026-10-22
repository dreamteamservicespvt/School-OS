"use client";

// My profile, Language (00-global.md §1.4): the person's own screen language, from the
// languages the school has switched on. Saved as soon as it is chosen.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setScreenLanguage } from "../actions";
import { useT } from "@/lib/i18n/client";
import { LANGUAGE_ENGLISH_NAME, LANGUAGE_OWN_NAME, type Lang } from "@/lib/i18n/languages";
import { cx } from "@/components/ui/cx";

export function LanguageChoice({ chosen, languages, schoolDefault }: { chosen: Lang | null; languages: Lang[]; schoolDefault: Lang }) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState<string>(chosen ?? "");
  const [pending, start] = useTransition();
  const save = (v: string) => {
    setValue(v);
    const fd = new FormData();
    fd.set("language", v);
    start(async () => { await setScreenLanguage(fd); router.refresh(); });
  };
  const options: { value: string; own: string; sub: string }[] = [
    { value: "", own: t("The school's language"), sub: `${LANGUAGE_OWN_NAME[schoolDefault]} · ${t("changes if the school changes it")}` },
    ...languages.map((l) => ({ value: l, own: LANGUAGE_OWN_NAME[l], sub: LANGUAGE_ENGLISH_NAME[l] })),
  ];
  return (
    <div className="px-5 pb-5">
      <div role="radiogroup" aria-label={t("Screen language")} aria-busy={pending || undefined} className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button key={o.value || "school"} type="button" role="radio" aria-checked={on} disabled={pending} onClick={() => save(o.value)}
              lang={o.value || undefined}
              className={cx("flex items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 text-left transition", on ? "border-brand bg-brand/5" : "border-line hover:border-ink3/40")}>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold">{o.own}</span>
                <span className="block text-[12px] text-ink3">{o.sub}</span>
              </span>
              {on && <Check size={18} className="text-brand shrink-0" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[12.5px] text-ink3">{t("Screens show in this language. Names, numbers and dates stay as they are written. Words not yet translated show in English.")}</p>
    </div>
  );
}
