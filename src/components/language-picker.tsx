"use client";

// A small "Language" choice for pages with no sign-in: each language in its own script.
import { KeepSelect } from "@/components/ui/keep-select";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { chooseBrowserLanguage } from "@/lib/i18n/actions";
import { LANGUAGE_OWN_NAME, type Lang } from "@/lib/i18n/languages";
import { useT } from "@/lib/i18n/client";
import { cx } from "@/components/ui/cx";

export function LanguagePicker({ value, choices, className, tone = "plain" }: { value: Lang; choices: readonly Lang[]; className?: string; tone?: "plain" | "onBrand" }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (choices.length < 2) return null;
  return (
    <label className={cx("inline-flex items-center gap-1.5 text-[13px] font-semibold", tone === "onBrand" ? "text-brandink" : "text-ink2", className)}>
      <Languages size={15} aria-hidden="true" />
      <span className="sr-only">{t("Language")}</span>
      <KeepSelect value={value} disabled={pending} aria-label={t("Language")}
        onChange={(e) => {
          const fd = new FormData();
          fd.set("lang", e.target.value);
          start(async () => { await chooseBrowserLanguage(fd); router.refresh(); });
        }}
        className={cx("h-9 rounded-lg border px-2 text-[13px] font-semibold outline-none cursor-pointer",
          tone === "onBrand" ? "bg-white/15 border-white/25 text-brandink [&>option]:text-ink" : "bg-surface border-line text-ink")}>
        {choices.map((l) => <option key={l} value={l} lang={l}>{LANGUAGE_OWN_NAME[l]}</option>)}
      </KeepSelect>
    </label>
  );
}
