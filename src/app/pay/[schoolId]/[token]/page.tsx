// The page a payment link opens (no login): what is being paid, for whom, and
// a Pay button that opens Razorpay Checkout. Once paid, the receipt.
import type { Metadata } from "next";
import { CircleCheck, Clock, Download, School } from "lucide-react";
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { formatDate, formatRupees } from "@/lib/format";
import { payPageData } from "@/lib/fees/online";
import { buttonClass } from "@/components/ui/button";
import { PayButton } from "./pay-button";
import { I18nProvider } from "@/lib/i18n/client";
import { browserLanguage, catalogueFor, makeT, schoolPageLanguage } from "@/lib/i18n/server";
import { LanguagePicker } from "@/components/language-picker";
import type { Lang } from "@/lib/i18n/languages";
import type { T } from "@/lib/i18n/t";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pay school fees", robots: { index: false, follow: false }, referrer: "no-referrer" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** In the parent's chosen language among the school's languages. */
function Shell({ school, children, t, choices = [] }: { school?: string; children: React.ReactNode; t: T; choices?: Lang[] }) {
  return (
    <I18nProvider lang={t.lang} dict={catalogueFor(t.lang)}>
    <div className="min-h-dvh bg-bg" lang={t.lang}>
      <div className="mx-auto max-w-lg px-4 pb-10 pt-6">
        <header className="mb-5 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-brand text-brandink grid place-items-center shrink-0"><School size={20} aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="font-display font-semibold text-[17px] leading-tight truncate">{school ?? t("School fees")}</p>
            <p className="text-[13px] text-ink3">{t("Secure payment by Razorpay")}</p>
          </div>
          <LanguagePicker value={t.lang} choices={choices} className="ml-auto shrink-0" />
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
    </I18nProvider>
  );
}

function Notice({ title, children, tone = "neutral" }: { title: string; children: React.ReactNode; tone?: "neutral" | "ok" | "warn" }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-surface p-5 shadow-card">
      <h1 className={tone === "ok" ? "font-display text-[22px] font-semibold text-ok" : "font-display text-[22px] font-semibold"}>{title}</h1>
      <div className="mt-2 text-[15px] text-ink2">{children}</div>
    </div>
  );
}

export default async function PayPage({ params }: { params: Promise<{ schoolId: string; token: string }> }) {
  const { schoolId, token } = await params;
  const device = await deviceInfo();
  const first = makeT((await browserLanguage()) ?? "en");
  const limited = await hitLimit(`pay-open:ip:${device.ipAddress ?? "unknown"}`, 60, 600);
  if (!limited.ok) return <Shell t={first}><Notice title={first("Please wait a moment")}>{limitMessage(limited)}</Notice></Shell>;
  const bad = <Shell t={first}><Notice title={first("This link does not work")}>{first("Please check you opened the whole link from the school’s message, or ask the school for a new one.")}</Notice></Shell>;
  if (!UUID.test(schoolId) || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return bad;
  const data = await withSchool({ schoolId, userId: null }, (tx) => payPageData(tx, { schoolId, userId: null }, token)).catch(() => null);
  if (!data || !data.student) return bad;
  const { link, school, student, rows, stillDue, payment, receipt, expired } = data;
  const { t, choices } = await schoolPageLanguage(schoolId);
  const phone = school.phone ? <> {t("Call the school on")} <a className="font-semibold text-brand underline" href={`tel:${school.phone}`}>{school.phone}</a>.</> : null;

  const head = (
    <div className="rounded-2xl border border-line/70 bg-surface shadow-card overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <p className="eyebrow text-ink3">{t("School fees for")}</p>
        <h1 className="font-display text-[22px] font-semibold leading-tight mt-1">{student.name}</h1>
        <p className="text-[14px] text-ink3">{student.classSection} · <span className="font-mono text-[13px]">{student.admissionNo}</span></p>
      </div>
      <ul className="border-t border-line divide-y divide-line/70">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-[14.5px]">
            <span className="min-w-0 flex-1"><b className="font-semibold">{t.any(r.head)}</b> <span className="text-ink3">· {r.label}</span><span className="block text-[12.5px] text-ink3">{t("Due on {date}", { date: formatDate(r.dueDate) })}</span></span>
            {r.paid ? <span className="text-ok font-semibold text-[13px]">{t("Paid")}</span> : <span className="tnum font-semibold">{formatRupees(r.balance)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );

  if (payment && payment.status === "POSTED") {
    return (
      <Shell school={school.name} t={t} choices={choices}>
        <div className="rounded-2xl border border-line/70 bg-surface p-6 shadow-card text-center">
          <span className="mx-auto w-16 h-16 rounded-full bg-ok text-surface grid place-items-center shadow-pop"><CircleCheck size={34} aria-hidden="true" /></span>
          <h1 className="font-display text-[24px] font-semibold mt-4 tnum">{t("{amount} received", { amount: formatRupees(payment.amountPaise) })}</h1>
          <p className="text-ink3 text-[14px] mt-1">{receipt ? t("Thank you. {name}’s fees are paid, receipt {number}.", { name: student.name, number: receipt.number }) : t("Thank you. {name}’s fees are paid.", { name: student.name })}</p>
          {receipt && <a href={`/pay/${schoolId}/${token}/receipt`} className={buttonClass("primary", "lg", "mt-5 w-full")}><Download size={18} aria-hidden="true" />{t("Download receipt")}</a>}
        </div>
      </Shell>
    );
  }
  if (link.status === "CANCELLED") return <Shell school={school.name} t={t} choices={choices}><Notice title={t("This link was cancelled")}>{t("The school cancelled this payment link. Please ask the school for a new one.")}{phone}</Notice></Shell>;
  if (expired || link.status === "EXPIRED") return <Shell school={school.name} t={t} choices={choices}><Notice title={t("This link has expired")}>{t("Payment links work for 7 days. Please ask the school for a new one.")}{phone}</Notice></Shell>;
  if (stillDue <= BigInt(0)) return <Shell school={school.name} t={t} choices={choices}>{head}<div className="mt-4"><Notice title={t("Nothing more to pay")} tone="ok">{t("These fees are already paid. Thank you.")}</Notice></div></Shell>;
  if (payment && payment.status === "WAITING") return <Shell school={school.name} t={t} choices={choices}><Notice title={t("Payment being checked")}><Clock size={16} className="inline mr-1 -mt-0.5" aria-hidden="true" />{t("Your payment reached the school and is being checked. The receipt comes on WhatsApp once it is confirmed.")}</Notice></Shell>;

  return (
    <Shell school={school.name} t={t} choices={choices}>
      {head}
      <div className="mt-4 rounded-2xl border border-line/70 bg-surface p-5 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[14px] text-ink3">{t("To pay now")}</p>
          <p className="font-display text-[28px] font-semibold tnum">{formatRupees(stillDue)}</p>
        </div>
        <PayButton schoolId={schoolId} token={token} amount={formatRupees(stillDue)} />
        <p className="text-[12.5px] text-ink3 mt-3">{t("UPI, cards and net banking. This link works till {date}. The school never asks for your card number or OTP on a call.", { date: formatDate(link.expiresAt) })}</p>
      </div>
    </Shell>
  );
}
