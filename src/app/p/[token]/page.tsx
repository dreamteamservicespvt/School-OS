// The guardian's Parent Link page (no login). Shows only this guardian's own
// children; every open is checked on the server and logged (rule 31).
import type { Metadata } from "next";
import { cache } from "react";
import { cookies } from "next/headers";
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { deviceCookieName, findLink, openLink } from "@/lib/parent-link/links";
import { loadGuardianView } from "@/lib/parent-link/view";
import { loadSections } from "@/lib/parent-link/render";
import { GuardianPage } from "@/components/parent-link/guardian-page";
import { VerifyPhone } from "@/components/parent-link/verify-phone";
import { PhoneNotice, PhoneShell } from "@/components/parent-link/phone-shell";
import { Link2Off, PowerOff, UserX } from "lucide-react";
import { parentLinkLanguage } from "@/lib/parent-link/language";
import { browserLanguage, catalogueFor, makeT, titleIn } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { LanguagePicker } from "@/components/language-picker";
import type { Lang } from "@/lib/i18n/languages";
import type { T } from "@/lib/i18n/t";

export const dynamic = "force-dynamic";

/**
 * Once per request, for the page and its tab title alike: the rate limit, the link and its
 * language (this phone's choice, the guardian's language, the school's default). Before the link
 * is known, or when it is not real: the language chosen on this phone, or English.
 */
const openGate = cache(async (token: string) => {
  const device = await deviceInfo();
  const browser = makeT((await browserLanguage()) ?? "en");
  const limited = await hitLimit(`pl-open:ip:${device.ipAddress ?? "unknown"}`, 60, 600);
  const found = limited.ok ? await findLink(token) : null;
  const l = found ? await parentLinkLanguage(found) : null;
  return { device, limited, found, t: l ? makeT(l.lang) : browser, choices: l?.choices ?? ([] as Lang[]) };
});

/** The tab title in the same language as the page. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { t } = await openGate((await params).token);
  return { title: titleIn(t, "Parent Link"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

function Notice({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <PhoneNotice title={title} icon={icon}>{children}</PhoneNotice>;
}

/** The page in the guardian's language, with a choice of the school's languages in the header. */
function Shell({ schoolName, children, hello, name, t, choices }: { schoolName?: string; children: React.ReactNode; hello?: string; name?: string; t: T; choices: Lang[] }) {
  return (
    <I18nProvider lang={t.lang} dict={catalogueFor(t.lang)}>
      <div lang={t.lang}>
        <PhoneShell schoolName={schoolName} hello={hello} name={name} t={t} right={<LanguagePicker value={t.lang} choices={choices} tone="onBrand" />}>{children}</PhoneShell>
      </div>
    </I18nProvider>
  );
}

export default async function ParentLinkPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ child?: string; month?: string }> }) {
  const { token } = await params;
  const { child, month } = await searchParams;
  const { device, limited, found, t, choices } = await openGate(token);
  if (!limited.ok) return <Shell t={t} choices={choices}><Notice title={t("Please wait a moment")}>{limitMessage(limited)}</Notice></Shell>;

  const key = found ? (await cookies()).get(deviceCookieName(found.linkId))?.value ?? null : null;
  const state = found ? await openLink(token, key, device) : { state: "invalid" as const };

  if (state.state === "invalid") {
    // Wrong links count more heavily, so guessing is slow.
    await hitLimit(`pl-open:ip:${device.ipAddress ?? "unknown"}`, 60, 600);
    return <Shell t={t} choices={choices}><Notice title={t("This link does not work")} icon={<Link2Off size={26} />}>{t("Please check you opened the whole link from the school’s message, or ask the school for a new one.")}</Notice></Shell>;
  }
  if (state.state === "revoked") {
    return (
      <Shell schoolName={state.schoolName} t={t} choices={choices}>
        <Notice title={t("This link is no longer active")} icon={<Link2Off size={26} />}>
          {t("Please ask the school for a new one.")}{state.schoolPhone && <> {t("Call")} <a className="font-medium text-brand underline" href={`tel:${state.schoolPhone}`}>{state.schoolPhone}</a>.</>}
        </Notice>
      </Shell>
    );
  }
  if (state.state === "off") {
    return (
      <Shell schoolName={state.schoolName} t={t} choices={choices}>
        <Notice title={t("Parent Link is switched off")} icon={<PowerOff size={24} />}>
          {t("The school has switched off Parent Link for now. To ask a question, message or call the school.")}{state.schoolPhone ? <> <a className="font-medium text-brand underline" href={`tel:${state.schoolPhone}`}>{state.schoolPhone}</a></> : null}
        </Notice>
      </Shell>
    );
  }
  if (state.state === "verify") {
    return (
      <Shell schoolName={state.schoolName} hello={t("Welcome to")} name={t("Your Parent Link")} t={t} choices={choices}>
        <VerifyPhone token={token} maskedPhone={state.maskedPhone} codeSent={Boolean(state.codeSentAt)} />
      </Shell>
    );
  }

  const ctx = { schoolId: state.schoolId, userId: null };
  const result = await withSchool(ctx, async (tx) => {
    const view = await loadGuardianView(tx, ctx, { linkId: state.linkId, guardianId: state.guardianId, childId: child ?? null, token, preview: false, lang: t.lang });
    if (!view) return null;
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { phone: true } });
    return { view, sections: await loadSections(tx, ctx, { ...view, month: typeof month === "string" ? month : null }), phone: school.phone };
  });
  if (!result) {
    return <Shell schoolName={state.schoolName} t={t} choices={choices}><Notice title={t("No children to show")} icon={<UserX size={24} />}>{t("None of your children is studying in the school right now. Please call the school if this is wrong.")}</Notice></Shell>;
  }
  return (
    <I18nProvider lang={result.view.lang} dict={catalogueFor(result.view.lang)}>
      <div lang={result.view.lang}>
        <GuardianPage view={result.view} sections={result.sections} schoolPhone={result.phone} basePath={`/p/${token}`}
          right={<LanguagePicker value={result.view.lang} choices={result.view.languages} tone="onBrand" />} />
      </div>
    </I18nProvider>
  );
}
