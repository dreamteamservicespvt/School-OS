// The online admission form (02 §2, §10): parents apply on their phone
// without a login. Found by the school's code; closed when the school has
// not switched online applications on.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { schoolByCode, publicForm } from "@/lib/admission/public";
import { RELATIONS } from "@/lib/admission/applications";
import { UUID_RE } from "@/lib/admission/act";
import { ApplyForm } from "./apply-form";
import { ApplyNotice, ApplyShell } from "./shell";
import { schoolPageLanguage } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Apply for admission", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ApplyPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ class?: string }> }) {
  const { code } = await params;
  const school = await schoolByCode(decodeURIComponent(code));
  if (!school) notFound();
  const form = await publicForm(school.id);
  const preset = (await searchParams).class;
  const presetOk = preset && UUID_RE.test(preset) && form.classes.some((c) => c.id === preset) ? preset : null;
  const phone = form.school.phone;
  const page = await schoolPageLanguage(school.id);
  const { t } = page;
  return (
    <ApplyShell schoolName={form.school.name} sub={form.year ? t("Admissions {year}", { year: form.year.name }) : t("Admissions")} page={page}>
      {!form.open || !form.year ? (
        <ApplyNotice title={t("Online applications are closed")}>
          {t("The school is not taking applications online just now.")} {phone ? <>{t("Please call the school office on")} <a className="font-semibold text-brand underline tnum" href={`tel:${phone}`}>{phone}</a>.</> : t("Please contact the school office.")}
        </ApplyNotice>
      ) : (
        <>
          <h1 className="font-display text-[24px] font-semibold leading-tight">{t("Apply for admission")}</h1>
          <p className="text-[14px] text-ink3 mt-1 mb-5">{t("Fill this in on your phone. It takes about 5 minutes. Fields marked * are needed.")}</p>
          <ApplyForm code={form.school.code} yearId={form.year.id} yearName={form.year.name} preset={presetOk}
            classes={form.classes} consents={form.consents.map((c) => ({ type: c.type, title: c.title, text: c.text, required: c.required }))}
            categories={form.categories} sources={form.sources.map((s) => ({ key: s.key, label: s.label }))} relations={RELATIONS.filter((r) => r !== "Father" && r !== "Mother")} onlinePayment={form.onlinePayment} />
        </>
      )}
    </ApplyShell>
  );
}
